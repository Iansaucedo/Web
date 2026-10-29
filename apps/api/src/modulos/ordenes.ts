import type { EstadoOrden, Prisma } from '@prisma/client';
import { z } from '../openapi/zod';
import { definir } from '../lib/ruta';
import { prisma } from '../db';
import { transaccion } from '../lib/transaccion';
import { conflicto, noEncontrado, reglaNegocio } from '../lib/errores';
import { reloj } from '../lib/reloj';
import { assertTransicion } from '../domain/estadoOrden';
import { conIva } from '../domain/importes';
import { motivoNoCompletable, RespuestaIncompleta, validarRespuesta } from '../domain/respuesta';
import { empleadoDe, esPersonal, GESTION, PERSONAL } from '../servicios/acceso';
import { obtenerConfig } from '../servicios/config';
import { avisar } from '../servicios/avisos';
import { registrarEvento } from '../servicios/eventos';
import { bloquearOrden, datosVehiculo, ordenAccesible } from '../servicios/ordenes';
import { calcularFactura, facturaPdf } from './factura';
import { adjuntarFotos, MAX_FOTOS_POR_TRABAJO, urlFoto } from '../servicios/fotos';
import { colocarEnPuesto } from './citas';
import { euros, fechaLarga, hora, numeroOrden } from '../emails/formato';
import { fechaDb, diaLocal } from '../lib/fechas';
import { Centimos, Id, Instante, ParamId, TextoLargo, lista } from './esquemas';
import { EstadoOrden as EstadoOrdenSchema, OrdenResumenSchema, aOrdenResumen, incluirResumen } from './ordenes-esquemas';

const Importe = z.object({ base: Centimos, iva: Centimos, total: Centimos });
const EstadoPartida = z.enum(['PENDIENTE', 'ACEPTADA', 'RECHAZADA']);

const PartidaSchema = z
  .object({
    id: Id,
    descripcion: z.string(),
    horasEstimadas: z.number(),
    importeEstimadoCentimos: Centimos,
    estado: EstadoPartida,
    respondidaEn: Instante.nullable(),
    terminadaEn: Instante.nullable(),
    minutosRegistrados: z.number().int(),
    piezasUsadas: z.array(z.object({ id: Id, pieza: z.string(), referencia: z.string(), cantidad: z.number().int(), precioUnitarioCentimos: Centimos, mecanico: z.string(), fecha: Instante })),
    piezasQuitadas: z.array(z.object({ id: Id, descripcion: z.string(), cantidad: z.number().int(), destino: z.enum(['DESECHADA', 'DEVUELTA_CLIENTE']), fecha: Instante })),
    pedidos: z.array(z.object({ id: Id, pieza: z.string(), cantidad: z.number().int(), estado: z.string() })),
    fotos: z.array(z.object({ id: Id, url: z.string(), descripcion: z.string().nullable() })),
  })
  .openapi('Partida');

const SolicitudSchema = z
  .object({ id: Id, estado: z.enum(['PENDIENTE', 'RESPONDIDA']), creadaEn: Instante, respondidaEn: Instante.nullable(), comentarioCliente: z.string().nullable(), creadaPor: z.string(), partidas: z.array(PartidaSchema) })
  .openapi('Solicitud');

const OrdenDetalleSchema = OrdenResumenSchema.extend({
  diagnostico: z.string().nullable(),
  notasRecepcion: z.string().nullable(),
  descripcionProblema: z.string(),
  solicitudes: z.array(SolicitudSchema),
  presupuesto: Importe.openapi({ description: 'Estimado de los trabajos aceptados y pendientes, con IVA' }),
  factura: Importe.extend({ lineas: z.array(z.object({ concepto: z.string(), cantidad: z.number(), precioUnitarioCentimos: Centimos, importeCentimos: Centimos })) })
    .nullable()
    .openapi({ description: 'Solo cuando está completada o entregada: piezas usadas y horas reales' }),
  observaciones: z.array(z.object({ id: Id, texto: z.string(), interna: z.boolean(), autor: z.string(), fecha: Instante })),
  eventos: z.array(z.object({ id: Id, tipo: z.string(), payload: z.record(z.string(), z.unknown()), actor: z.string(), fecha: Instante })),
  motivoNoCompletable: z.string().nullable().openapi({ description: 'Por qué aún no se puede marcar como completada (null si se puede)' }),
}).openapi('OrdenDetalle');

const Km = z.number().int().min(0).max(2_000_000);

