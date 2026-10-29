import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../db';
import { reloj } from '../lib/reloj';
import { AHORA, MANANA, PASADO, clienteConCoche, emailsA, entrar, madrid, reiniciarBd, reservar, tallerAbierto } from './ayudas';

beforeEach(reiniciarBd);

describe('disponibilidad', () => {
  it('sin mecánicos no hay hueco', async () => {
    await tallerAbierto(0);
    const ana = await clienteConCoche();
    const r = await ana.get(`/api/disponibilidad?desde=${MANANA}&hasta=${MANANA}`);
    expect(r.body.dias[0]).toMatchObject({ fecha: MANANA, capacidad: 0, lleno: true });
  });

  it('capacidad = min(puestos, mecánicos × vehículos por mecánico)', async () => {
    await tallerAbierto(1);
    const ana = await clienteConCoche();
    const dia = (await ana.get(`/api/disponibilidad?desde=${MANANA}&hasta=${MANANA}`)).body.dias[0];
    expect(dia.capacidad).toBe(2);
    expect(dia.franjas[0]).toMatchObject({ hora: '08:00', libres: 2, inicio: madrid(MANANA, '08:00') });
    expect(dia.franjas.at(-1).hora).toBe('17:30');
  });

  it('fines de semana no laborables', async () => {
    await tallerAbierto(1);
    const ana = await clienteConCoche();
    const r = await ana.get('/api/disponibilidad?desde=2026-11-14&hasta=2026-11-15');
    expect(r.body.dias.map((d: { laborable: boolean }) => d.laborable)).toEqual([false, false]);
  });

  it('las franjas de hoy que ya han pasado no se ofrecen', async () => {
    await tallerAbierto(1);
    const ana = await clienteConCoche();
    const hoy = (await ana.get('/api/disponibilidad?desde=2026-11-09&hasta=2026-11-09')).body.dias[0];
    expect(hoy.franjas[0].hora).toBe('10:30');
  });

  it('rango inválido o demasiado largo: 400', async () => {
    const ana = await clienteConCoche();
    expect((await ana.get(`/api/disponibilidad?desde=${PASADO}&hasta=${MANANA}`)).status).toBe(400);
    expect((await ana.get('/api/disponibilidad?desde=2026-11-10&hasta=2027-03-01')).status).toBe(400);
    expect((await ana.get('/api/disponibilidad?desde=mañana&hasta=2026-11-11')).status).toBe(400);
  });

  it('el cambio de hora de octubre no desplaza las franjas (08:00 local)', async () => {
    reloj.fijar(new Date('2027-10-20T08:00:00Z'));
    await entrar('mec1@taller.test', 'MECANICO');
    const ana = await clienteConCoche();
    const r = await ana.get('/api/disponibilidad?desde=2027-10-29&hasta=2027-11-01');
    const viernes = r.body.dias[0];
    const lunes = r.body.dias[3];
    expect(viernes.franjas[0].inicio).toBe('2027-10-29T06:00:00.000Z'); // UTC+2
    expect(lunes.franjas[0].inicio).toBe('2027-11-01T07:00:00.000Z'); // UTC+1
  });
});

