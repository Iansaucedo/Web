import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../db';
import { anonimo, emailsA, entrar, reiniciarBd } from './ayudas';

beforeEach(reiniciarBd);

describe('perfil del cliente', () => {
  it('un cliente nuevo no tiene perfil y lo completa una vez', async () => {
    const ana = await entrar('ana@cliente.test', 'CLIENTE', { sinPerfil: true });
    expect((await ana.get('/api/auth/me')).body.cliente).toBeNull();
    const r = await ana.put('/api/perfil').send({ tipo: 'INDIVIDUAL', telefono: '+34 600 111 222' });
    expect(r.status).toBe(200);
    expect(r.body.cliente).toMatchObject({ tipo: 'INDIVIDUAL', telefono: '+34600111222' });
    expect((await emailsA('ana@cliente.test')).map((e) => e.plantilla)).toEqual(['BIENVENIDA']);
  });

  it('actualizar el perfil no repite el email de bienvenida', async () => {
    const ana = await entrar('ana@cliente.test');
    await ana.put('/api/perfil').send({ tipo: 'INDIVIDUAL', telefono: '611222333' });
    expect((await emailsA('ana@cliente.test')).length).toBe(1);
  });

  it('una empresa exige razón social y un NIF/CIF válido', async () => {
    const e = await entrar('flota@empresa.test', 'CLIENTE', { sinPerfil: true });
    expect((await e.put('/api/perfil').send({ tipo: 'EMPRESA', telefono: '600111222' })).status).toBe(400);
    expect((await e.put('/api/perfil').send({ tipo: 'EMPRESA', telefono: '600111222', razonSocial: 'Flotas SL', nif: '123' })).status).toBe(400);
    const ok = await e.put('/api/perfil').send({ tipo: 'EMPRESA', telefono: '600111222', razonSocial: 'Flotas SL', nif: 'b-12345678' });
    expect(ok.body.cliente).toMatchObject({ razonSocial: 'Flotas SL', nif: 'B12345678' });
  });

  it('rechaza teléfonos imposibles', async () => {
    const ana = await entrar('ana@cliente.test', 'CLIENTE', { sinPerfil: true });
    expect((await ana.put('/api/perfil').send({ tipo: 'INDIVIDUAL', telefono: 'llámame' })).status).toBe(400);
  });

  it('el personal no tiene perfil de cliente', async () => {
    const m = await entrar('mec@taller.test', 'MECANICO');
    expect((await m.put('/api/perfil').send({ tipo: 'INDIVIDUAL', telefono: '600111222' })).status).toBe(403);
  });
});