function comprobarKmSalida(kmEntrada: number, kmSalida: number) {
  if (kmSalida < kmEntrada) throw reglaNegocio('KM_MENOR', `Los kilómetros de salida no pueden ser menos que los de entrada (${kmEntrada.toLocaleString('es-ES')})`);
}

async function detalle(ordenId: string, verInterno: boolean) {
  const o = await prisma.orden.findUniqueOrThrow({
    where: { id: ordenId },
    include: {
      ...incluirResumen,
      solicitudes: {
        orderBy: { creadaEn: 'asc' },
        include: {
          creadaPor: { include: { usuario: true } },
          partidas: {
            orderBy: { id: 'asc' },
            include: {
              piezasUsadas: { include: { pieza: true, empleado: { include: { usuario: true } } }, orderBy: { fecha: 'asc' } },
              piezasQuitadas: { orderBy: { fecha: 'asc' } },
              pedidos: { include: { pieza: true }, orderBy: { creadoEn: 'asc' } },
              fotos: { orderBy: { subidaEn: 'asc' }, select: { id: true, url: true, descripcion: true } },
              trabajos: true,
            },
          },
        },
      },
      observaciones: { where: verInterno ? {} : { interna: false }, include: { empleado: { include: { usuario: true } } }, orderBy: { fecha: 'asc' } },
      eventos: { where: verInterno ? {} : { visibleCliente: true }, include: { actor: true }, orderBy: [{ fecha: 'asc' }, { id: 'asc' }] },
    },
  });
  const c = await obtenerConfig(prisma);
  const partidas = o.solicitudes.flatMap((s) => s.partidas);
  const estimado = partidas.filter((p) => p.estado !== 'RECHAZADA').reduce((s, p) => s + p.importeEstimadoCentimos, 0);
  const { base, iva, total } = conIva(estimado, c.ivaPorcentaje);
  let factura = null;
  if (o.estado === 'COMPLETADA' || o.estado === 'ENTREGADA') {
    const f = await calcularFactura(o.id);
    factura = { base: f.base, iva: f.iva, total: f.total, lineas: f.lineas };
  }
  return {
    ...aOrdenResumen(o),
    diagnostico: o.diagnostico,
    notasRecepcion: o.notasRecepcion,
    descripcionProblema: o.cita.descripcionProblema,
    solicitudes: o.solicitudes.map((s) => ({
      id: s.id,
      estado: s.estado,
      creadaEn: s.creadaEn,
      respondidaEn: s.respondidaEn,
      comentarioCliente: s.comentarioCliente,
      creadaPor: s.creadaPor.usuario.nombre,
      partidas: s.partidas.map((p) => ({
        id: p.id,
        descripcion: p.descripcion,
        horasEstimadas: Number(p.horasEstimadas),
        importeEstimadoCentimos: p.importeEstimadoCentimos,
        estado: p.estado,
        respondidaEn: p.respondidaEn,
        terminadaEn: p.terminadaEn,
        minutosRegistrados: p.trabajos.reduce((s2, t) => s2 + t.minutos, 0),
        piezasUsadas: p.piezasUsadas.map((u) => ({ id: u.id, pieza: u.pieza.nombre, referencia: u.pieza.referencia, cantidad: u.cantidad, precioUnitarioCentimos: u.precioUnitarioCentimos, mecanico: u.empleado.usuario.nombre, fecha: u.fecha })),
        piezasQuitadas: p.piezasQuitadas.map((q) => ({ id: q.id, descripcion: q.descripcion, cantidad: q.cantidad, destino: q.destino, fecha: q.fecha })),
        pedidos: verInterno ? p.pedidos.map((x) => ({ id: x.id, pieza: x.pieza?.nombre ?? x.descripcionLibre ?? '', cantidad: x.cantidad, estado: x.estado })) : [],
        fotos: p.fotos.map((f) => ({ id: f.id, url: urlFoto(f), descripcion: f.descripcion })),
      })),
    })),
    presupuesto: { base, iva, total },
    factura,
    observaciones: o.observaciones.map((x) => ({ id: x.id, texto: x.texto, interna: x.interna, autor: x.empleado.usuario.nombre, fecha: x.fecha })),
    eventos: o.eventos.map((e) => ({ id: e.id, tipo: e.tipo, payload: e.payload as Record<string, unknown>, actor: e.actor.nombre, fecha: e.fecha })),
    motivoNoCompletable: o.estado === 'EN_REPARACION' ? motivoNoCompletable(partidas) : 'Solo se completa una orden en reparación',
  };
}

