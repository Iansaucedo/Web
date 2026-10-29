import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../db';
import { reloj } from '../lib/reloj';
import { AHORA, MANANA, anonimo, clienteConCoche, emailsA, entrar, ordenEnDiagnostico, reiniciarBd, reservar, tallerAbierto } from './ayudas';

beforeEach(reiniciarBd);

describe('puestos', () => {
  it('el jefe crea, renombra y desactiva puestos; el nombre es único', async () => {
    const jefe = await entrar('jefe@taller.test', 'JEFE');
    const p = (await jefe.post('/api/puestos').send({ nombre: 'Elevador 4' })).body;
    expect((await jefe.post('/api/puestos').send({ nombre: 'elevador 4' })).status).toBe(409);
    expect((await jefe.patch(`/api/puestos/${p.id}`).send({ activo: false })).body.activo).toBe(false);
    expect((await jefe.get('/api/puestos')).body.datos).toHaveLength(4);
  });

  it('no se desactiva un puesto con un vehículo dentro', async () => {
    const { jefe, puesto } = await ordenEnDiagnostico();
    const r = await jefe.patch(`/api/puestos/${puesto.id}`).send({ activo: false });
    expect(r.status).toBe(409);
    const lista = (await jefe.get('/api/puestos')).body.datos;
    expect(lista.find((x: { id: string }) => x.id === puesto.id).ocupadoPor).toMatchObject({ codigo: 'OR-0001', matricula: '1234ABC' });
  });

  it('el mecánico consulta puestos pero no los crea', async () => {
    const mec = await entrar('mec1@taller.test', 'MECANICO');
    expect((await mec.get('/api/puestos')).status).toBe(200);
    expect((await mec.post('/api/puestos').send({ nombre: 'X' })).status).toBe(403);
  });
});

describe('asignaciones y ausencias', () => {
  it('asigna un mecánico a un puesto y el mecánico lo ve en su panel', async () => {
    const [mec] = await tallerAbierto(1);
    const jefe = await entrar('jefe@taller.test', 'JEFE');
    const puesto = await prisma.puesto.findFirstOrThrow();
    expect((await jefe.put('/api/asignaciones').send({ fecha: MANANA, puestoId: puesto.id, empleadoId: mec.empleadoId })).status).toBe(200);
    const r = (await jefe.get(`/api/asignaciones?fecha=${MANANA}`)).body.datos;
    expect(r).toEqual([expect.objectContaining({ puestoId: puesto.id, empleadoId: mec.empleadoId, mecanico: 'mec1' })]);
  });

  it('QA: no se asigna un día pasado, a un ausente, a un cliente ni más puestos de la cuenta', async () => {
    const [mec] = await tallerAbierto(1);
    const jefe = await entrar('jefe@taller.test', 'JEFE');
    const [p1, p2, p3] = await prisma.puesto.findMany({ orderBy: { nombre: 'asc' } });
    expect((await jefe.put('/api/asignaciones').send({ fecha: '2026-11-01', puestoId: p1.id, empleadoId: mec.empleadoId })).body.codigo).toBe('FECHA_PASADA');
    await jefe.put('/api/asignaciones').send({ fecha: MANANA, puestoId: p1.id, empleadoId: mec.empleadoId });
    await jefe.put('/api/asignaciones').send({ fecha: MANANA, puestoId: p2.id, empleadoId: mec.empleadoId });
    expect((await jefe.put('/api/asignaciones').send({ fecha: MANANA, puestoId: p3.id, empleadoId: mec.empleadoId })).body.codigo).toBe('DEMASIADOS_PUESTOS');
    await jefe.post('/api/ausencias').send({ empleadoId: mec.empleadoId, desde: '2026-11-11', tipo: 'OTRA' });
    expect((await jefe.put('/api/asignaciones').send({ fecha: '2026-11-11', puestoId: p1.id, empleadoId: mec.empleadoId })).body.codigo).toBe('MECANICO_AUSENTE');
    expect((await jefe.put('/api/asignaciones').send({ fecha: MANANA, puestoId: p3.id, empleadoId: 'no-existe' })).status).toBe(404);
  });

  it('una ausencia baja la capacidad, quita sus asignaciones y avisa a los jefes si sobran citas', async () => {
    const [mec] = await tallerAbierto(1);
    const jefe = await entrar('jefe@taller.test', 'JEFE');
    const puesto = await prisma.puesto.findFirstOrThrow();
    await jefe.put('/api/asignaciones').send({ fecha: MANANA, puestoId: puesto.id, empleadoId: mec.empleadoId });
    await reservar(await clienteConCoche(), MANANA);
    const r = await jefe.post('/api/ausencias').send({ empleadoId: mec.empleadoId, desde: MANANA, tipo: 'OTRA' });
    expect(r.status).toBe(201);
    expect(await prisma.asignacionPuesto.count()).toBe(0);
    const e = (await emailsA('jefe@taller.test')).find((x) => x.plantilla === 'MECANICO_AUSENTE');
    expect(e?.datos).toMatchObject({ capacidad: 0, citas: 1, exceso: 1 });
    expect((await jefe.post('/api/ausencias').send({ empleadoId: mec.empleadoId, desde: MANANA, tipo: 'OTRA' })).status).toBe(409);
    const ana = await entrar('ana@cliente.test');
    expect((await ana.get(`/api/disponibilidad?desde=${MANANA}&hasta=${MANANA}`)).body.dias[0].capacidad).toBe(0);
    expect((await jefe.delete(`/api/ausencias/${r.body.ids[0]}`).send({})).status).toBe(204);
  });

  it('la lista de mecánicos dice quién falta hoy', async () => {
    const [mec] = await tallerAbierto(2);
    const jefe = await entrar('jefe@taller.test', 'JEFE');
    await jefe.post('/api/ausencias').send({ empleadoId: mec.empleadoId, desde: '2026-11-09', tipo: 'OTRA' });
    const lista = (await jefe.get('/api/mecanicos')).body.datos;
    expect(lista.map((m: { nombre: string; ausenteHoy: boolean }) => [m.nombre, m.ausenteHoy])).toEqual([['mec1', true], ['mec2', false]]);
  });
});

