import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../db';
import { reloj } from '../lib/reloj';
import { emailsA, entrar, ordenEnDiagnostico, ordenEnReparacion, PARTIDAS, reiniciarBd, clienteConCoche } from './ayudas';

beforeEach(reiniciarBd);

describe('ver órdenes', () => {
  it('el cliente ve su orden; otro cliente recibe 404', async () => {
    const { ana, orden } = await ordenEnDiagnostico();
    expect((await ana.get(`/api/ordenes/${orden.id}`)).body).toMatchObject({ codigo: 'OR-0001', estado: 'EN_DIAGNOSTICO' });
    const luis = await clienteConCoche('luis@cliente.test', '9999XYZ');
    expect((await luis.get(`/api/ordenes/${orden.id}`)).status).toBe(404);
    expect((await luis.get('/api/ordenes')).body.datos).toHaveLength(0);
    expect((await luis.get(`/api/ordenes/${orden.id}/factura.pdf`)).status).toBe(404);
  });

  it('el cliente no ve observaciones internas ni eventos internos', async () => {
    const { mec, ana, orden } = await ordenEnDiagnostico();
    await mec.post(`/api/ordenes/${orden.id}/observaciones`).send({ texto: 'Cliente difícil', interna: true });
    await mec.post(`/api/ordenes/${orden.id}/observaciones`).send({ texto: 'Pastillas al 10 %', interna: false });
    const vista = (await ana.get(`/api/ordenes/${orden.id}`)).body;
    expect(vista.observaciones.map((o: { texto: string }) => o.texto)).toEqual(['Pastillas al 10 %']);
    expect(vista.eventos.some((e: { tipo: string }) => e.tipo === 'PUESTO_ASIGNADO')).toBe(false);
    const interna = (await mec.get(`/api/ordenes/${orden.id}`)).body;
    expect(interna.observaciones).toHaveLength(2);
  });

  it('el mecánico ve las órdenes abiertas de sus puestos de hoy', async () => {
    const { jefe, mec, orden, puesto } = await ordenEnDiagnostico();
    expect((await mec.get('/api/ordenes?mias=true')).body.datos).toHaveLength(0);
    await jefe.put('/api/asignaciones').send({ fecha: '2026-11-09', puestoId: puesto.id, empleadoId: mec.empleadoId });
    expect((await mec.get('/api/ordenes?mias=true')).body.datos.map((o: { id: string }) => o.id)).toEqual([orden.id]);
  });

  it('historial del mecánico: las órdenes en las que ha registrado trabajo', async () => {
    const { mec, orden, partidas } = await ordenEnReparacion();
    const otro = await entrar('mec2@taller.test', 'MECANICO');
    expect((await mec.get('/api/ordenes?trabajadas=true')).body.datos).toHaveLength(0);
    await mec.post(`/api/ordenes/${orden.id}/trabajos`).send({ partidaId: partidas[0].id, minutos: 30, descripcion: 'Desmontar ruedas' });
    expect((await mec.get('/api/ordenes?trabajadas=true')).body.datos.map((o: { id: string }) => o.id)).toEqual([orden.id]);
    expect((await otro.get('/api/ordenes?trabajadas=true')).body.datos).toHaveLength(0);
  });

  it('el cliente no puede escribir en la orden', async () => {
    const { ana, orden } = await ordenEnDiagnostico();
    expect((await ana.post(`/api/ordenes/${orden.id}/observaciones`).send({ texto: 'hola', interna: false })).status).toBe(403);
    expect((await ana.post(`/api/ordenes/${orden.id}/solicitudes`).send({ partidas: PARTIDAS })).status).toBe(403);
    expect((await ana.post(`/api/ordenes/${orden.id}/completar`).send({ kmSalida: 98510 })).status).toBe(403);
  });
});