definir({
  metodo: 'get',
  ruta: '/ordenes',
  etiqueta: 'Órdenes',
  resumen: 'Listar órdenes',
  descripcion: 'Cliente: las de sus vehículos. Personal: todas; `abiertas=true` excluye las entregadas; `mias=true` (mecánico) solo las de los puestos que tiene asignados hoy; `trabajadas=true`, las órdenes en las que ha registrado trabajo (su historial).',
  query: z.object({
    estado: EstadoOrdenSchema.optional(),
    abiertas: z.enum(['true', 'false']).optional(),
    mias: z.enum(['true', 'false']).optional(),
    trabajadas: z.enum(['true', 'false']).optional(),
    q: z.string().max(60).optional(),
  }),
  respuesta: lista(OrdenResumenSchema),
  manejador: async ({ usuario, query }) => {
    const where: Prisma.OrdenWhereInput = esPersonal(usuario) ? {} : { cita: { cliente: { usuarioId: usuario.id } } };
    if (query.estado) where.estado = query.estado;
    else if (query.abiertas === 'true') where.estado = { not: 'ENTREGADA' };
    if (query.mias === 'true' && esPersonal(usuario)) {
      const c = await obtenerConfig(prisma);
      const emp = await empleadoDe(usuario);
      const puestos = await prisma.asignacionPuesto.findMany({ where: { empleadoId: emp.id, fecha: fechaDb(diaLocal(reloj.ahora(), c.zonaHoraria)) } });
      where.puestoId = { in: puestos.map((p) => p.puestoId) };
      where.estado ??= { not: 'ENTREGADA' };
    }
    if (query.trabajadas === 'true' && esPersonal(usuario)) {
      where.trabajos = { some: { empleadoId: (await empleadoDe(usuario)).id } };
    }
    if (query.q) {
      const q = query.q.trim();
      where.OR = [{ vehiculo: { matricula: { contains: q.replace(/[\s-]/g, '').toUpperCase() } } }, { cita: { cliente: { usuario: { nombre: { contains: q, mode: 'insensitive' } } } } }];
      if (/^(OR-)?\d+$/i.test(q)) where.OR.push({ numero: Number(q.replace(/\D/g, '')) });
    }
    const datos = await prisma.orden.findMany({ where, include: incluirResumen, orderBy: { abiertaEn: 'desc' }, take: 200 });
    return { datos: datos.map(aOrdenResumen) };
  },
});

definir({
  metodo: 'get',
  ruta: '/ordenes/:id',
  etiqueta: 'Órdenes',
  resumen: 'Detalle de una orden',
  descripcion: 'Incluye trabajos, piezas, presupuesto con IVA, factura (si está completada) y la línea de tiempo. El cliente no ve observaciones ni eventos internos, ni los pedidos de piezas.',
  params: ParamId,
  respuesta: OrdenDetalleSchema,
  errores: { 404: 'No existe o no es tuya' },
  manejador: async ({ usuario, params }) => {
    await ordenAccesible(usuario, params.id);
    return detalle(params.id, esPersonal(usuario));
  },
});

definir({
  metodo: 'patch',
  ruta: '/ordenes/:id',
  etiqueta: 'Órdenes',
  resumen: 'Diagnóstico y entrega estimada',
  descripcion: 'Cambiar la entrega estimada avisa al cliente. No puede estar en el pasado.',
  acceso: PERSONAL,
  params: ParamId,
  cuerpo: z.object({ diagnostico: z.string().trim().max(4000).optional(), entregaEstimada: Instante.nullable().optional() }).strict(),
  respuesta: OrdenDetalleSchema,
  errores: { 404: 'La orden no existe', 409: 'La orden está entregada', 422: 'ENTREGA_EN_PASADO' },
  manejador: async ({ usuario, params, cuerpo }) => {
    const entrega: Date | null | undefined = cuerpo.entregaEstimada ? new Date(cuerpo.entregaEstimada) : (cuerpo.entregaEstimada as null | undefined);
    if (entrega && entrega < reloj.ahora()) throw reglaNegocio('ENTREGA_EN_PASADO', 'La entrega estimada no puede estar en el pasado');
    await transaccion(async (tx) => {
      const o = await bloquearOrden(tx, params.id, ['EN_DIAGNOSTICO', 'ESPERANDO_AUTORIZACION', 'EN_REPARACION', 'ESPERANDO_PIEZAS', 'COMPLETADA'], 'editar');
      await tx.orden.update({ where: { id: o.id }, data: { diagnostico: cuerpo.diagnostico, entregaEstimada: entrega } });
      if (entrega && entrega.getTime() !== o.entregaEstimada?.getTime()) {
        const c = await obtenerConfig(tx);
        const txt = (d: Date) => `${fechaLarga(d, c.zonaHoraria)}, ${hora(d, c.zonaHoraria)}`;
        await registrarEvento(tx, o.id, 'ESTADO_CAMBIADO', usuario.id, { entregaEstimada: entrega.toISOString(), texto: `Entrega prevista: ${txt(entrega)}` });
        await avisar(tx, o.cita.cliente.usuarioId, {
          tipo: 'ENTREGA_ESTIMADA',
          mensaje: `${numeroOrden(o.numero)}: entrega prevista ${txt(entrega)}`,
          enlace: `/ordenes/${o.id}`,
          datos: { ...datosVehiculo(o), entrega: txt(entrega), antes: o.entregaEstimada ? txt(o.entregaEstimada) : null },
        });
      }
    });
    return detalle(params.id, true);
  },
});

