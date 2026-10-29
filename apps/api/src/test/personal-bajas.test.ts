import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../db';
import { anonimo, clienteConCoche, emailsA, entrar, MANANA, reiniciarBd, reservar, tallerAbierto } from './ayudas';

beforeEach(reiniciarBd);

describe('ausencias con tipo y rango (vacaciones, baja médica…)', () => {
  it('unas vacaciones de varios días crean una ausencia por día con su tipo y bajan la capacidad de cada uno', async () => {
    const [mec] = await tallerAbierto(1);
    const jefe = await entrar('jefe@taller.test', 'JEFE');
    const r = await jefe.post('/api/ausencias').send({ empleadoId: mec.empleadoId, desde: '2026-11-10', hasta: '2026-11-13', tipo: 'VACACIONES', nota: 'Puente' });
    expect(r.status).toBe(201);
    expect(r.body.dias).toBe(4);
    const aus = await prisma.ausencia.findMany({ orderBy: { fecha: 'asc' } });
    expect(aus.map((a) => a.tipo)).toEqual(['VACACIONES', 'VACACIONES', 'VACACIONES', 'VACACIONES']);
    const ana = await entrar('ana@cliente.test');
    const d = (await ana.get('/api/disponibilidad?desde=2026-11-10&hasta=2026-11-13')).body.dias;
    expect(d.map((x: { capacidad: number }) => x.capacidad)).toEqual([0, 0, 0, 0]);
    const lista = (await jefe.get('/api/ausencias?desde=2026-11-10&hasta=2026-11-30')).body.datos;
    expect(lista[0]).toMatchObject({ tipo: 'VACACIONES', nota: 'Puente' });
  });

  it('una baja médica avisa a los jefes con las citas que sobran en el periodo', async () => {
    const [mec] = await tallerAbierto(1);
    const jefe = await entrar('jefe@taller.test', 'JEFE');
    await reservar(await clienteConCoche(), MANANA);
    await jefe.post('/api/ausencias').send({ empleadoId: mec.empleadoId, desde: MANANA, hasta: '2026-11-12', tipo: 'BAJA_MEDICA' });
    const e = (await emailsA('jefe@taller.test')).filter((x) => x.plantilla === 'MECANICO_AUSENTE');
    expect(e).toHaveLength(1);
    expect(e[0].datos).toMatchObject({ tipo: 'baja médica', exceso: 1 });
  });

  it('QA: rangos al revés, demasiado largos o que pisan otra ausencia; no se crea nada a medias', async () => {
    const [mec] = await tallerAbierto(1);
    const jefe = await entrar('jefe@taller.test', 'JEFE');
    expect((await jefe.post('/api/ausencias').send({ empleadoId: mec.empleadoId, desde: '2026-11-13', hasta: '2026-11-10', tipo: 'VACACIONES' })).status).toBe(400);
    expect((await jefe.post('/api/ausencias').send({ empleadoId: mec.empleadoId, desde: '2026-11-10', hasta: '2027-06-10', tipo: 'VACACIONES' })).status).toBe(400);
    expect((await jefe.post('/api/ausencias').send({ empleadoId: mec.empleadoId, desde: '2026-11-10', tipo: 'NADA' })).status).toBe(400);
    await jefe.post('/api/ausencias').send({ empleadoId: mec.empleadoId, desde: '2026-11-12', tipo: 'PERSONAL' });
    const r = await jefe.post('/api/ausencias').send({ empleadoId: mec.empleadoId, desde: '2026-11-10', hasta: '2026-11-13', tipo: 'VACACIONES' });
    expect(r.status).toBe(409);
    expect(await prisma.ausencia.count()).toBe(1);
  });
});

describe('baja de personal', () => {
  it('el jefe da de baja a un mecánico: pierde el acceso, sale de la capacidad y queda constancia', async () => {
    const [mec] = await tallerAbierto(1);
    const jefe = await entrar('jefe@taller.test', 'JEFE');
    const r = await jefe.post(`/api/empleados/${mec.empleadoId}/baja`).send({ motivo: 'Fin de contrato' });
    expect(r.status).toBe(200);
    expect((await mec.get('/api/auth/me')).status).toBe(401);
    expect((await anonimo().post('/api/auth/test-login').send({ email: 'mec1@taller.test' })).status).toBe(403); // no se recupera entrando
    expect((await jefe.get('/api/mecanicos')).body.datos).toHaveLength(0);
    expect(await prisma.registroEliminacion.findFirstOrThrow()).toMatchObject({ entidad: 'Usuario', modo: 'BAJA', motivo: 'Fin de contrato' });
    const ana = await entrar('ana@cliente.test');
    expect((await ana.get(`/api/disponibilidad?desde=${MANANA}&hasta=${MANANA}`)).body.dias[0].capacidad).toBe(0);
  });

  it('el jefe no da de baja a otro jefe; el dueño sí', async () => {
    const jefe = await entrar('jefe@taller.test', 'JEFE');
    const otro = await entrar('jefe2@taller.test', 'JEFE');
    expect((await jefe.post(`/api/empleados/${otro.empleadoId}/baja`).send({ motivo: 'x' })).status).toBe(403);
    const dueno = await entrar('dueno@taller.test', 'DUENO');
    expect((await dueno.post(`/api/empleados/${otro.empleadoId}/baja`).send({ motivo: 'x' })).status).toBe(200);
    expect((await otro.get('/api/auth/me')).status).toBe(401);
  });

  it('nadie se da de baja a sí mismo por esta vía', async () => {
    const jefe = await entrar('jefe@taller.test', 'JEFE');
    expect((await jefe.post(`/api/empleados/${jefe.empleadoId}/baja`).send({ motivo: 'x' })).status).toBe(403);
  });

  it('un mecánico dado de baja se puede reactivar; dos bajas seguidas dan 409', async () => {
    const [mec] = await tallerAbierto(1);
    const jefe = await entrar('jefe@taller.test', 'JEFE');
    await jefe.post(`/api/empleados/${mec.empleadoId}/baja`).send({ motivo: 'x' });
    expect((await jefe.post(`/api/empleados/${mec.empleadoId}/baja`).send({ motivo: 'x' })).status).toBe(409);
    expect((await jefe.get('/api/mecanicos?incluirBajas=true')).body.datos[0].activo).toBe(false);
    expect((await jefe.post(`/api/empleados/${mec.empleadoId}/reactivar`).send({})).status).toBe(200);
    expect((await anonimo().post('/api/auth/test-login').send({ email: 'mec1@taller.test' })).status).toBe(200);
  });

  it('un mecánico no puede dar de baja a nadie', async () => {
    const [m1, m2] = await tallerAbierto(2);
    expect((await m1.post(`/api/empleados/${m2.empleadoId}/baja`).send({ motivo: 'x' })).status).toBe(403);
  });
});