describe('reservar cita', () => {
  it('reserva, avisa al cliente y al jefe, y la franja baja', async () => {
    await tallerAbierto(1);
    await entrar('jefe@taller.test', 'JEFE');
    const ana = await clienteConCoche();
    const r = await reservar(ana);
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ estado: 'PENDIENTE', inicio: madrid(MANANA, '09:00'), fin: madrid(MANANA, '09:30') });
    expect((await emailsA('ana@cliente.test')).map((e) => e.plantilla)).toContain('CITA_SOLICITADA');
    expect((await emailsA('jefe@taller.test')).map((e) => e.plantilla)).toEqual(['CITA_NUEVA_TALLER']);
    const dia = (await ana.get(`/api/disponibilidad?desde=${MANANA}&hasta=${MANANA}`)).body.dias[0];
    expect(dia.ocupadas).toBe(1);
    expect(dia.franjas.find((f: { hora: string }) => f.hora === '09:00').libres).toBe(1);
  });

  it('no se puede reservar en el pasado, fuera de horario o fuera de una franja', async () => {
    await tallerAbierto(1);
    const ana = await clienteConCoche();
    for (const [dia, hora] of [['2026-11-09', '09:00'], [MANANA, '07:30'], [MANANA, '18:00'], [MANANA, '09:10'], ['2026-11-14', '09:00']]) {
      const r = await reservar(ana, dia, hora);
      expect(r.status, `${dia} ${hora}`).toBe(422);
      expect(r.body.codigo).toBe('FRANJA_NO_VALIDA');
    }
  });

  it('no se puede reservar con más de 60 días', async () => {
    await tallerAbierto(1);
    const ana = await clienteConCoche();
    expect((await reservar(ana, '2027-02-01')).body.codigo).toBe('FUERA_DE_PLAZO');
  });

  it('un vehículo no puede tener dos citas activas', async () => {
    await tallerAbierto(2);
    const ana = await clienteConCoche();
    await reservar(ana);
    const r = await reservar(ana, PASADO);
    expect(r.status).toBe(409);
    expect(r.body.codigo).toBe('VEHICULO_CON_CITA');
  });

  it('no se reserva con el vehículo de otro', async () => {
    await tallerAbierto(1);
    const ana = await clienteConCoche();
    const luis = await clienteConCoche('luis@cliente.test', '9999XYZ');
    const r = await luis.post('/api/citas').send({ vehiculoId: ana.vehiculoId, inicio: madrid(MANANA, '09:00'), descripcionProblema: 'x' });
    expect(r.status).toBe(404);
  });

  it('franja llena (recepciones por franja) y día lleno (capacidad)', async () => {
    await tallerAbierto(2); // capacidad 3 (3 puestos), 2 recepciones por franja
    const clientes = [];
    for (let i = 0; i < 4; i++) clientes.push(await clienteConCoche(`c${i}@cliente.test`, `000${i}AAA`));
    expect((await reservar(clientes[0], MANANA, '09:00')).status).toBe(201);
    expect((await reservar(clientes[1], MANANA, '09:00')).status).toBe(201);
    expect((await reservar(clientes[2], MANANA, '09:00')).body.codigo).toBe('FRANJA_LLENA');
    expect((await reservar(clientes[2], MANANA, '10:00')).status).toBe(201);
    expect((await reservar(clientes[3], MANANA, '11:00')).body.codigo).toBe('DIA_LLENO');
  });

  it('QA: 6 clientes a la vez por las 2 últimas plazas → exactamente 2 entran', async () => {
    await tallerAbierto(1); // capacidad 2
    const clientes = [];
    for (let i = 0; i < 6; i++) clientes.push(await clienteConCoche(`c${i}@cliente.test`, `100${i}BBB`));
    const r = await Promise.all(clientes.map((c, i) => reservar(c, MANANA, i % 2 ? '09:00' : '10:00')));
    expect(r.filter((x) => x.status === 201)).toHaveLength(2);
    expect(r.filter((x) => x.status === 409)).toHaveLength(4);
    expect(await prisma.cita.count()).toBe(2);
  });

  it('QA: doble clic con la misma Idempotency-Key crea una sola cita', async () => {
    await tallerAbierto(1);
    const ana = await clienteConCoche();
    const cuerpo = { vehiculoId: ana.vehiculoId, inicio: madrid(MANANA, '09:00'), descripcionProblema: 'x' };
    const [a, b] = await Promise.all([
      ana.post('/api/citas').set('Idempotency-Key', 'clave-doble-clic-1').send(cuerpo),
      ana.post('/api/citas').set('Idempotency-Key', 'clave-doble-clic-1').send(cuerpo),
    ]);
    expect([a.status, b.status].sort()).toEqual(expect.arrayContaining([201]));
    expect(await prisma.cita.count()).toBe(1);
    const c = await ana.post('/api/citas').set('Idempotency-Key', 'clave-doble-clic-1').send(cuerpo);
    expect(c.status).toBe(201);
    expect(c.headers['idempotent-replayed']).toBe('true');
    expect(c.body.id).toBe((await prisma.cita.findFirstOrThrow()).id);
  });

  it('QA: reutilizar una Idempotency-Key con otros datos: 422', async () => {
    await tallerAbierto(2);
    const ana = await clienteConCoche();
    await ana.post('/api/citas').set('Idempotency-Key', 'clave-reusada-1').send({ vehiculoId: ana.vehiculoId, inicio: madrid(MANANA, '09:00'), descripcionProblema: 'x' });
    const r = await ana.post('/api/citas').set('Idempotency-Key', 'clave-reusada-1').send({ vehiculoId: ana.vehiculoId, inicio: madrid(PASADO, '09:00'), descripcionProblema: 'x' });
    expect(r.status).toBe(422);
    expect(r.body.codigo).toBe('IDEMPOTENCIA_REUTILIZADA');
  });

  it('QA: descripción vacía o enorme', async () => {
    await tallerAbierto(1);
    const ana = await clienteConCoche();
    const base = { vehiculoId: ana.vehiculoId, inicio: madrid(MANANA, '09:00') };
    expect((await ana.post('/api/citas').send({ ...base, descripcionProblema: '   ' })).status).toBe(400);
    expect((await ana.post('/api/citas').send({ ...base, descripcionProblema: 'x'.repeat(2001) })).status).toBe(400);
  });

  it('el personal no reserva como cliente', async () => {
    const [mec] = await tallerAbierto(1);
    expect((await mec.post('/api/citas').send({ vehiculoId: 'x', inicio: madrid(MANANA, '09:00'), descripcionProblema: 'x' })).status).toBe(403);
  });
});