describe('vehículos', () => {
  const golf = { matricula: '1234 abc', marca: 'Volkswagen', modelo: 'Golf', anio: 2018, combustible: 'DIESEL', kilometros: 98000 };

  it('el cliente registra un vehículo; la matrícula se normaliza', async () => {
    const ana = await entrar('ana@cliente.test');
    const r = await ana.post('/api/vehiculos').send(golf);
    expect(r.status).toBe(201);
    expect(r.body.matricula).toBe('1234ABC');
    expect((await ana.get('/api/vehiculos')).body.datos).toHaveLength(1);
  });

  it('sin perfil completo no puede registrar vehículos', async () => {
    const ana = await entrar('ana@cliente.test', 'CLIENTE', { sinPerfil: true });
    const r = await ana.post('/api/vehiculos').send(golf);
    expect(r.status).toBe(422);
    expect(r.body.codigo).toBe('PERFIL_INCOMPLETO');
  });

  it('matrícula duplicada (aunque se escriba distinto): 409', async () => {
    const ana = await entrar('ana@cliente.test');
    const luis = await entrar('luis@cliente.test');
    await ana.post('/api/vehiculos').send(golf);
    const r = await luis.post('/api/vehiculos').send({ ...golf, matricula: '1234-ABC' });
    expect(r.status).toBe(409);
    expect(r.body.codigo).toBe('MATRICULA_DUPLICADA');
  });

  it('valida bastidor, año y kilómetros', async () => {
    const ana = await entrar('ana@cliente.test');
    expect((await ana.post('/api/vehiculos').send({ ...golf, bastidor: 'CORTO' })).status).toBe(400);
    expect((await ana.post('/api/vehiculos').send({ ...golf, anio: 1800 })).status).toBe(400);
    expect((await ana.post('/api/vehiculos').send({ ...golf, kilometros: -5 })).status).toBe(400);
    expect((await ana.post('/api/vehiculos').send({ ...golf, matricula: '<script>' })).status).toBe(400);
  });

  it('un cliente no ve ni edita vehículos de otro (404, no 403)', async () => {
    const ana = await entrar('ana@cliente.test');
    const luis = await entrar('luis@cliente.test');
    const v = (await ana.post('/api/vehiculos').send(golf)).body;
    expect((await luis.get(`/api/vehiculos/${v.id}`)).status).toBe(404);
    expect((await luis.patch(`/api/vehiculos/${v.id}`).send({ kilometros: 100000 })).status).toBe(404);
    expect((await luis.get('/api/vehiculos')).body.datos).toHaveLength(0);
  });

  it('los kilómetros no pueden bajar', async () => {
    const ana = await entrar('ana@cliente.test');
    const v = (await ana.post('/api/vehiculos').send(golf)).body;
    const r = await ana.patch(`/api/vehiculos/${v.id}`).send({ kilometros: 1000 });
    expect(r.status).toBe(422);
    expect(r.body.codigo).toBe('KM_MENOR');
  });

  it('el jefe busca vehículos de cualquier cliente por matrícula', async () => {
    const ana = await entrar('ana@cliente.test');
    await ana.post('/api/vehiculos').send(golf);
    const jefe = await entrar('jefe@taller.test', 'JEFE');
    const r = await jefe.get('/api/vehiculos?q=1234');
    expect(r.body.datos).toHaveLength(1);
    expect(r.body.datos[0].cliente.nombre).toBe('ana');
  });

  it('la búsqueda no rompe con caracteres especiales', async () => {
    const jefe = await entrar('jefe@taller.test', 'JEFE');
    expect((await jefe.get("/api/vehiculos?q=%25'%22;--")).status).toBe(200);
  });

  it('el historial de un vehículo sin órdenes está vacío', async () => {
    const ana = await entrar('ana@cliente.test');
    const v = (await ana.post('/api/vehiculos').send(golf)).body;
    const r = await ana.get(`/api/vehiculos/${v.id}/historial`);
    expect(r.status).toBe(200);
    expect(r.body.ordenes).toEqual([]);
  });
});

describe('configuración del taller', () => {
  it('cualquiera con sesión la lee; solo el dueño la cambia', async () => {
    const ana = await entrar('ana@cliente.test');
    expect((await ana.get('/api/config')).body).toMatchObject({ tarifaHoraCentimos: 4000, ivaPorcentaje: 21, horasMinimasCancelar: 24 });
    expect((await ana.put('/api/config').send({ ivaPorcentaje: 10 })).status).toBe(403);
    const jefe = await entrar('jefe@taller.test', 'JEFE');
    expect((await jefe.put('/api/config').send({ ivaPorcentaje: 10 })).status).toBe(403);
    const dueno = await entrar('dueno@taller.test', 'DUENO');
    const r = await dueno.put('/api/config').send({ ivaPorcentaje: 10, tarifaHoraCentimos: 4500 });
    expect(r.body).toMatchObject({ ivaPorcentaje: 10, tarifaHoraCentimos: 4500 });
  });

  it('rechaza horarios incoherentes', async () => {
    const dueno = await entrar('dueno@taller.test', 'DUENO');
    expect((await dueno.put('/api/config').send({ aperturaMinutos: 1000, cierreMinutos: 900 })).status).toBe(422);
    expect((await dueno.put('/api/config').send({ minutosFranja: 7 })).status).toBe(400);
    expect((await dueno.put('/api/config').send({ diasLaborables: [0, 8] })).status).toBe(400);
    expect((await dueno.put('/api/config').send({ ivaPorcentaje: 150 })).status).toBe(400);
  });
});