definir({
  metodo: 'post',
  ruta: '/ordenes/:id/puesto',
  etiqueta: 'Órdenes',
  resumen: 'Mover el vehículo a otro puesto',
  acceso: GESTION,
  params: ParamId,
  cuerpo: z.object({ puestoId: Id }).strict(),
  respuesta: OrdenResumenSchema,
  errores: { 404: 'La orden o el puesto no existen', 409: 'PUESTO_OCUPADO o la orden está entregada' },
  manejador: async ({ usuario, params, cuerpo }) => {
    await transaccion(async (tx) => {
      await bloquearOrden(tx, params.id, ['EN_DIAGNOSTICO', 'ESPERANDO_AUTORIZACION', 'EN_REPARACION', 'ESPERANDO_PIEZAS', 'COMPLETADA', 'RECHAZADA'], 'cambiar de puesto');
      await colocarEnPuesto(tx, params.id, cuerpo.puestoId, usuario.id);
    });
    return aOrdenResumen(await prisma.orden.findUniqueOrThrow({ where: { id: params.id }, include: incluirResumen }));
  },
});

definir({
  metodo: 'post',
  ruta: '/ordenes/:id/solicitudes',
  etiqueta: 'Órdenes',
  resumen: 'Pedir autorización al cliente',
  descripcion:
    'Propone uno o varios trabajos con horas y coste de piezas estimados. Importe estimado = horas × tarifa + piezas (sin IVA). La orden pasa a ESPERANDO_AUTORIZACION y el cliente recibe el presupuesto con IVA. Se puede repetir desde EN_REPARACION.',
  acceso: PERSONAL,
  idempotente: true,
  params: ParamId,
  cuerpo: z
    .object({
      partidas: z
        .array(
          z.object({
            descripcion: z.string().trim().min(3).max(300),
            horasEstimadas: z.number().min(0).max(200).multipleOf(0.25),
            piezasEstimadasCentimos: z.number().int().min(0).max(10_000_000),
            fotoIds: z.array(Id).max(MAX_FOTOS_POR_TRABAJO).optional().openapi({ description: 'Fotos subidas antes con POST /fotos' }),
          }),
        )
        .min(1)
        .max(20),
    })
    .strict(),
  respuesta: SolicitudSchema,
  codigo: 201,
  errores: { 404: 'La orden no existe', 409: 'Estado que no lo permite o ya hay una solicitud pendiente' },
  manejador: async ({ usuario, params, cuerpo }) => {
    const emp = await empleadoDe(usuario);
    const id = await transaccion(async (tx) => {
      const o = await bloquearOrden(tx, params.id, ['EN_DIAGNOSTICO', 'EN_REPARACION'], 'pedir autorización');
      assertTransicion(o.estado, 'ESPERANDO_AUTORIZACION', usuario.rol === 'DUENO' ? 'JEFE' : usuario.rol);
      const c = await obtenerConfig(tx);
      const creada = await tx.solicitudAutorizacion.create({ data: { ordenId: o.id, creadaPorId: emp.id, creadaEn: reloj.ahora() } });
      // Una a una y en orden, para adjuntar a cada trabajo sus fotos; si alguna foto no vale, no se crea nada.
      for (const p of cuerpo.partidas) {
        const partida = await tx.partida.create({
          data: { solicitudId: creada.id, descripcion: p.descripcion, horasEstimadas: p.horasEstimadas, importeEstimadoCentimos: Math.round(p.horasEstimadas * c.tarifaHoraCentimos) + p.piezasEstimadasCentimos },
        });
        await adjuntarFotos(tx, partida.id, p.fotoIds ?? [], usuario.id);
      }
      const s = await tx.solicitudAutorizacion.findUniqueOrThrow({ where: { id: creada.id }, include: { partidas: { orderBy: { id: 'asc' } } } });
      await tx.orden.update({ where: { id: o.id }, data: { estado: 'ESPERANDO_AUTORIZACION' } });
      await registrarEvento(tx, o.id, 'SOLICITUD_CREADA', usuario.id, { solicitudId: s.id, trabajos: s.partidas.map((p) => p.descripcion) });
      await registrarEvento(tx, o.id, 'ESTADO_CAMBIADO', usuario.id, { de: o.estado, a: 'ESPERANDO_AUTORIZACION', texto: 'Esperando tu aprobación' });
      const suma = s.partidas.reduce((x, p) => x + p.importeEstimadoCentimos, 0);
      const imp = conIva(suma, c.ivaPorcentaje);
      await avisar(tx, o.cita.cliente.usuarioId, {
        tipo: 'SOLICITUD_AUTORIZACION',
        mensaje: `${numeroOrden(o.numero)}: necesitamos tu aprobación (${euros(imp.total)} IVA incl.)`,
        enlace: `/ordenes/${o.id}`,
        datos: {
          ...datosVehiculo(o),
          partidas: s.partidas.map((p) => ({ descripcion: p.descripcion, importe: euros(p.importeEstimadoCentimos) })),
          base: euros(imp.base),
          iva: euros(imp.iva),
          total: euros(imp.total),
          ivaPorcentaje: c.ivaPorcentaje,
        },
      });
      return s.id;
    });
    const d = await detalle(params.id, true);
    return d.solicitudes.find((s) => s.id === id)!;
  },
});