describe('cambiar y cancelar', () => {
  it('el cliente cambia la franja con más de 24 h: vuelve a pendiente', async () => {
    await tallerAbierto(1);
    const jefe = await entrar('jefe@taller.test', 'JEFE');
    const ana = await clienteConCoche();
    const cita = (await reservar(ana, PASADO, '09:00')).body;
    await jefe.post(`/api/citas/${cita.id}/confirmar`).send({});
    const r = await ana.patch(`/api/citas/${cita.id}`).send({ inicio: madrid(PASADO, '11:00') });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ estado: 'PENDIENTE', inicio: madrid(PASADO, '11:00') });
    expect((await emailsA('ana@cliente.test')).map((e) => e.plantilla)).toContain('CITA_MODIFICADA');
  });

  it('con menos de 24 h el cliente no puede cambiar ni cancelar', async () => {
    await tallerAbierto(1);
    const ana = await clienteConCoche();
    const cita = (await reservar(ana, MANANA, '09:00')).body; // mañana 09:00, faltan 23 h
    expect((await ana.post(`/api/citas/${cita.id}/cancelar`).send({})).body.codigo).toBe('FUERA_DE_PLAZO');
    expect((await ana.patch(`/api/citas/${cita.id}`).send({ inicio: madrid(PASADO, '09:00') })).body.codigo).toBe('FUERA_DE_PLAZO');
  });

  it('justo en el límite de 24 h todavía se puede', async () => {
    await tallerAbierto(1);
    const ana = await clienteConCoche();
    const cita = (await reservar(ana, MANANA, '10:00')).body; // faltan exactamente 24 h
    expect((await ana.post(`/api/citas/${cita.id}/cancelar`).send({})).status).toBe(200);
  });

  it('cancelar libera la franja y avisa', async () => {
    await tallerAbierto(1);
    const ana = await clienteConCoche();
    const cita = (await reservar(ana, PASADO)).body;
    expect((await ana.post(`/api/citas/${cita.id}/cancelar`).send({})).body.estado).toBe('CANCELADA');
    expect((await ana.get(`/api/disponibilidad?desde=${PASADO}&hasta=${PASADO}`)).body.dias[0].ocupadas).toBe(0);
    expect((await emailsA('ana@cliente.test')).map((e) => e.plantilla)).toContain('CITA_CANCELADA');
    expect((await reservar(ana, PASADO)).status).toBe(201); // puede volver a reservar
  });

  it('QA: cancelar dos veces → la segunda 409', async () => {
    await tallerAbierto(1);
    const ana = await clienteConCoche();
    const cita = (await reservar(ana, PASADO)).body;
    const [a, b] = await Promise.all([ana.post(`/api/citas/${cita.id}/cancelar`).send({}), ana.post(`/api/citas/${cita.id}/cancelar`).send({})]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
  });

  it('el jefe cancela en cualquier momento pero debe dar motivo', async () => {
    await tallerAbierto(1);
    const jefe = await entrar('jefe@taller.test', 'JEFE');
    const ana = await clienteConCoche();
    const cita = (await reservar(ana, MANANA)).body;
    expect((await jefe.post(`/api/citas/${cita.id}/cancelar`).send({})).status).toBe(422);
    expect((await jefe.post(`/api/citas/${cita.id}/cancelar`).send({ motivo: 'Sin personal' })).body.estado).toBe('CANCELADA');
  });

  it('un cliente no puede tocar la cita de otro', async () => {
    await tallerAbierto(1);
    const ana = await clienteConCoche();
    const luis = await clienteConCoche('luis@cliente.test', '9999XYZ');
    const cita = (await reservar(ana, PASADO)).body;
    expect((await luis.post(`/api/citas/${cita.id}/cancelar`).send({})).status).toBe(404);
    expect((await luis.get(`/api/citas/${cita.id}`)).status).toBe(404);
    expect((await luis.post(`/api/citas/${cita.id}/confirmar`).send({})).status).toBe(403);
  });
});