describe('avisos en la web', () => {
  it('lista los avisos propios y los marca como leídos', async () => {
    const ana = await entrar('ana@cliente.test');
    const lista = (await ana.get('/api/notificaciones')).body;
    expect(lista.noLeidas).toBe(1);
    const id = lista.datos[0].id;
    expect((await ana.post(`/api/notificaciones/${id}/leer`).send({})).status).toBe(204);
    expect((await ana.get('/api/notificaciones')).body.noLeidas).toBe(0);
  });

  it('no se puede marcar el aviso de otro', async () => {
    const ana = await entrar('ana@cliente.test');
    const luis = await entrar('luis@cliente.test');
    const id = (await ana.get('/api/notificaciones')).body.datos[0].id;
    expect((await luis.post(`/api/notificaciones/${id}/leer`).send({})).status).toBe(404);
  });

  it('marcar todas', async () => {
    const ana = await entrar('ana@cliente.test');
    await ana.post('/api/notificaciones/leer-todas').send({});
    expect((await ana.get('/api/notificaciones')).body.noLeidas).toBe(0);
    expect(await prisma.notificacion.count({ where: { leida: false } })).toBe(0);
  });

  it('sin sesión no hay avisos', async () => {
    expect((await anonimo().get('/api/notificaciones')).status).toBe(401);
  });
});