definir({
  metodo: 'post',
  ruta: '/solicitudes/:id/responder',
  etiqueta: 'Órdenes',
  resumen: 'Responder una solicitud (cliente)',
  descripcion:
    'Una sola respuesta por solicitud que decide todos sus trabajos. Si se acepta alguno, la orden pasa a EN_REPARACION. Rechazarlo todo en la primera solicitud cierra la orden (RECHAZADA); en las siguientes, se sigue con lo ya aprobado.',
  acceso: ['CLIENTE'],
  params: ParamId,
  cuerpo: z
    .object({
      decisiones: z.record(Id, z.enum(['ACEPTADA', 'RECHAZADA'])).openapi({ example: { cm3abc: 'ACEPTADA', cm3def: 'RECHAZADA' } }),
      comentario: z.string().trim().max(1000).optional(),
    })
    .strict(),
  respuesta: OrdenDetalleSchema,
  errores: { 404: 'No existe o no es tuya', 409: 'Ya respondida', 422: 'RESPUESTA_INCOMPLETA: faltan trabajos o sobran' },
  manejador: async ({ usuario, params, cuerpo }) => {
    const s = await prisma.solicitudAutorizacion.findUnique({ where: { id: params.id }, include: { orden: { include: { cita: { include: { cliente: true } } } } } });
    if (!s || s.orden.cita.cliente.usuarioId !== usuario.id) throw noEncontrado('La solicitud');
    await transaccion(async (tx) => {
      const o = await bloquearOrden(tx, s.ordenId, ['ESPERANDO_AUTORIZACION', 'EN_REPARACION', 'EN_DIAGNOSTICO', 'ESPERANDO_PIEZAS', 'COMPLETADA', 'RECHAZADA', 'ENTREGADA'], 'responder');
      const actual = await tx.solicitudAutorizacion.findUniqueOrThrow({ where: { id: s.id }, include: { partidas: true, creadaPor: true } });
      if (actual.estado !== 'PENDIENTE') throw conflicto('YA_RESPONDIDA', 'Esta solicitud ya está respondida');
      // Solo hay una solicitud pendiente a la vez, así que cualquier otra de la orden es anterior.
      // (No se compara por fecha: dos solicitudes pueden crearse en el mismo milisegundo.)
      const anteriores = await tx.solicitudAutorizacion.count({ where: { ordenId: o.id, NOT: { id: actual.id } } });
      let nuevo: EstadoOrden;
      try {
        nuevo = validarRespuesta(actual.partidas.map((p) => p.id), cuerpo.decisiones, anteriores === 0);
      } catch (e) {
        if (e instanceof RespuestaIncompleta) throw reglaNegocio('RESPUESTA_INCOMPLETA', e.message);
        throw e;
      }
      assertTransicion(o.estado, nuevo, null);
      const ahora = reloj.ahora();
      const r = await tx.solicitudAutorizacion.updateMany({ where: { id: s.id, estado: 'PENDIENTE' }, data: { estado: 'RESPONDIDA', respondidaEn: ahora, comentarioCliente: cuerpo.comentario } });
      if (!r.count) throw conflicto('YA_RESPONDIDA', 'Esta solicitud ya está respondida');
      for (const p of actual.partidas) {
        await tx.partida.update({ where: { id: p.id }, data: { estado: cuerpo.decisiones[p.id], respondidaEn: ahora } });
        await registrarEvento(tx, o.id, 'PARTIDA_RESPONDIDA', usuario.id, { partidaId: p.id, descripcion: p.descripcion, decision: cuerpo.decisiones[p.id] });
      }
      await tx.orden.update({ where: { id: o.id }, data: { estado: nuevo } });
      await registrarEvento(tx, o.id, 'ESTADO_CAMBIADO', usuario.id, { de: o.estado, a: nuevo, texto: nuevo === 'RECHAZADA' ? 'Presupuesto rechazado' : 'Reparación en curso' });
      const aceptadas = actual.partidas.filter((p) => cuerpo.decisiones[p.id] === 'ACEPTADA').length;
      await avisar(tx, actual.creadaPor.usuarioId, {
        tipo: 'RESPUESTA_CLIENTE',
        mensaje: `${numeroOrden(o.numero)}: el cliente ha aceptado ${aceptadas} de ${actual.partidas.length} trabajos`,
        enlace: `/mecanico/ordenes/${o.id}`,
        datos: {
          ...datosVehiculo(o),
          aceptadas,
          rechazadas: actual.partidas.length - aceptadas,
          ordenRechazada: nuevo === 'RECHAZADA',
          decisiones: actual.partidas.map((p) => ({ descripcion: p.descripcion, decision: cuerpo.decisiones[p.id] === 'ACEPTADA' ? 'Aceptado' : 'Rechazado' })),
          comentario: cuerpo.comentario ?? null,
        },
      });
      if (nuevo === 'RECHAZADA') {
        await avisar(tx, usuario.id, { tipo: 'ORDEN_RECHAZADA', mensaje: `${numeroOrden(o.numero)}: puedes recoger tu vehículo`, enlace: `/ordenes/${o.id}`, datos: datosVehiculo(o) });
      }
    });
    return detalle(s.ordenId, false);
  },
});