describe('invitaciones y usuarios', () => {
  it('el jefe invita mecánicos; no puede invitar jefes', async () => {
    const jefe = await entrar('jefe@taller.test', 'JEFE');
    const r = await jefe.post('/api/invitaciones').send({ email: 'Nuevo@Taller.test', rol: 'MECANICO' });
    expect(r.status).toBe(201);
    expect(r.body.email).toBe('nuevo@taller.test');
    expect((await emailsA('nuevo@taller.test')).map((e) => e.plantilla)).toEqual(['INVITACION']);
    expect((await jefe.post('/api/invitaciones').send({ email: 'otro@taller.test', rol: 'JEFE' })).status).toBe(403);
    expect((await jefe.post('/api/invitaciones').send({ email: 'nuevo@taller.test', rol: 'MECANICO' })).status).toBe(409);
  });

  it('QA: invitar a quien ya tiene cuenta no le cambia el rol en silencio', async () => {
    await entrar('ana@cliente.test');
    const dueno = await entrar('dueno@taller.test', 'DUENO');
    const r = await dueno.post('/api/invitaciones').send({ email: 'ana@cliente.test', rol: 'JEFE' });
    expect(r.status).toBe(409);
    expect(r.body.codigo).toBe('YA_REGISTRADO');
  });

  it('QA: un cliente no puede invitarse como dueño (se comprueba el permiso antes que los datos)', async () => {
    const ana = await entrar('ana@cliente.test');
    expect((await ana.post('/api/invitaciones').send({ email: 'yo@yo.es', rol: 'DUENO' })).status).toBe(403);
    const dueno = await entrar('dueno@taller.test', 'DUENO');
    expect((await dueno.post('/api/invitaciones').send({ email: 'yo@yo.es', rol: 'DUENO' })).status).toBe(400);
    expect((await ana.post('/api/invitaciones').send({ email: 'yo@yo.es', rol: 'MECANICO' })).status).toBe(403);
  });

  it('el dueño da de baja un usuario y cambia roles; no puede bajarse a sí mismo', async () => {
    const dueno = await entrar('dueno@taller.test', 'DUENO');
    const mec = await entrar('mec1@taller.test', 'MECANICO');
    const ana = await entrar('ana@cliente.test');
    expect((await dueno.patch(`/api/usuarios/${mec.usuarioId}`).send({ rol: 'JEFE' })).body.rol).toBe('JEFE');
    expect((await dueno.patch(`/api/usuarios/${ana.usuarioId}`).send({ activo: false })).body.activo).toBe(false);
    expect((await ana.get('/api/auth/me')).status).toBe(401);
    expect((await dueno.patch(`/api/usuarios/${dueno.usuarioId}`).send({ activo: false })).body.codigo).toBe('NO_A_TI_MISMO');
    expect((await dueno.get('/api/usuarios?rol=CLIENTE')).body.datos).toHaveLength(1);
  });

  it('QA: un cliente con vehículos no puede pasar a mecánico', async () => {
    const dueno = await entrar('dueno@taller.test', 'DUENO');
    const ana = await clienteConCoche();
    expect((await dueno.patch(`/api/usuarios/${ana.usuarioId}`).send({ rol: 'MECANICO' })).body.codigo).toBe('ES_CLIENTE');
  });

  it('el jefe ve las empresas con sus vehículos', async () => {
    const jefe = await entrar('jefe@taller.test', 'JEFE');
    const emp = await entrar('flota@empresa.test', 'CLIENTE', { empresa: true });
    await emp.post('/api/vehiculos').send({ matricula: '1111AAA', marca: 'Ford', modelo: 'Transit' });
    await entrar('ana@cliente.test');
    const r = (await jefe.get('/api/clientes?tipo=EMPRESA')).body.datos;
    expect(r).toEqual([expect.objectContaining({ razonSocial: 'Flotas SL', nif: 'B12345678', vehiculos: 1 })]);
  });

  it('el mecánico no ve usuarios ni clientes', async () => {
    const mec = await entrar('mec1@taller.test', 'MECANICO');
    expect((await mec.get('/api/usuarios')).status).toBe(403);
    expect((await mec.get('/api/clientes')).status).toBe(403);
    expect((await anonimo().get('/api/usuarios')).status).toBe(401);
  });
});

void AHORA;
void reloj;