describe('borrar vehículo (con constancia)', () => {
  const seat = { matricula: '1234ABC', marca: 'Seat', modelo: 'Ibiza' };

  it('sin historial se borra, pero queda una copia en las constancias', async () => {
    const ana = await entrar('ana@cliente.test');
    const v = (await ana.post('/api/vehiculos').send(seat)).body;
    expect((await ana.delete(`/api/vehiculos/${v.id}`).send({ motivo: 'Lo he vendido' })).status).toBe(204);
    expect((await ana.get(`/api/vehiculos/${v.id}`)).status).toBe(404);
    expect(await prisma.vehiculo.count()).toBe(0);
    const c = await prisma.registroEliminacion.findFirstOrThrow();
    expect(c).toMatchObject({ entidad: 'Vehiculo', entidadId: v.id, motivo: 'Lo he vendido', usuarioId: ana.usuarioId, modo: 'BORRADO' });
    expect(c.datos).toMatchObject({ matricula: '1234ABC', marca: 'Seat' });
  });

  it('con historial se da de baja: no se borra nada enlazado y deja de aparecer al cliente', async () => {
    const ana = await entrar('ana@cliente.test');
    const v = (await ana.post('/api/vehiculos').send(seat)).body;
    const cliente = await prisma.cliente.findFirstOrThrow();
    await prisma.cita.create({ data: { clienteId: cliente.id, vehiculoId: v.id, inicio: new Date('2026-11-10T08:00:00Z'), fin: new Date('2026-11-10T08:30:00Z'), descripcionProblema: 'x', estado: 'CANCELADA' } });
    expect((await ana.delete(`/api/vehiculos/${v.id}`).send({})).status).toBe(204);
    const bd = await prisma.vehiculo.findUniqueOrThrow({ where: { id: v.id } });
    expect(bd.eliminadoEn).not.toBeNull();
    expect(await prisma.cita.count({ where: { vehiculoId: v.id } })).toBe(1); // nada huérfano
    expect((await ana.get('/api/vehiculos')).body.datos).toHaveLength(0);
    expect((await prisma.registroEliminacion.findFirstOrThrow()).modo).toBe('BAJA');
    const jefe = await entrar('jefe@taller.test', 'JEFE');
    expect((await jefe.get(`/api/vehiculos/${v.id}/historial`)).status).toBe(200); // la trazabilidad sigue
  });

  it('no se puede reservar con un vehículo dado de baja; volver a registrarlo lo recupera', async () => {
    const ana = await entrar('ana@cliente.test');
    const v = (await ana.post('/api/vehiculos').send(seat)).body;
    const cliente = await prisma.cliente.findFirstOrThrow();
    await prisma.cita.create({ data: { clienteId: cliente.id, vehiculoId: v.id, inicio: new Date('2026-11-10T08:00:00Z'), fin: new Date('2026-11-10T08:30:00Z'), descripcionProblema: 'x', estado: 'CANCELADA' } });
    await ana.delete(`/api/vehiculos/${v.id}`).send({});
    expect((await ana.post('/api/citas').send({ vehiculoId: v.id, inicio: '2026-12-01T08:00:00.000Z', descripcionProblema: 'x' })).status).toBe(404);
    const r = await ana.post('/api/vehiculos').send(seat);
    expect(r.status).toBe(201);
    expect(r.body.id).toBe(v.id);
    expect((await prisma.vehiculo.findUniqueOrThrow({ where: { id: v.id } })).eliminadoEn).toBeNull();
  });

  it('no se borra un vehículo con una cita activa o en el taller: 409 y no cambia nada', async () => {
    const ana = await entrar('ana@cliente.test');
    const v = (await ana.post('/api/vehiculos').send(seat)).body;
    const cliente = await prisma.cliente.findFirstOrThrow();
    await prisma.cita.create({ data: { clienteId: cliente.id, vehiculoId: v.id, inicio: new Date('2026-11-10T08:00:00Z'), fin: new Date('2026-11-10T08:30:00Z'), descripcionProblema: 'x' } });
    const r = await ana.delete(`/api/vehiculos/${v.id}`).send({});
    expect(r.status).toBe(409);
    expect(r.body.codigo).toBe('VEHICULO_EN_USO');
    expect((await prisma.vehiculo.findUniqueOrThrow({ where: { id: v.id } })).eliminadoEn).toBeNull();
    expect(await prisma.registroEliminacion.count()).toBe(0);
  });

  it('nadie borra el vehículo de otro', async () => {
    const ana = await entrar('ana@cliente.test');
    const luis = await entrar('luis@cliente.test');
    const v = (await ana.post('/api/vehiculos').send(seat)).body;
    expect((await luis.delete(`/api/vehiculos/${v.id}`).send({})).status).toBe(404);
    const mec = await entrar('mec@taller.test', 'MECANICO');
    expect((await mec.delete(`/api/vehiculos/${v.id}`).send({})).status).toBe(403);
    expect(await prisma.vehiculo.count()).toBe(1);
  });

  it('el dueño consulta las constancias; también quedan las de ausencias e invitaciones anuladas', async () => {
    const jefe = await entrar('jefe@taller.test', 'JEFE');
    const mec = await entrar('mec@taller.test', 'MECANICO');
    const a = (await jefe.post('/api/ausencias').send({ empleadoId: mec.empleadoId, desde: '2030-01-07', tipo: 'OTRA' })).body;
    await jefe.delete(`/api/ausencias/${a.ids[0]}`).send({});
    const inv = (await jefe.post('/api/invitaciones').send({ email: 'x@taller.test', rol: 'MECANICO' })).body;
    await jefe.delete(`/api/invitaciones/${inv.id}`).send({});
    expect((await jefe.get('/api/eliminaciones')).status).toBe(403);
    const dueno = await entrar('dueno@taller.test', 'DUENO');
    const r = (await dueno.get('/api/eliminaciones')).body.datos;
    expect(r.map((x: { entidad: string }) => x.entidad).sort()).toEqual(['Ausencia', 'Invitacion']);
    expect(r[0]).toMatchObject({ usuario: 'jefe' });
  });
});
