import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../db';
import { reloj } from '../lib/reloj';
import { desvincularCuentasCaducadas, DIAS_RECUPERACION } from '../servicios/bajas';
import { anonimo, clienteConCoche, emailsA, entrar, ordenEnDiagnostico, reiniciarBd, reservar, tallerAbierto } from './ayudas';

beforeEach(reiniciarBd);

const DIA = 86_400_000;

describe('darse de baja (autobaja)', () => {
  it('el usuario se da de baja: cuenta desactivada, sesión cerrada, constancia y email', async () => {
    reloj.fijar(new Date('2026-11-09T09:00:00Z'));
    const ana = await entrar('ana@cliente.test');
    const r = await ana.post('/api/perfil/baja').send({ confirmacion: 'DAR DE BAJA', motivo: 'Me mudo' });
    expect(r.status).toBe(204);
    expect(r.headers['set-cookie']?.[0]).toMatch(/taller_sesion=;/);
    const u = await prisma.usuario.findUniqueOrThrow({ where: { id: ana.usuarioId } });
    expect(u).toMatchObject({ activo: false, desvinculadoEn: null });
    expect(u.bajaSolicitadaEn?.toISOString()).toBe('2026-11-09T09:00:00.000Z');
    expect(await prisma.registroEliminacion.findFirstOrThrow()).toMatchObject({ entidad: 'Usuario', entidadId: ana.usuarioId, modo: 'BAJA', motivo: 'Me mudo' });
    expect((await emailsA('ana@cliente.test')).map((e) => e.plantilla)).toContain('BAJA_CUENTA');
    expect((await ana.get('/api/auth/me')).status).toBe(401); // la cookie de esta sesión ya no vale
  });

  it('exige escribir la confirmación', async () => {
    const ana = await entrar('ana@cliente.test');
    expect((await ana.post('/api/perfil/baja').send({ confirmacion: 'si' })).status).toBe(400);
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id: ana.usuarioId } })).activo).toBe(true);
  });

  it('dentro de los 14 días puede entrar, pero solo para recuperar la cuenta o salir', async () => {
    reloj.fijar(new Date('2026-11-09T09:00:00Z'));
    const ana = await clienteConCoche();
    await ana.post('/api/perfil/baja').send({ confirmacion: 'DAR DE BAJA' });
    reloj.fijar(new Date(Date.parse('2026-11-09T09:00:00Z') + (DIAS_RECUPERACION - 1) * DIA));
    const otra = await entrar('ana@cliente.test', 'CLIENTE', { sinPerfil: true });
    expect(otra.usuarioId).toBe(ana.usuarioId);
    const me = (await otra.get('/api/auth/me')).body;
    expect(me.enBaja).toEqual({ desde: '2026-11-09T09:00:00.000Z', hasta: '2026-11-23T09:00:00.000Z' });
    for (const r of [await otra.get('/api/vehiculos'), await otra.get('/api/ordenes'), await otra.post('/api/vehiculos').send({ matricula: '9999ZZZ', marca: 'x', modelo: 'y' })]) {
      expect(r.status).toBe(403);
      expect(r.body.codigo).toBe('CUENTA_EN_BAJA');
    }
    expect((await otra.post('/api/perfil/reactivar').send({})).status).toBe(200);
    expect((await otra.get('/api/auth/me')).body.enBaja).toBeNull();
    expect((await otra.get('/api/vehiculos')).body.datos).toHaveLength(1);
    expect(await prisma.usuario.findUniqueOrThrow({ where: { id: ana.usuarioId } })).toMatchObject({ activo: true, bajaSolicitadaEn: null });
  });

  it('reactivar una cuenta activa da 409', async () => {
    const ana = await entrar('ana@cliente.test');
    expect((await ana.post('/api/perfil/reactivar').send({})).status).toBe(409);
  });

  it('pasados 14 días se desliga Google y se libera el email; el historial se conserva', async () => {
    reloj.fijar(new Date('2026-11-09T09:00:00Z'));
    const ana = await clienteConCoche();
    await prisma.usuario.update({ where: { id: ana.usuarioId }, data: { googleId: 'google-123' } });
    await ana.post('/api/perfil/baja').send({ confirmacion: 'DAR DE BAJA' });
    reloj.fijar(new Date(Date.parse('2026-11-09T09:00:00Z') + (DIAS_RECUPERACION - 1) * DIA));
    expect(await desvincularCuentasCaducadas()).toBe(0); // aún no
    reloj.fijar(new Date(Date.parse('2026-11-09T09:00:00Z') + DIAS_RECUPERACION * DIA));
    expect(await desvincularCuentasCaducadas()).toBe(1);
    const u = await prisma.usuario.findUniqueOrThrow({ where: { id: ana.usuarioId } });
    expect(u.googleId).toBeNull();
    expect(u.email).not.toBe('ana@cliente.test');
    expect(u.desvinculadoEn).not.toBeNull();
    expect(await prisma.vehiculo.count({ where: { cliente: { usuarioId: ana.usuarioId } } })).toBe(1);
    // La constancia guarda el email original para poder atender reclamaciones.
    const c = await prisma.registroEliminacion.findFirstOrThrow({ where: { entidad: 'Usuario' } });
    expect(c.datos).toMatchObject({ email: 'ana@cliente.test' });
    // La misma cuenta de Google entra ahora como cliente nuevo, sin los datos antiguos.
    const nueva = await anonimo().post('/api/auth/test-login').send({ email: 'ana@cliente.test' });
    expect(nueva.status).toBe(200);
    expect(nueva.body.id).not.toBe(ana.usuarioId);
    expect(nueva.body.cliente).toBeNull();
    expect(await desvincularCuentasCaducadas()).toBe(0); // idempotente
  });

  it('una cuenta dada de baja por el dueño no se recupera entrando', async () => {
    const ana = await entrar('ana@cliente.test');
    const dueno = await entrar('dueno@taller.test', 'DUENO');
    await dueno.patch(`/api/usuarios/${ana.usuarioId}`).send({ activo: false });
    expect((await anonimo().post('/api/auth/test-login').send({ email: 'ana@cliente.test' })).status).toBe(403);
  });

  it('darse de baja cancela sus citas futuras; al recuperar la cuenta no vuelven', async () => {
    await tallerAbierto(1);
    await entrar('jefe@taller.test', 'JEFE');
    const ana = await clienteConCoche();
    const cita = (await reservar(ana)).body;
    expect((await ana.post('/api/perfil/baja').send({ confirmacion: 'DAR DE BAJA' })).status).toBe(204);
    expect((await prisma.cita.findUniqueOrThrow({ where: { id: cita.id } })).estado).toBe('CANCELADA');
    const e = (await emailsA('ana@cliente.test')).find((x) => x.plantilla === 'BAJA_CUENTA');
    expect(e?.datos).toMatchObject({ citasCanceladas: 1 });
    const otra = await entrar('ana@cliente.test', 'CLIENTE', { sinPerfil: true });
    await otra.post('/api/perfil/reactivar').send({});
    expect((await prisma.cita.findUniqueOrThrow({ where: { id: cita.id } })).estado).toBe('CANCELADA');
  });

  it('con un vehículo en el taller no se puede iniciar la baja (409) y no cambia nada', async () => {
    const { ana } = await ordenEnDiagnostico();
    const r = await ana.post('/api/perfil/baja').send({ confirmacion: 'DAR DE BAJA' });
    expect(r.status).toBe(409);
    expect(r.body.codigo).toBe('BAJA_CON_PENDIENTES');
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id: ana.usuarioId } })).activo).toBe(true);
    expect(await prisma.registroEliminacion.count()).toBe(0);
  });

  it('el dueño no puede darse de baja a sí mismo', async () => {
    const dueno = await entrar('dueno@taller.test', 'DUENO');
    expect((await dueno.post('/api/perfil/baja').send({ confirmacion: 'DAR DE BAJA' })).status).toBe(403);
  });

  it('el personal no se da de baja a sí mismo (lo hace su responsable)', async () => {
    const [mec] = await tallerAbierto(1);
    const jefe = await entrar('jefe@taller.test', 'JEFE');
    for (const a of [mec, jefe]) expect((await a.post('/api/perfil/baja').send({ confirmacion: 'DAR DE BAJA' })).status).toBe(403);
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id: mec.usuarioId } })).activo).toBe(true);
  });
});