definir({
  metodo: 'post',
  ruta: '/ordenes/:id/estado',
  etiqueta: 'Órdenes',
  resumen: 'Esperar piezas o reanudar la reparación',
  acceso: PERSONAL,
  params: ParamId,
  cuerpo: z.object({ estado: z.enum(['ESPERANDO_PIEZAS', 'EN_REPARACION']) }).strict(),
  respuesta: OrdenDetalleSchema,
  errores: { 404: 'La orden no existe', 409: 'TRANSICION_NO_PERMITIDA' },
  manejador: async ({ usuario, params, cuerpo }) => {
    await transaccion(async (tx) => {
      const o = await bloquearOrden(tx, params.id, ['EN_REPARACION', 'ESPERANDO_PIEZAS'], 'cambiar el estado');
      assertTransicion(o.estado, cuerpo.estado, usuario.rol === 'DUENO' ? 'JEFE' : usuario.rol);
      await tx.orden.update({ where: { id: o.id }, data: { estado: cuerpo.estado } });
      const espera = cuerpo.estado === 'ESPERANDO_PIEZAS';
      await registrarEvento(tx, o.id, 'ESTADO_CAMBIADO', usuario.id, { de: o.estado, a: cuerpo.estado, texto: espera ? 'Esperando piezas' : 'Reparación reanudada' });
      const c = await obtenerConfig(tx);
      await avisar(tx, o.cita.cliente.usuarioId, {
        tipo: espera ? 'ESPERANDO_PIEZAS' : 'REPARACION_REANUDADA',
        mensaje: `${numeroOrden(o.numero)}: ${espera ? 'esperando piezas' : 'seguimos con la reparación'}`,
        enlace: `/ordenes/${o.id}`,
        datos: { ...datosVehiculo(o), entrega: o.entregaEstimada ? fechaLarga(o.entregaEstimada, c.zonaHoraria) : null },
      });
    });
    return detalle(params.id, true);
  },
});