describe('solicitud de autorización', () => {
  it('el mecánico propone trabajos; el importe se calcula con la tarifa; el cliente recibe el presupuesto con IVA', async () => {
    const { mec, ana, orden } = await ordenEnDiagnostico();
    const r = await mec.post(`/api/ordenes/${orden.id}/solicitudes`).send({ partidas: PARTIDAS });
    expect(r.status).toBe(201);
    expect(r.body.partidas.map((p: { importeEstimadoCentimos: number }) => p.importeEstimadoCentimos)).toEqual([4000 + 5600, 2000 + 10850]);
    const detalle = (await ana.get(`/api/ordenes/${orden.id}`)).body;
    expect(detalle.estado).toBe('ESPERANDO_AUTORIZACION');
    expect(detalle.presupuesto).toEqual({ base: 22450, iva: 4715, total: 27165 });
    const email = (await emailsA('ana@cliente.test')).find((e) => e.plantilla === 'SOLICITUD_AUTORIZACION');
    expect(email?.datos).toMatchObject({ total: expect.stringContaining('271,65') });
  });

  it('no se puede pedir otra autorización con una pendiente', async () => {
    const { mec, orden } = await ordenEnDiagnostico();
    await mec.post(`/api/ordenes/${orden.id}/solicitudes`).send({ partidas: PARTIDAS });
    const r = await mec.post(`/api/ordenes/${orden.id}/solicitudes`).send({ partidas: PARTIDAS });
    expect(r.status).toBe(409);
  });

  it('QA: horas negativas, cero partidas o importes absurdos', async () => {
    const { mec, orden } = await ordenEnDiagnostico();
    for (const partidas of [[], [{ ...PARTIDAS[0], horasEstimadas: -1 }], [{ ...PARTIDAS[0], piezasEstimadasCentimos: 1.5 }], [{ ...PARTIDAS[0], horasEstimadas: 1000 }], [{ ...PARTIDAS[0], descripcion: '' }]]) {
      expect((await mec.post(`/api/ordenes/${orden.id}/solicitudes`).send({ partidas })).status).toBe(400);
    }
  });

  it('el cliente responde todo de una vez: aceptadas a reparación, avisa al mecánico', async () => {
    const { mec, ana, orden } = await ordenEnDiagnostico();
    const s = (await mec.post(`/api/ordenes/${orden.id}/solicitudes`).send({ partidas: PARTIDAS })).body;
    const r = await ana.post(`/api/solicitudes/${s.id}/responder`).send({ decisiones: { [s.partidas[0].id]: 'ACEPTADA', [s.partidas[1].id]: 'RECHAZADA' }, comentario: 'El sensor otro día' });
    expect(r.status).toBe(200);
    expect(r.body.estado).toBe('EN_REPARACION');
    expect((await emailsA('mec1@taller.test')).map((e) => e.plantilla)).toContain('RESPUESTA_CLIENTE');
    expect((await ana.get(`/api/ordenes/${orden.id}`)).body.presupuesto).toEqual({ base: 9600, iva: 2016, total: 11616 });
  });

  it('QA: respuesta parcial o con partidas de otra solicitud: 422', async () => {
    const { mec, ana, orden } = await ordenEnDiagnostico();
    const s = (await mec.post(`/api/ordenes/${orden.id}/solicitudes`).send({ partidas: PARTIDAS })).body;
    const parcial = await ana.post(`/api/solicitudes/${s.id}/responder`).send({ decisiones: { [s.partidas[0].id]: 'ACEPTADA' } });
    expect(parcial.status).toBe(422);
    expect(parcial.body.codigo).toBe('RESPUESTA_INCOMPLETA');
    const ajena = await ana.post(`/api/solicitudes/${s.id}/responder`).send({ decisiones: { [s.partidas[0].id]: 'ACEPTADA', [s.partidas[1].id]: 'ACEPTADA', otra: 'ACEPTADA' } });
    expect(ajena.status).toBe(422);
    expect((await prisma.partida.findMany()).every((p) => p.estado === 'PENDIENTE')).toBe(true);
  });

  it('QA: responder dos veces a la vez → una gana, la otra 409', async () => {
    const { mec, ana, orden } = await ordenEnDiagnostico();
    const s = (await mec.post(`/api/ordenes/${orden.id}/solicitudes`).send({ partidas: PARTIDAS })).body;
    const acepta = { decisiones: { [s.partidas[0].id]: 'ACEPTADA', [s.partidas[1].id]: 'ACEPTADA' } };
    const rechaza = { decisiones: { [s.partidas[0].id]: 'RECHAZADA', [s.partidas[1].id]: 'RECHAZADA' } };
    const [a, b] = await Promise.all([ana.post(`/api/solicitudes/${s.id}/responder`).send(acepta), ana.post(`/api/solicitudes/${s.id}/responder`).send(rechaza)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const estados = new Set((await prisma.partida.findMany()).map((p) => p.estado));
    expect(estados.size).toBe(1); // o todas aceptadas o todas rechazadas, nunca mezcla
  });

  it('QA: otro cliente no puede responder; el mecánico tampoco', async () => {
    const { mec, orden } = await ordenEnDiagnostico();
    const s = (await mec.post(`/api/ordenes/${orden.id}/solicitudes`).send({ partidas: PARTIDAS })).body;
    const luis = await clienteConCoche('luis@cliente.test', '9999XYZ');
    const d = { decisiones: { [s.partidas[0].id]: 'ACEPTADA', [s.partidas[1].id]: 'ACEPTADA' } };
    expect((await luis.post(`/api/solicitudes/${s.id}/responder`).send(d)).status).toBe(404);
    expect((await mec.post(`/api/solicitudes/${s.id}/responder`).send(d)).status).toBe(403);
  });

  it('rechazar todo en la primera solicitud cierra la orden y avisa al cliente', async () => {
    const { ana, orden } = await ordenEnReparacion(['RECHAZADA']);
    expect((await ana.get(`/api/ordenes/${orden.id}`)).body.estado).toBe('RECHAZADA');
    expect((await emailsA('ana@cliente.test')).map((e) => e.plantilla)).toContain('ORDEN_RECHAZADA');
  });

  it('se puede volver a pedir autorización desde reparación; rechazarla sigue en reparación', async () => {
    const { mec, ana, orden } = await ordenEnReparacion(['ACEPTADA']);
    const s2 = (await mec.post(`/api/ordenes/${orden.id}/solicitudes`).send({ partidas: [PARTIDAS[1]] })).body;
    expect((await ana.get(`/api/ordenes/${orden.id}`)).body.estado).toBe('ESPERANDO_AUTORIZACION');
    const r = await ana.post(`/api/solicitudes/${s2.id}/responder`).send({ decisiones: { [s2.partidas[0].id]: 'RECHAZADA' } });
    expect(r.body.estado).toBe('EN_REPARACION');
  });
});

describe('trabajo en la orden', () => {
  it('registrar horas y usar piezas descuenta stock y deja traza', async () => {
    const { mec, orden, partidas, pieza } = await ordenEnReparacion();
    expect((await mec.post(`/api/ordenes/${orden.id}/trabajos`).send({ partidaId: partidas[0].id, minutos: 60, descripcion: 'Desmontar y cambiar' })).status).toBe(201);
    expect((await mec.post(`/api/partidas/${partidas[0].id}/piezas-usadas`).send({ piezaId: pieza.id, cantidad: 2 })).status).toBe(201);
    expect((await prisma.pieza.findUniqueOrThrow({ where: { id: pieza.id } })).stock).toBe(1);
    const q = await mec.post(`/api/partidas/${partidas[0].id}/piezas-quitadas`).send({ descripcion: 'Pastillas gastadas', cantidad: 2, destino: 'DESECHADA' });
    expect(q.status).toBe(201);
    const hist = (await mec.get(`/api/vehiculos/${orden.vehiculo.id}/historial`)).body;
    expect(hist.ordenes[0].trabajos[0].piezasUsadas[0]).toMatchObject({ referencia: 'PF-001', cantidad: 2, mecanico: 'mec1' });
    expect(hist.ordenes[0].trabajos[0].piezasQuitadas[0]).toMatchObject({ destino: 'DESECHADA' });
  });

  it('QA: usar más piezas de las que hay: 409 y el stock no se toca', async () => {
    const { mec, partidas, pieza } = await ordenEnReparacion();
    const r = await mec.post(`/api/partidas/${partidas[0].id}/piezas-usadas`).send({ piezaId: pieza.id, cantidad: 4 });
    expect(r.status).toBe(409);
    expect(r.body.codigo).toBe('STOCK_INSUFICIENTE');
    expect((await prisma.pieza.findUniqueOrThrow({ where: { id: pieza.id } })).stock).toBe(3);
  });

  it('QA: dos mecánicos cogen la última pieza a la vez → solo uno', async () => {
    const { mec, partidas, pieza } = await ordenEnReparacion();
    await prisma.pieza.update({ where: { id: pieza.id }, data: { stock: 1 } });
    const otro = await entrar('mec2@taller.test', 'MECANICO');
    const [a, b] = await Promise.all([
      mec.post(`/api/partidas/${partidas[0].id}/piezas-usadas`).send({ piezaId: pieza.id, cantidad: 1 }),
      otro.post(`/api/partidas/${partidas[1].id}/piezas-usadas`).send({ piezaId: pieza.id, cantidad: 1 }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect((await prisma.pieza.findUniqueOrThrow({ where: { id: pieza.id } })).stock).toBe(0);
    expect(await prisma.piezaUsada.count()).toBe(1);
  });

  it('QA: cantidades negativas o cero', async () => {
    const { mec, orden, partidas, pieza } = await ordenEnReparacion();
    expect((await mec.post(`/api/partidas/${partidas[0].id}/piezas-usadas`).send({ piezaId: pieza.id, cantidad: -3 })).status).toBe(400);
    expect((await mec.post(`/api/partidas/${partidas[0].id}/piezas-usadas`).send({ piezaId: pieza.id, cantidad: 0 })).status).toBe(400);
    expect((await mec.post(`/api/ordenes/${orden.id}/trabajos`).send({ partidaId: partidas[0].id, minutos: -60, descripcion: 'x' })).status).toBe(400);
    expect((await prisma.pieza.findUniqueOrThrow({ where: { id: pieza.id } })).stock).toBe(3);
  });

  it('QA: no se usan piezas en un trabajo rechazado o sin respuesta', async () => {
    const { mec, partidas, pieza } = await ordenEnReparacion(['ACEPTADA', 'RECHAZADA']);
    const r = await mec.post(`/api/partidas/${partidas[1].id}/piezas-usadas`).send({ piezaId: pieza.id, cantidad: 1 });
    expect(r.status).toBe(422);
    expect(r.body.codigo).toBe('TRABAJO_NO_ACEPTADO');
  });

  it('QA: no se registran horas en una partida de otra orden', async () => {
    const a = await ordenEnReparacion();
    const r = await a.mec.post(`/api/ordenes/no-existe/trabajos`).send({ partidaId: a.partidas[0].id, minutos: 10, descripcion: 'x' });
    expect(r.status).toBe(404);
  });
});

describe('pedidos de piezas', () => {
  it('pedir → aprobar → recibir suma stock y avisa al mecánico', async () => {
    const { jefe, mec, partidas, pieza } = await ordenEnReparacion();
    const p = await mec.post(`/api/partidas/${partidas[0].id}/pedidos`).send({ piezaId: pieza.id, cantidad: 2 });
    expect(p.status).toBe(201);
    expect((await emailsA('jefe@taller.test')).map((e) => e.plantilla)).toContain('PEDIDO_PENDIENTE');
    expect((await mec.post(`/api/pedidos/${p.body.id}/aprobar`).send({})).status).toBe(403);
    expect((await jefe.post(`/api/pedidos/${p.body.id}/aprobar`).send({})).body.estado).toBe('APROBADO');
    expect((await jefe.post(`/api/pedidos/${p.body.id}/recibir`).send({})).body.estado).toBe('RECIBIDO');
    expect((await prisma.pieza.findUniqueOrThrow({ where: { id: pieza.id } })).stock).toBe(5);
    expect((await emailsA('mec1@taller.test')).map((e) => e.plantilla)).toEqual(expect.arrayContaining(['PEDIDO_APROBADO', 'PIEZA_RECIBIDA']));
  });

  it('QA: recibir dos veces no duplica el stock', async () => {
    const { jefe, mec, partidas, pieza } = await ordenEnReparacion();
    const p = (await mec.post(`/api/partidas/${partidas[0].id}/pedidos`).send({ piezaId: pieza.id, cantidad: 2 })).body;
    await jefe.post(`/api/pedidos/${p.id}/aprobar`).send({});
    const [a, b] = await Promise.all([jefe.post(`/api/pedidos/${p.id}/recibir`).send({}), jefe.post(`/api/pedidos/${p.id}/recibir`).send({})]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect((await prisma.pieza.findUniqueOrThrow({ where: { id: pieza.id } })).stock).toBe(5);
  });

  it('no se recibe un pedido sin aprobar; rechazar exige motivo', async () => {
    const { jefe, mec, partidas } = await ordenEnReparacion();
    const p = (await mec.post(`/api/partidas/${partidas[0].id}/pedidos`).send({ descripcionLibre: 'Sensor ABS Bosch', cantidad: 1 })).body;
    expect((await jefe.post(`/api/pedidos/${p.id}/recibir`).send({})).status).toBe(409);
    expect((await jefe.post(`/api/pedidos/${p.id}/rechazar`).send({})).status).toBe(400);
    expect((await jefe.post(`/api/pedidos/${p.id}/rechazar`).send({ motivo: 'Hay otro compatible' })).body.estado).toBe('RECHAZADO');
  });

  it('un pedido necesita pieza del catálogo o descripción', async () => {
    const { mec, partidas } = await ordenEnReparacion();
    expect((await mec.post(`/api/partidas/${partidas[0].id}/pedidos`).send({ cantidad: 1 })).status).toBe(400);
  });
});

describe('catálogo de piezas', () => {
  it('el jefe da de alta y ajusta stock; nunca negativo', async () => {
    const jefe = await entrar('jefe@taller.test', 'JEFE');
    const p = (await jefe.post('/api/piezas').send({ referencia: 'flt-01', nombre: 'Filtro de aceite', precioCentimos: 1200, stock: 5 })).body;
    expect(p.referencia).toBe('FLT-01');
    expect((await jefe.post(`/api/piezas/${p.id}/ajuste-stock`).send({ delta: -6, motivo: 'Inventario' })).body.codigo).toBe('STOCK_INSUFICIENTE');
    expect((await jefe.post(`/api/piezas/${p.id}/ajuste-stock`).send({ delta: -5, motivo: 'Inventario' })).body.stock).toBe(0);
    expect((await jefe.post('/api/piezas').send({ referencia: 'FLT-01', nombre: 'Otro', precioCentimos: 1, stock: 0 })).status).toBe(409);
    expect((await jefe.get('/api/piezas?stockBajo=true')).body.datos).toHaveLength(1);
  });

  it('el mecánico consulta pero no modifica', async () => {
    const mec = await entrar('mec1@taller.test', 'MECANICO');
    expect((await mec.get('/api/piezas')).status).toBe(200);
    expect((await mec.post('/api/piezas').send({ referencia: 'X', nombre: 'X', precioCentimos: 1, stock: 1 })).status).toBe(403);
  });
});

describe('completar, factura y entrega', () => {
  async function lista() {
    const e = await ordenEnReparacion(['ACEPTADA', 'RECHAZADA']);
    await e.mec.post(`/api/ordenes/${e.orden.id}/trabajos`).send({ partidaId: e.partidas[0].id, minutos: 90, descripcion: 'Cambio de pastillas' });
    await e.mec.post(`/api/partidas/${e.partidas[0].id}/piezas-usadas`).send({ piezaId: e.pieza.id, cantidad: 1 });
    return e;
  }

  it('QA: no se completa con trabajos sin terminar, y explica por qué', async () => {
    const { mec, orden } = await lista();
    const r = await mec.post(`/api/ordenes/${orden.id}/completar`).send({ kmSalida: 98510 });
    expect(r.status).toBe(422);
    expect(r.body).toMatchObject({ codigo: 'NO_COMPLETABLE', error: 'Termina el trabajo en curso' });
  });

  it('completar calcula la factura real, envía el email con el PDF y el cliente lo descarga', async () => {
    const { mec, ana, orden, partidas } = await lista();
    expect((await mec.post(`/api/partidas/${partidas[0].id}/terminar`).send({})).status).toBe(200);
    const r = await mec.post(`/api/ordenes/${orden.id}/completar`).send({ kmSalida: 98510 });
    expect(r.status).toBe(200);
    expect(r.body.estado).toBe('COMPLETADA');
    const detalle = (await ana.get(`/api/ordenes/${orden.id}`)).body;
    expect(detalle.factura).toEqual({ base: 5600 + 6000, iva: 2436, total: 14036, lineas: expect.any(Array) });
    const email = (await emailsA('ana@cliente.test')).find((e) => e.plantilla === 'ORDEN_COMPLETADA');
    expect(email?.adjuntoFacturaOrdenId).toBe(orden.id);
    const pdf = await ana.get(`/api/ordenes/${orden.id}/factura.pdf`).buffer(true).parse((res, cb) => {
      const t: Buffer[] = [];
      res.on('data', (c: Buffer) => t.push(c));
      res.on('end', () => cb(null, Buffer.concat(t)));
    });
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });

  it('la factura no existe hasta completar', async () => {
    const { ana, orden } = await lista();
    expect((await ana.get(`/api/ordenes/${orden.id}/factura.pdf`)).status).toBe(409);
  });

  it('QA: tras completar no se puede seguir registrando trabajo ni piezas', async () => {
    const { mec, orden, partidas, pieza } = await lista();
    await mec.post(`/api/partidas/${partidas[0].id}/terminar`).send({});
    await mec.post(`/api/ordenes/${orden.id}/completar`).send({ kmSalida: 98510 });
    expect((await mec.post(`/api/ordenes/${orden.id}/trabajos`).send({ partidaId: partidas[0].id, minutos: 10, descripcion: 'x' })).status).toBe(409);
    expect((await mec.post(`/api/partidas/${partidas[0].id}/piezas-usadas`).send({ piezaId: pieza.id, cantidad: 1 })).status).toBe(409);
  });

  it('solo el jefe entrega; libera el puesto; entregar dos veces da 409', async () => {
    const { jefe, mec, orden, partidas, puesto } = await lista();
    await mec.post(`/api/partidas/${partidas[0].id}/terminar`).send({});
    await mec.post(`/api/ordenes/${orden.id}/completar`).send({ kmSalida: 98510 });
    expect((await mec.post(`/api/ordenes/${orden.id}/entregar`).send({})).status).toBe(403);
    expect((await jefe.post(`/api/ordenes/${orden.id}/entregar`).send({})).body.estado).toBe('ENTREGADA');
    expect(await prisma.ocupacionPuesto.count({ where: { puestoId: puesto.id, fin: null } })).toBe(0);
    expect((await jefe.post(`/api/ordenes/${orden.id}/entregar`).send({})).status).toBe(409);
    expect((await emailsA('ana@cliente.test')).map((e) => e.plantilla)).toContain('VEHICULO_ENTREGADO');
  });

  it('una orden rechazada se entrega sin factura, pero con los km de salida', async () => {
    const { jefe, orden } = await ordenEnReparacion(['RECHAZADA']);
    const sinKm = await jefe.post(`/api/ordenes/${orden.id}/entregar`).send({});
    expect(sinKm.status).toBe(422);
    expect(sinKm.body.codigo).toBe('KM_SALIDA_REQUERIDOS');
    const r = await jefe.post(`/api/ordenes/${orden.id}/entregar`).send({ kmSalida: 98500 });
    expect(r.body).toMatchObject({ estado: 'ENTREGADA', kmSalida: 98500 });
  });

  it('completar exige los km de salida, nunca menos que los de entrada, y actualiza el vehículo', async () => {
    const { mec, ana, orden, partidas } = await lista();
    await mec.post(`/api/partidas/${partidas[0].id}/terminar`).send({});
    expect((await mec.post(`/api/ordenes/${orden.id}/completar`).send({})).status).toBe(400);
    const menos = await mec.post(`/api/ordenes/${orden.id}/completar`).send({ kmSalida: 98499 });
    expect(menos.status).toBe(422);
    expect(menos.body.codigo).toBe('KM_MENOR');
    expect((await mec.post(`/api/ordenes/${orden.id}/completar`).send({ kmSalida: -1 })).status).toBe(400);
    const r = await mec.post(`/api/ordenes/${orden.id}/completar`).send({ kmSalida: 98512 });
    expect(r.body).toMatchObject({ estado: 'COMPLETADA', kmEntrada: 98500, kmSalida: 98512 });
    expect((await prisma.vehiculo.findUniqueOrThrow({ where: { id: orden.vehiculo.id } })).kilometros).toBe(98512);
    expect((await ana.get(`/api/ordenes/${orden.id}`)).body.kmSalida).toBe(98512);
  });

  it('al entregar, el jefe confirma o corrige los km de salida (queda en la línea de tiempo)', async () => {
    const { jefe, mec, orden, partidas } = await lista();
    await mec.post(`/api/partidas/${partidas[0].id}/terminar`).send({});
    await mec.post(`/api/ordenes/${orden.id}/completar`).send({ kmSalida: 98512 });
    expect((await jefe.post(`/api/ordenes/${orden.id}/entregar`).send({ kmSalida: 98000 })).body.codigo).toBe('KM_MENOR');
    const r = await jefe.post(`/api/ordenes/${orden.id}/entregar`).send({ kmSalida: 98520 });
    expect(r.body).toMatchObject({ estado: 'ENTREGADA', kmSalida: 98520 });
    expect((await prisma.vehiculo.findUniqueOrThrow({ where: { id: orden.vehiculo.id } })).kilometros).toBe(98520);
    const correccion = r.body.eventos.find((e: { tipo: string }) => e.tipo === 'KM_CORREGIDOS');
    expect(correccion?.payload).toMatchObject({ de: 98512, a: 98520 });
  });

  it('el PDF lleva los km de entrada y de salida', async () => {
    const { mec, orden, partidas } = await lista();
    await mec.post(`/api/partidas/${partidas[0].id}/terminar`).send({});
    await mec.post(`/api/ordenes/${orden.id}/completar`).send({ kmSalida: 98512 });
    const { calcularFactura, lineaVehiculo } = await import('../modulos/factura');
    expect(lineaVehiculo((await calcularFactura(orden.id)).orden)).toBe('Vehículo: Volkswagen Golf · 1234ABC · 98.500 km a la entrada · 98.512 km a la salida');
  });

  it('esperar piezas y reanudar avisan al cliente', async () => {
    const { mec, orden } = await ordenEnReparacion();
    expect((await mec.post(`/api/ordenes/${orden.id}/estado`).send({ estado: 'ESPERANDO_PIEZAS' })).body.estado).toBe('ESPERANDO_PIEZAS');
    expect((await mec.post(`/api/ordenes/${orden.id}/estado`).send({ estado: 'COMPLETADA' })).status).toBe(400);
    expect((await mec.post(`/api/ordenes/${orden.id}/estado`).send({ estado: 'EN_REPARACION' })).body.estado).toBe('EN_REPARACION');
    expect((await emailsA('ana@cliente.test')).map((e) => e.plantilla)).toEqual(expect.arrayContaining(['ESPERANDO_PIEZAS', 'REPARACION_REANUDADA']));
  });

  it('la entrega estimada no puede estar en el pasado y avisa al cliente', async () => {
    const { mec, orden } = await ordenEnDiagnostico();
    expect((await mec.patch(`/api/ordenes/${orden.id}`).send({ entregaEstimada: '2026-11-01T10:00:00.000Z' })).status).toBe(422);
    const r = await mec.patch(`/api/ordenes/${orden.id}`).send({ entregaEstimada: '2026-11-12T17:00:00.000Z', diagnostico: 'Pastillas gastadas' });
    expect(r.status).toBe(200);
    expect((await emailsA('ana@cliente.test')).map((e) => e.plantilla)).toContain('ENTREGA_ESTIMADA');
  });

  it('la línea de tiempo del cliente cuenta la historia en orden', async () => {
    const { mec, ana, orden, partidas } = await lista();
    await mec.post(`/api/partidas/${partidas[0].id}/terminar`).send({});
    reloj.fijar(new Date('2026-11-09T15:00:00Z'));
    await mec.post(`/api/ordenes/${orden.id}/completar`).send({ kmSalida: 98510 });
    const tipos = (await ana.get(`/api/ordenes/${orden.id}`)).body.eventos.map((e: { tipo: string }) => e.tipo);
    expect(tipos[0]).toBe('ESTADO_CAMBIADO');
    expect(tipos).toEqual(expect.arrayContaining(['SOLICITUD_CREADA', 'PARTIDA_RESPONDIDA', 'TRABAJO_REGISTRADO', 'PIEZA_USADA']));
    expect(tipos.at(-1)).toBe('ESTADO_CAMBIADO');
  });
});