describe('recepción', () => {
  async function citaDeHoy() {
    reloj.fijar(new Date('2026-11-09T06:00:00Z')); // 07:00 en Madrid
    const jefe = await entrar('jefe@taller.test', 'JEFE');
    await entrar('mec1@taller.test', 'MECANICO');
    const ana = await clienteConCoche();
    const cita = (await reservar(ana, '2026-11-09', '09:00')).body;
    return { jefe, ana, cita };
  }

  it('confirmar y recibir abre la orden en diagnóstico y avisa al cliente', async () => {
    const { jefe, ana, cita } = await citaDeHoy();
    expect((await jefe.post(`/api/citas/${cita.id}/confirmar`).send({})).body.estado).toBe('CONFIRMADA');
    const puesto = await prisma.puesto.findFirstOrThrow({ where: { nombre: 'Puesto 1' } });
    const r = await jefe.post(`/api/citas/${cita.id}/recibir`).send({ kmEntrada: 98450, notasRecepcion: 'Arañazo puerta', puestoId: puesto.id });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ estado: 'EN_DIAGNOSTICO', numero: 1, kmEntrada: 98450 });
    expect((await prisma.vehiculo.findFirstOrThrow()).kilometros).toBe(98450);
    expect((await emailsA('ana@cliente.test')).map((e) => e.plantilla)).toContain('VEHICULO_RECIBIDO');
    expect((await ana.get('/api/citas')).body.datos[0]).toMatchObject({ estado: 'RECIBIDA', ordenId: r.body.id });
  });

  it('QA: recibir dos veces a la vez crea una sola orden', async () => {
    const { jefe, cita } = await citaDeHoy();
    const [a, b] = await Promise.all([
      jefe.post(`/api/citas/${cita.id}/recibir`).send({ kmEntrada: 98450 }),
      jefe.post(`/api/citas/${cita.id}/recibir`).send({ kmEntrada: 98450 }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await prisma.orden.count()).toBe(1);
  });

  it('no se recibe una cita de otro día ni con menos kilómetros', async () => {
    const { jefe, ana, cita } = await citaDeHoy();
    expect((await jefe.post(`/api/citas/${cita.id}/recibir`).send({ kmEntrada: 100 })).body.codigo).toBe('KM_MENOR');
    await ana.post(`/api/citas/${cita.id}/cancelar`).send({}).catch(() => undefined);
    const otra = (await reservar(Object.assign(await clienteConCoche('luis@cliente.test', '5555BBB')), MANANA)).body;
    expect((await jefe.post(`/api/citas/${otra.id}/recibir`).send({ kmEntrada: 100000 })).body.codigo).toBe('CITA_NO_ES_HOY');
  });

  it('no se puede usar un puesto ocupado', async () => {
    const { jefe, cita } = await citaDeHoy();
    const luis = await clienteConCoche('luis@cliente.test', '5555BBB');
    const otra = (await reservar(luis, '2026-11-09', '09:00')).body;
    const puesto = await prisma.puesto.findFirstOrThrow({ where: { nombre: 'Puesto 1' } });
    await jefe.post(`/api/citas/${cita.id}/recibir`).send({ kmEntrada: 98450, puestoId: puesto.id });
    const r = await jefe.post(`/api/citas/${otra.id}/recibir`).send({ kmEntrada: 98450, puestoId: puesto.id });
    expect(r.status).toBe(409);
    expect(r.body.codigo).toBe('PUESTO_OCUPADO');
    expect(await prisma.orden.count()).toBe(1); // la transacción se deshizo entera
  });

  it('no presentado solo después de la hora de la cita', async () => {
    const { jefe, ana, cita } = await citaDeHoy();
    expect((await jefe.post(`/api/citas/${cita.id}/no-presentado`).send({})).body.codigo).toBe('CITA_NO_EMPEZADA');
    reloj.fijar(new Date('2026-11-09T09:00:00Z'));
    expect((await jefe.post(`/api/citas/${cita.id}/no-presentado`).send({})).body.estado).toBe('NO_PRESENTADO');
    expect((await emailsA(ana.email)).map((e) => e.plantilla)).toContain('CITA_NO_PRESENTADO');
  });

  it('el jefe ve las citas del día con cliente y vehículo', async () => {
    const { jefe } = await citaDeHoy();
    const r = await jefe.get('/api/citas?fecha=2026-11-09');
    expect(r.body.datos).toHaveLength(1);
    expect(r.body.datos[0]).toMatchObject({ hora: '09:00', vehiculo: { matricula: '1234ABC' }, cliente: { nombre: 'ana' } });
  });
});