definir({
  metodo: 'post',
  ruta: '/ordenes/:id/completar',
  etiqueta: 'Órdenes',
  resumen: 'Marcar la orden como completada',
  descripcion:
    'Solo si todos los trabajos aceptados están terminados. Guarda los km de salida (nunca menos que los de entrada) y los deja como km actuales del vehículo. Envía al cliente el email con la factura en PDF.',
  acceso: PERSONAL,
  params: ParamId,
  cuerpo: z.object({ kmSalida: Km }).strict(),
  respuesta: OrdenDetalleSchema,
  errores: { 404: 'La orden no existe', 409: 'No está en reparación', 422: 'NO_COMPLETABLE (el mensaje explica qué falta) o KM_MENOR' },
  manejador: async ({ usuario, params, cuerpo }) => {
    await transaccion(async (tx) => {
      const o = await bloquearOrden(tx, params.id, ['EN_REPARACION'], 'completar');
      const partidas = await tx.partida.findMany({ where: { solicitud: { ordenId: o.id } } });
      const motivo = motivoNoCompletable(partidas);
      if (motivo) throw reglaNegocio('NO_COMPLETABLE', motivo);
      comprobarKmSalida(o.kmEntrada, cuerpo.kmSalida);
      const ahora = reloj.ahora();
      await tx.orden.update({ where: { id: o.id }, data: { estado: 'COMPLETADA', completadaEn: ahora, kmSalida: cuerpo.kmSalida } });
      await tx.vehiculo.update({ where: { id: o.vehiculoId }, data: { kilometros: cuerpo.kmSalida } });
      await registrarEvento(tx, o.id, 'ESTADO_CAMBIADO', usuario.id, { de: o.estado, a: 'COMPLETADA', texto: 'Listo para recoger', kmSalida: cuerpo.kmSalida });
    });
    // La factura se calcula fuera de la transacción de cierre, ya con todo guardado; el email va en la misma operación lógica.
    const f = await calcularFactura(params.id);
    await transaccion(async (tx) => {
      const o = await tx.orden.findUniqueOrThrow({ where: { id: params.id }, include: { vehiculo: true, cita: { include: { cliente: true } } } });
      await avisar(tx, o.cita.cliente.usuarioId, {
        tipo: 'ORDEN_COMPLETADA',
        mensaje: `${numeroOrden(o.numero)}: tu vehículo está listo. Total ${euros(f.total)}`,
        enlace: `/ordenes/${o.id}`,
        adjuntoFacturaOrdenId: o.id,
        datos: {
          ...datosVehiculo(o),
          lineas: f.lineas.map((l) => ({ concepto: l.concepto, importe: euros(l.importeCentimos) })),
          base: euros(f.base),
          iva: euros(f.iva),
          total: euros(f.total),
          ivaPorcentaje: f.ivaPorcentaje,
        },
      });
    });
    return detalle(params.id, true);
  },
});

definir({
  metodo: 'post',
  ruta: '/ordenes/:id/entregar',
  etiqueta: 'Órdenes',
  resumen: 'Entregar el vehículo al cliente',
  descripcion:
    'Desde COMPLETADA o RECHAZADA. Libera el puesto. El jefe confirma los km de salida que puso el mecánico o los corrige (la corrección queda en la línea de tiempo). Si la orden se rechazó, no hay km de salida y son obligatorios.',
  acceso: GESTION,
  params: ParamId,
  cuerpo: z.object({ kmSalida: Km.optional() }).strict(),
  respuesta: OrdenDetalleSchema,
  errores: { 404: 'La orden no existe', 409: 'No está completada ni rechazada (o ya se entregó)', 422: 'KM_SALIDA_REQUERIDOS o KM_MENOR' },
  manejador: async ({ usuario, params, cuerpo }) => {
    await transaccion(async (tx) => {
      const o = await bloquearOrden(tx, params.id, ['COMPLETADA', 'RECHAZADA'], 'entregar');
      const km = cuerpo.kmSalida ?? o.kmSalida;
      if (km === null) throw reglaNegocio('KM_SALIDA_REQUERIDOS', 'Indica los kilómetros a la salida');
      comprobarKmSalida(o.kmEntrada, km);
      if (o.kmSalida !== null && km !== o.kmSalida) {
        await registrarEvento(tx, o.id, 'KM_CORREGIDOS', usuario.id, { de: o.kmSalida, a: km });
      }
      const ahora = reloj.ahora();
      await tx.orden.update({ where: { id: o.id }, data: { estado: 'ENTREGADA', kmSalida: km } });
      await tx.vehiculo.update({ where: { id: o.vehiculoId }, data: { kilometros: km } });
      await tx.ocupacionPuesto.updateMany({ where: { ordenId: o.id, fin: null }, data: { fin: ahora } });
      await registrarEvento(tx, o.id, 'ESTADO_CAMBIADO', usuario.id, { de: o.estado, a: 'ENTREGADA', texto: 'Vehículo entregado' });
      const c = await obtenerConfig(tx);
      await avisar(tx, o.cita.cliente.usuarioId, {
        tipo: 'VEHICULO_ENTREGADO',
        mensaje: `${numeroOrden(o.numero)}: vehículo entregado. ¡Gracias!`,
        enlace: `/ordenes/${o.id}`,
        datos: { ...datosVehiculo(o), fecha: `${fechaLarga(ahora, c.zonaHoraria)}, ${hora(ahora, c.zonaHoraria)}` },
      });
    });
    return detalle(params.id, true);
  },
});

definir({
  metodo: 'get',
  ruta: '/ordenes/:id/factura.pdf',
  etiqueta: 'Órdenes',
  resumen: 'Descargar la factura en PDF',
  params: ParamId,
  produce: 'application/pdf',
  errores: { 404: 'No existe o no es tuya', 409: 'La orden aún no está completada' },
  manejador: async ({ usuario, params, res }) => {
    const o = await ordenAccesible(usuario, params.id);
    if (o.estado !== 'COMPLETADA' && o.estado !== 'ENTREGADA') throw conflicto('SIN_FACTURA', 'La factura estará disponible al completar la reparación');
    const pdf = await facturaPdf(o.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Factura-${numeroOrden(o.numero)}.pdf"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(pdf);
  },
});

definir({
  metodo: 'post',
  ruta: '/ordenes/:id/observaciones',
  etiqueta: 'Órdenes',
  resumen: 'Añadir una observación',
  descripcion: 'Las internas solo las ve el personal.',
  acceso: PERSONAL,
  params: ParamId,
  cuerpo: z.object({ texto: TextoLargo, interna: z.boolean() }).strict(),
  respuesta: z.object({ id: Id }),
  codigo: 201,
  errores: { 404: 'La orden no existe', 409: 'La orden está entregada' },
  manejador: async ({ usuario, params, cuerpo }) => {
    const emp = await empleadoDe(usuario);
    return transaccion(async (tx) => {
      const o = await bloquearOrden(tx, params.id, ['EN_DIAGNOSTICO', 'ESPERANDO_AUTORIZACION', 'EN_REPARACION', 'ESPERANDO_PIEZAS', 'COMPLETADA', 'RECHAZADA'], 'añadir observaciones');
      const obs = await tx.observacion.create({ data: { ordenId: o.id, empleadoId: emp.id, texto: cuerpo.texto, interna: cuerpo.interna, fecha: reloj.ahora() } });
      await registrarEvento(tx, o.id, 'OBSERVACION', usuario.id, { texto: cuerpo.texto }, !cuerpo.interna);
      return { id: obs.id };
    });
  },
});

definir({
  metodo: 'post',
  ruta: '/ordenes/:id/trabajos',
  etiqueta: 'Órdenes',
  resumen: 'Registrar horas en un trabajo',
  descripcion: 'Las horas registradas son las que se facturan.',
  acceso: PERSONAL,
  idempotente: true,
  params: ParamId,
  cuerpo: z.object({ partidaId: Id, minutos: z.number().int().min(1).max(720), descripcion: TextoLargo }).strict(),
  respuesta: z.object({ id: Id }),
  codigo: 201,
  errores: { 404: 'La orden o el trabajo no existen', 409: 'Orden fuera de reparación o trabajo terminado', 422: 'TRABAJO_NO_ACEPTADO' },
  manejador: async ({ usuario, params, cuerpo }) => {
    const emp = await empleadoDe(usuario);
    return transaccion(async (tx) => {
      const o = await bloquearOrden(tx, params.id, ['EN_REPARACION', 'ESPERANDO_PIEZAS'], 'registrar trabajo');
      const p = await tx.partida.findFirst({ where: { id: cuerpo.partidaId, solicitud: { ordenId: o.id } } });
      if (!p) throw noEncontrado('El trabajo');
      if (p.estado !== 'ACEPTADA') throw reglaNegocio('TRABAJO_NO_ACEPTADO', 'Ese trabajo no está aceptado por el cliente');
      if (p.terminadaEn) throw conflicto('TRABAJO_TERMINADO', 'Ese trabajo ya está terminado');
      const t = await tx.registroTrabajo.create({ data: { ordenId: o.id, partidaId: p.id, empleadoId: emp.id, minutos: cuerpo.minutos, descripcion: cuerpo.descripcion, fecha: reloj.ahora() } });
      await registrarEvento(tx, o.id, 'TRABAJO_REGISTRADO', usuario.id, { trabajo: p.descripcion, minutos: cuerpo.minutos, descripcion: cuerpo.descripcion });
      return { id: t.id };
    });
  },
});