describe('reserva múltiple (empresas)', () => {
  async function flota() {
    await tallerAbierto(2); // capacidad 3
    const jefe = await entrar('jefe@taller.test', 'JEFE');
    const emp = await entrar('flota@empresa.test', 'CLIENTE', { empresa: true });
    const ids: string[] = [];
    for (const m of ['1111AAA', '2222BBB', '3333CCC']) ids.push((await emp.post('/api/vehiculos').send({ matricula: m, marca: 'Ford', modelo: 'Transit' })).body.id);
    return { jefe, emp, ids };
  }

  it('flujo completo: pedir → ofrecer día → aceptar crea citas confirmadas', async () => {
    const { jefe, emp, ids } = await flota();
    const r = await emp.post('/api/reservas-multiples').send({ vehiculoIds: ids, fechasPreferidas: [PASADO, '2026-11-12'] });
    expect(r.status).toBe(201);
    expect(r.body.estado).toBe('EN_ESPERA');
    expect((await emailsA('jefe@taller.test')).map((e) => e.plantilla)).toContain('RESERVA_MULTIPLE_NUEVA');
    expect(r.body.codigo).toBe('RM-01');
    const o = await jefe.post(`/api/reservas-multiples/${r.body.id}/ofrecer`).send({ fecha: PASADO, franjas: ['09:00', '09:30', '10:00'] });
    expect(o.body).toMatchObject({ estado: 'HUECO_OFRECIDO', fechaOfrecida: PASADO, franjasOfrecidas: [madrid(PASADO, '09:00'), madrid(PASADO, '09:30'), madrid(PASADO, '10:00')] });
    const oferta = (await emailsA('flota@empresa.test')).find((e) => e.plantilla === 'HUECO_OFRECIDO');
    expect(oferta?.datos).toMatchObject({ franjas: '09:00, 09:30 y 10:00' });
    const a = await emp.post(`/api/reservas-multiples/${r.body.id}/aceptar`).send({});
    expect(a.body.estado).toBe('CONVERTIDA');
    const citas = await prisma.cita.findMany({ orderBy: { inicio: 'asc' }, include: { vehiculo: true } });
    expect(citas.map((c) => c.estado)).toEqual(['CONFIRMADA', 'CONFIRMADA', 'CONFIRMADA']);
    // Cada vehículo, en la franja que eligió el jefe y en el orden de la solicitud
    expect(citas.map((c) => [c.vehiculo.matricula, c.inicio.toISOString()])).toEqual([
      ['1111AAA', madrid(PASADO, '09:00')],
      ['2222BBB', madrid(PASADO, '09:30')],
      ['3333CCC', madrid(PASADO, '10:00')],
    ]);
    expect((await emailsA('flota@empresa.test')).map((e) => e.plantilla)).toEqual(
      expect.arrayContaining(['RESERVA_MULTIPLE_RECIBIDA', 'HUECO_OFRECIDO', 'RESERVA_MULTIPLE_CONFIRMADA']),
    );
  });

  it('un particular no puede pedir reserva múltiple', async () => {
    await tallerAbierto(1);
    const ana = await clienteConCoche();
    const otro = (await ana.post('/api/vehiculos').send({ matricula: '7777DDD', marca: 'Seat', modelo: 'Ibiza' })).body.id;
    const r = await ana.post('/api/reservas-multiples').send({ vehiculoIds: [ana.vehiculoId, otro], fechasPreferidas: [PASADO] });
    expect(r.status).toBe(422);
    expect(r.body.codigo).toBe('SOLO_EMPRESAS');
  });

  it('valida vehículos repetidos, ajenos y fechas pasadas', async () => {
    const { emp, ids } = await flota();
    expect((await emp.post('/api/reservas-multiples').send({ vehiculoIds: [ids[0], ids[0]], fechasPreferidas: [PASADO] })).status).toBe(400);
    expect((await emp.post('/api/reservas-multiples').send({ vehiculoIds: ids, fechasPreferidas: ['2026-11-01'] })).body.codigo).toBe('FECHA_NO_VALIDA');
    const ana = await clienteConCoche();
    expect((await emp.post('/api/reservas-multiples').send({ vehiculoIds: [ids[0], ana.vehiculoId], fechasPreferidas: [PASADO] })).status).toBe(404);
  });

  it('no se ofrece un día sin hueco para todos', async () => {
    const { jefe, emp, ids } = await flota();
    const otro = await clienteConCoche('luis@cliente.test', '9999XYZ');
    await reservar(otro, PASADO);
    const r = (await emp.post('/api/reservas-multiples').send({ vehiculoIds: ids, fechasPreferidas: [PASADO] })).body;
    const o = await jefe.post(`/api/reservas-multiples/${r.id}/ofrecer`).send({ fecha: PASADO, franjas: ['09:00', '09:30', '10:00'] });
    expect(o.status).toBe(409);
    expect(o.body.codigo).toBe('SIN_HUECO');
  });

  it('QA: si el hueco se ocupa entre la oferta y la aceptación, vuelve a espera', async () => {
    const { jefe, emp, ids } = await flota();
    const r = (await emp.post('/api/reservas-multiples').send({ vehiculoIds: ids, fechasPreferidas: [PASADO] })).body;
    await jefe.post(`/api/reservas-multiples/${r.id}/ofrecer`).send({ fecha: PASADO, franjas: ['08:00', '08:30', '09:00'] });
    await reservar(await clienteConCoche('luis@cliente.test', '9999XYZ'), PASADO);
    const a = await emp.post(`/api/reservas-multiples/${r.id}/aceptar`).send({});
    expect(a.status).toBe(409);
    expect(a.body.codigo).toBe('SIN_HUECO');
    expect((await emp.get('/api/reservas-multiples')).body.datos[0].estado).toBe('EN_ESPERA');
    expect(await prisma.cita.count({ where: { reservaMultipleId: r.id } })).toBe(0);
  });

  it('aceptar dos veces no duplica citas', async () => {
    const { jefe, emp, ids } = await flota();
    const r = (await emp.post('/api/reservas-multiples').send({ vehiculoIds: ids, fechasPreferidas: [PASADO] })).body;
    await jefe.post(`/api/reservas-multiples/${r.id}/ofrecer`).send({ fecha: PASADO, franjas: ['08:00', '08:30', '09:00'] });
    const [a, b] = await Promise.all([emp.post(`/api/reservas-multiples/${r.id}/aceptar`).send({}), emp.post(`/api/reservas-multiples/${r.id}/aceptar`).send({})]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await prisma.cita.count()).toBe(3);
  });

  /** Capacidad 6: así lo que se llena es la franja, no el día. */
  async function tallerGrande() {
    await prisma.puesto.createMany({ data: [{ nombre: 'Puesto 4' }, { nombre: 'Puesto 5' }, { nombre: 'Puesto 6' }] });
    await entrar('mec3@taller.test', 'MECANICO');
  }

  it('las franjas ofrecidas deben ser una por vehículo, del horario y con hueco', async () => {
    const { jefe, emp, ids } = await flota();
    await tallerGrande();
    const r = (await emp.post('/api/reservas-multiples').send({ vehiculoIds: ids, fechasPreferidas: [PASADO] })).body;
    const ofrecer = (franjas: string[]) => jefe.post(`/api/reservas-multiples/${r.id}/ofrecer`).send({ fecha: PASADO, franjas });
    expect((await ofrecer(['09:00', '09:30'])).body.codigo).toBe('FRANJAS_NO_COINCIDEN');
    expect((await ofrecer(['09:00', '09:00', '09:30'])).status).toBe(400);
    expect((await ofrecer(['9:00', '09:30', '10:00'])).status).toBe(400);
    expect((await ofrecer(['07:00', '09:30', '10:00'])).body.codigo).toBe('FRANJA_NO_VALIDA');
    expect((await ofrecer(['09:15', '09:30', '10:00'])).body.codigo).toBe('FRANJA_NO_VALIDA');
    // Una franja ya llena no se puede ofrecer
    await reservar(await clienteConCoche('luis@cliente.test', '9999XYZ'), PASADO, '11:00');
    await reservar(await clienteConCoche('eva@cliente.test', '8888XYZ'), PASADO, '11:00');
    const llena = await ofrecer(['09:00', '09:30', '11:00']);
    expect(llena.status).toBe(409);
    expect(llena.body.codigo).toBe('SIN_HUECO');
    expect(llena.body.error).toContain('11:00');
    expect((await emp.get('/api/reservas-multiples')).body.datos[0].estado).toBe('EN_ESPERA');
  });

  it('QA: si una franja ofrecida se llena antes de aceptar, vuelve a espera sin crear citas', async () => {
    const { jefe, emp, ids } = await flota();
    await tallerGrande();
    const r = (await emp.post('/api/reservas-multiples').send({ vehiculoIds: ids, fechasPreferidas: [PASADO] })).body;
    await jefe.post(`/api/reservas-multiples/${r.id}/ofrecer`).send({ fecha: PASADO, franjas: ['09:00', '09:30', '11:00'] });
    await reservar(await clienteConCoche('luis@cliente.test', '9999XYZ'), PASADO, '11:00');
    await reservar(await clienteConCoche('eva@cliente.test', '8888XYZ'), PASADO, '11:00');
    const a = await emp.post(`/api/reservas-multiples/${r.id}/aceptar`).send({});
    expect(a.status).toBe(409);
    expect(a.body.codigo).toBe('SIN_HUECO');
    const tras = (await emp.get('/api/reservas-multiples')).body.datos[0];
    expect(tras).toMatchObject({ estado: 'EN_ESPERA', fechaOfrecida: null, franjasOfrecidas: [] });
    expect(await prisma.cita.count({ where: { reservaMultipleId: r.id } })).toBe(0);
  });

  it('«Confirmar ya»: si la empresa acepta por teléfono, el jefe confirma y la empresa recibe el email', async () => {
    const { jefe, emp, ids } = await flota();
    const r = (await emp.post('/api/reservas-multiples').send({ vehiculoIds: ids, fechasPreferidas: [PASADO] })).body;
    await jefe.post(`/api/reservas-multiples/${r.id}/ofrecer`).send({ fecha: PASADO, franjas: ['09:00', '09:30', '10:00'] });
    const a = await jefe.post(`/api/reservas-multiples/${r.id}/aceptar`).send({});
    expect(a.body.estado).toBe('CONVERTIDA');
    expect((await emailsA('flota@empresa.test')).map((e) => e.plantilla)).toContain('RESERVA_MULTIPLE_CONFIRMADA');
    expect((await emailsA('jefe@taller.test')).map((e) => e.plantilla)).not.toContain('RESERVA_MULTIPLE_CONFIRMADA');
    const mec = await entrar('mec1@taller.test', 'MECANICO');
    expect((await mec.post(`/api/reservas-multiples/${r.id}/aceptar`).send({})).status).toBe(403);
  });

  it('cancelar una reserva en espera', async () => {
    const { emp, ids } = await flota();
    const r = (await emp.post('/api/reservas-multiples').send({ vehiculoIds: ids, fechasPreferidas: [PASADO] })).body;
    expect((await emp.post(`/api/reservas-multiples/${r.id}/cancelar`).send({})).body.estado).toBe('CANCELADA');
  });
});

void AHORA;
