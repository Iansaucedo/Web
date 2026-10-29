import type { Prisma, Usuario } from '@prisma/client';
import { z } from '../openapi/zod';
import { definir } from '../lib/ruta';
import { prisma } from '../db';
import { bloquear, transaccion, type Tx } from '../lib/transaccion';
import { conflicto, noEncontrado, reglaNegocio } from '../lib/errores';
import { reloj } from '../lib/reloj';
import { diaLocal, diasEntre, horaLocal, inicioDia, sumarDias } from '../lib/fechas';
import { clientePuedeCancelar } from '../domain/capacidad';
import { clienteDe, esGestion, esPersonal, GESTION, vehiculoAccesible } from '../servicios/acceso';
import { obtenerConfig } from '../servicios/config';
import { franjasDelDia, libresEnFranja, ocupacionDia, validarFranja, esLaborable, DIAS_MAX_ANTELACION } from '../servicios/agenda';
import { avisar, avisarRoles } from '../servicios/avisos';
import { registrarEvento } from '../servicios/eventos';
import { fechaLarga, hora, numeroOrden } from '../emails/formato';
import { Dia, Id, Instante, ParamId, TextoLargo, lista } from './esquemas';
import { OrdenResumenSchema, aOrdenResumen } from './ordenes-esquemas';

// ─── Disponibilidad ──────────────────────────────────────────────────

const DiaDisponibleSchema = z
  .object({
    fecha: Dia,
    laborable: z.boolean(),
    capacidad: z.number().int(),
    ocupadas: z.number().int(),
    lleno: z.boolean(),
    franjas: z.array(z.object({ inicio: Instante, hora: z.string().openapi({ example: '09:30' }), libres: z.number().int() })),
  })
  .openapi('DiaDisponible');

definir({
  metodo: 'get',
  ruta: '/disponibilidad',
  etiqueta: 'Citas',
  resumen: 'Huecos libres por día y franja',
  descripcion:
    'Capacidad del día = min(puestos activos, mecánicos presentes × vehículos por mecánico) − vehículos que siguen en el taller. Cada franja admite como mucho `recepcionesPorFranja` llegadas. Máximo 31 días por consulta. Las franjas ya pasadas no se devuelven.',
  query: z
    .object({ desde: Dia, hasta: Dia })
    .refine((q) => q.desde <= q.hasta, { message: '`desde` debe ser anterior o igual a `hasta`', path: ['hasta'] })
    .refine((q) => diasEntre(q.desde, q.hasta).length <= 31, { message: 'Como máximo 31 días', path: ['hasta'] }),
  respuesta: z.object({ dias: z.array(DiaDisponibleSchema) }),
  manejador: async ({ query }) => {
    const c = await obtenerConfig(prisma);
    const ahora = reloj.ahora();
    const ultimo = sumarDias(diaLocal(ahora, c.zonaHoraria), DIAS_MAX_ANTELACION);
    const dias = [];
    for (const dia of diasEntre(query.desde, query.hasta)) {
      if (!esLaborable(dia, c) || dia > ultimo) {
        dias.push({ fecha: dia, laborable: esLaborable(dia, c), capacidad: 0, ocupadas: 0, lleno: true, franjas: [] });
        continue;
      }
      const o = await ocupacionDia(prisma, dia, c);
      const franjas = franjasDelDia(dia, c)
        .filter((f) => f.inicio > ahora)
        .map((f) => ({ inicio: f.inicio.toISOString(), hora: f.hora, libres: libresEnFranja(o, f.inicio, c) }));
      dias.push({ fecha: dia, laborable: true, capacidad: o.capacidad, ocupadas: o.ocupadas, lleno: o.ocupadas >= o.capacidad || franjas.every((f) => !f.libres), franjas });
    }
    return { dias };
  },
});

// ─── Citas ───────────────────────────────────────────────────────────

const EstadoCita = z.enum(['PENDIENTE', 'CONFIRMADA', 'RECIBIDA', 'CANCELADA', 'NO_PRESENTADO']);
export const CitaSchema = z
  .object({
    id: Id,
    estado: EstadoCita,
    inicio: Instante,
    fin: Instante,
    fecha: Dia,
    hora: z.string(),
    descripcionProblema: z.string(),
    vehiculo: z.object({ id: Id, matricula: z.string(), marca: z.string(), modelo: z.string() }),
    cliente: z.object({ id: Id, nombre: z.string(), telefono: z.string(), razonSocial: z.string().nullable() }),
    ordenId: Id.nullable(),
    reservaMultipleId: Id.nullable(),
    puedeCambiar: z.boolean().openapi({ description: 'El cliente aún puede cambiarla o cancelarla (antelación mínima)' }),
  })
  .openapi('Cita');

const incluir = { vehiculo: true, cliente: { include: { usuario: true } }, orden: { select: { id: true } } } satisfies Prisma.CitaInclude;
type CitaBd = Prisma.CitaGetPayload<{ include: typeof incluir }>;

async function aCita(x: CitaBd) {
  const c = await obtenerConfig(prisma);
  return {
    id: x.id,
    estado: x.estado,
    inicio: x.inicio.toISOString(),
    fin: x.fin.toISOString(),
    fecha: diaLocal(x.inicio, c.zonaHoraria),
    hora: horaLocal(x.inicio, c.zonaHoraria),
    descripcionProblema: x.descripcionProblema,
    vehiculo: { id: x.vehiculo.id, matricula: x.vehiculo.matricula, marca: x.vehiculo.marca, modelo: x.vehiculo.modelo },
    cliente: { id: x.cliente.id, nombre: x.cliente.usuario.nombre, telefono: x.cliente.telefono, razonSocial: x.cliente.razonSocial },
    ordenId: x.orden?.id ?? null,
    reservaMultipleId: x.reservaMultipleId,
    puedeCambiar: ['PENDIENTE', 'CONFIRMADA'].includes(x.estado) && clientePuedeCancelar(x.inicio, reloj.ahora(), c.horasMinimasCancelar),
  };
}

/** Cita accesible: el personal ve todas; el cliente solo las suyas (404 si no). */
async function citaAccesible(u: Usuario, id: string) {
  const x = await prisma.cita.findUnique({ where: { id }, include: incluir });
  if (!x || (!esPersonal(u) && x.cliente.usuarioId !== u.id)) throw noEncontrado('La cita');
  return x;
}

const datosEmail = (x: CitaBd, zona: string) => ({
  marca: x.vehiculo.marca,
  modelo: x.vehiculo.modelo,
  matricula: x.vehiculo.matricula,
  fecha: fechaLarga(x.inicio, zona),
  hora: hora(x.inicio, zona),
  problema: x.descripcionProblema,
});

/** Reserva plaza en una franja dentro de la transacción, bloqueando el día. Lanza si no cabe. */
export async function ocuparFranja(tx: Tx, inicio: Date, cuantos = 1) {
  const c = await obtenerConfig(tx);
  const { dia, franja } = validarFranja(inicio, c);
  await bloquear(tx, `citas:${dia}`);
  const o = await ocupacionDia(tx, dia, c);
  if (o.ocupadas + cuantos > o.capacidad) throw conflicto('DIA_LLENO', 'Ese día ya no queda sitio en el taller');
  if (libresEnFranja(o, inicio, c) < cuantos) throw conflicto('FRANJA_LLENA', 'La franja elegida ya está completa. Elige otra hora');
  return { dia, franja, config: c };
}

async function vehiculoSinCitaActiva(tx: Tx, vehiculoId: string, excepto?: string) {
  await bloquear(tx, `vehiculo:${vehiculoId}`);
  const activa = await tx.cita.findFirst({ where: { vehiculoId, estado: { in: ['PENDIENTE', 'CONFIRMADA'] }, NOT: { id: excepto } } });
  const abierta = await tx.orden.findFirst({ where: { vehiculoId, estado: { not: 'ENTREGADA' } } });
  if (activa || abierta) throw conflicto('VEHICULO_CON_CITA', 'Este vehículo ya tiene una cita o una reparación en curso');
}

definir({
  metodo: 'get',
  ruta: '/citas',
  etiqueta: 'Citas',
  resumen: 'Listar citas',
  descripcion: 'El cliente ve las suyas. El personal ve todas, filtrando por día (`fecha`) o rango, y por estado.',
  query: z.object({ fecha: Dia.optional(), desde: Dia.optional(), hasta: Dia.optional(), estado: EstadoCita.optional() }),
  respuesta: lista(CitaSchema),
  manejador: async ({ usuario, query }) => {
    const c = await obtenerConfig(prisma);
    const where: Prisma.CitaWhereInput = esPersonal(usuario) ? {} : { cliente: { usuarioId: usuario.id } };
    const desde = query.fecha ?? query.desde;
    const hasta = query.fecha ?? query.hasta;
    if (desde || hasta) {
      where.inicio = {
        ...(desde ? { gte: inicioDia(desde, c.zonaHoraria) } : {}),
        ...(hasta ? { lt: inicioDia(sumarDias(hasta, 1), c.zonaHoraria) } : {}),
      };
    }
    if (query.estado) where.estado = query.estado;
    const citas = await prisma.cita.findMany({ where, include: incluir, orderBy: { inicio: esPersonal(usuario) ? 'asc' : 'desc' }, take: 300 });
    return { datos: await Promise.all(citas.map(aCita)) };
  },
});

definir({
  metodo: 'get',
  ruta: '/citas/:id',
  etiqueta: 'Citas',
  resumen: 'Ver una cita',
  params: ParamId,
  respuesta: CitaSchema,
  errores: { 404: 'No existe o no es tuya' },
  manejador: async ({ usuario, params }) => aCita(await citaAccesible(usuario, params.id)),
});

definir({
  metodo: 'post',
  ruta: '/citas',
  etiqueta: 'Citas',
  resumen: 'Reservar una cita',
  descripcion:
    'El inicio debe ser exactamente el comienzo de una franja libre (ver `/disponibilidad`). Se comprueba la capacidad dentro de una transacción con cerrojo por día: dos clientes no pueden quedarse la misma última plaza.',
  acceso: ['CLIENTE'],
  idempotente: true,
  cuerpo: z.object({ vehiculoId: Id, inicio: Instante, descripcionProblema: TextoLargo }).strict(),
  respuesta: CitaSchema,
  codigo: 201,
  errores: {
    404: 'El vehículo no existe o no es tuyo',
    409: 'FRANJA_LLENA, DIA_LLENO o VEHICULO_CON_CITA',
    422: 'FRANJA_NO_VALIDA, FUERA_DE_PLAZO o PERFIL_INCOMPLETO',
  },
  manejador: async ({ usuario, cuerpo }) => {
    const cliente = await clienteDe(usuario);
    const v = await vehiculoAccesible(usuario, cuerpo.vehiculoId);
    const inicio = new Date(cuerpo.inicio);
    const id = await transaccion(async (tx) => {
      await vehiculoSinCitaActiva(tx, v.id);
      const { franja, config } = await ocuparFranja(tx, inicio);
      const cita = await tx.cita.create({
        data: { clienteId: cliente.id, vehiculoId: v.id, inicio: franja.inicio, fin: franja.fin, descripcionProblema: cuerpo.descripcionProblema, creadaEn: reloj.ahora() },
        include: incluir,
      });
      const datos = datosEmail(cita, config.zonaHoraria);
      await avisar(tx, usuario.id, { tipo: 'CITA_SOLICITADA', mensaje: `Cita solicitada: ${datos.fecha} a las ${datos.hora}`, enlace: '/ordenes', datos: { ...datos, horasCancelar: config.horasMinimasCancelar } });
      await avisarRoles(tx, ['JEFE'], {
        tipo: 'CITA_NUEVA_TALLER',
        mensaje: `Nueva cita por confirmar: ${v.matricula}, ${datos.fecha} ${datos.hora}`,
        enlace: '/jefe/citas',
        datos: { ...datos, cliente: cliente.razonSocial ?? usuario.nombre },
      });
      return cita.id;
    });
    return aCita(await prisma.cita.findUniqueOrThrow({ where: { id }, include: incluir }));
  },
});

function exigirAntelacion(inicio: Date, horas: number) {
  if (!clientePuedeCancelar(inicio, reloj.ahora(), horas)) {
    throw reglaNegocio('FUERA_DE_PLAZO', `Solo puedes cambiar o cancelar la cita hasta ${horas} h antes. Llama al taller`);
  }
}

definir({
  metodo: 'patch',
  ruta: '/citas/:id',
  etiqueta: 'Citas',
  resumen: 'Cambiar la franja de una cita',
  descripcion: 'Solo el cliente, con la antelación mínima configurada (24 h). La cita vuelve a PENDIENTE para que el taller la confirme.',
  acceso: ['CLIENTE'],
  params: ParamId,
  cuerpo: z.object({ inicio: Instante }).strict(),
  respuesta: CitaSchema,
  errores: { 404: 'No existe o no es tuya', 409: 'Ya no está activa, o la nueva franja está llena', 422: 'FUERA_DE_PLAZO o FRANJA_NO_VALIDA' },
  manejador: async ({ usuario, params, cuerpo }) => {
    const previa = await citaAccesible(usuario, params.id);
    const c = await obtenerConfig(prisma);
    exigirAntelacion(previa.inicio, c.horasMinimasCancelar);
    const inicio = new Date(cuerpo.inicio);
    await transaccion(async (tx) => {
      // Cerrojo del día anterior también: así no compite con otra operación sobre la misma cita.
      await bloquear(tx, `cita:${previa.id}`);
      const { franja } = await ocuparFranja(tx, inicio);
      const r = await tx.cita.updateMany({ where: { id: previa.id, estado: { in: ['PENDIENTE', 'CONFIRMADA'] } }, data: { inicio: franja.inicio, fin: franja.fin, estado: 'PENDIENTE', recordatorioEn: null } });
      if (!r.count) throw conflicto('CITA_NO_ACTIVA', 'La cita ya no se puede cambiar');
      const actual = await tx.cita.findUniqueOrThrow({ where: { id: previa.id }, include: incluir });
      const datos = datosEmail(actual, c.zonaHoraria);
      await avisar(tx, usuario.id, {
        tipo: 'CITA_MODIFICADA',
        mensaje: `Cita cambiada al ${datos.fecha} a las ${datos.hora}`,
        enlace: '/ordenes',
        datos: { ...datos, antes: `${fechaLarga(previa.inicio, c.zonaHoraria)}, ${hora(previa.inicio, c.zonaHoraria)}` },
      });
    });
    return aCita(await prisma.cita.findUniqueOrThrow({ where: { id: previa.id }, include: incluir }));
  },
});

definir({
  metodo: 'post',
  ruta: '/citas/:id/cancelar',
  etiqueta: 'Citas',
  resumen: 'Cancelar una cita',
  descripcion: 'El cliente, con la antelación mínima. El jefe, en cualquier momento antes de recibir el vehículo y con motivo.',
  acceso: ['CLIENTE', 'JEFE'],
  params: ParamId,
  cuerpo: z.object({ motivo: z.string().trim().min(1).max(300).optional() }).strict(),
  respuesta: CitaSchema,
  errores: { 404: 'No existe o no es tuya', 409: 'Ya estaba cancelada, recibida o cerrada', 422: 'FUERA_DE_PLAZO o falta el motivo (jefe)' },
  manejador: async ({ usuario, params, cuerpo }) => {
    const x = await citaAccesible(usuario, params.id);
    const c = await obtenerConfig(prisma);
    const porTaller = esGestion(usuario);
    if (porTaller && !cuerpo.motivo) throw reglaNegocio('MOTIVO_OBLIGATORIO', 'Indica el motivo de la cancelación: se le enviará al cliente');
    if (!porTaller) exigirAntelacion(x.inicio, c.horasMinimasCancelar);
    await transaccion(async (tx) => {
      const r = await tx.cita.updateMany({ where: { id: x.id, estado: { in: ['PENDIENTE', 'CONFIRMADA'] } }, data: { estado: 'CANCELADA' } });
      if (!r.count) throw conflicto('CITA_NO_ACTIVA', 'La cita ya no está activa');
      const datos = datosEmail(x, c.zonaHoraria);
      await avisar(tx, x.cliente.usuarioId, {
        tipo: 'CITA_CANCELADA',
        mensaje: `Cita del ${datos.fecha} cancelada${porTaller ? ' por el taller' : ''}`,
        enlace: '/reservar',
        datos: { ...datos, porTaller, motivo: cuerpo.motivo ?? null },
      });
    });
    return aCita(await prisma.cita.findUniqueOrThrow({ where: { id: x.id }, include: incluir }));
  },
});

definir({
  metodo: 'post',
  ruta: '/citas/:id/confirmar',
  etiqueta: 'Citas',
  resumen: 'Confirmar una cita pendiente',
  acceso: GESTION,
  params: ParamId,
  cuerpo: z.object({}).strict(),
  respuesta: CitaSchema,
  errores: { 404: 'La cita no existe', 409: 'No está pendiente' },
  manejador: async ({ usuario, params }) => {
    const x = await citaAccesible(usuario, params.id);
    const c = await obtenerConfig(prisma);
    await transaccion(async (tx) => {
      const r = await tx.cita.updateMany({ where: { id: x.id, estado: 'PENDIENTE' }, data: { estado: 'CONFIRMADA' } });
      if (!r.count) throw conflicto('CITA_NO_PENDIENTE', 'Solo se confirman citas pendientes');
      const datos = datosEmail(x, c.zonaHoraria);
      await avisar(tx, x.cliente.usuarioId, { tipo: 'CITA_CONFIRMADA', mensaje: `Cita confirmada: ${datos.fecha} a las ${datos.hora}`, enlace: '/ordenes', datos: { ...datos, horasCancelar: c.horasMinimasCancelar } });
    });
    return aCita(await prisma.cita.findUniqueOrThrow({ where: { id: x.id }, include: incluir }));
  },
});

definir({
  metodo: 'post',
  ruta: '/citas/:id/recibir',
  etiqueta: 'Citas',
  resumen: 'Recibir el vehículo y abrir la orden',
  descripcion:
    'Solo el día de la cita. Abre la orden en EN_DIAGNOSTICO, guarda los kilómetros (no pueden bajar) y, si se indica, coloca el vehículo en un puesto libre. Todo o nada: si el puesto está ocupado no se abre la orden.',
  acceso: GESTION,
  params: ParamId,
  cuerpo: z
    .object({ kmEntrada: z.number().int().min(0).max(2_000_000), notasRecepcion: z.string().trim().max(1000).optional(), puestoId: Id.optional() })
    .strict(),
  respuesta: OrdenResumenSchema,
  codigo: 201,
  errores: { 404: 'La cita o el puesto no existen', 409: 'Ya recibida o cerrada; PUESTO_OCUPADO', 422: 'CITA_NO_ES_HOY o KM_MENOR' },
  manejador: async ({ usuario, params, cuerpo }) => {
    const x = await citaAccesible(usuario, params.id);
    const c = await obtenerConfig(prisma);
    if (diaLocal(x.inicio, c.zonaHoraria) !== diaLocal(reloj.ahora(), c.zonaHoraria)) throw reglaNegocio('CITA_NO_ES_HOY', 'Solo se recibe el vehículo el día de su cita');
    if (x.vehiculo.kilometros !== null && cuerpo.kmEntrada < x.vehiculo.kilometros) {
      throw reglaNegocio('KM_MENOR', `Los kilómetros no pueden ser menos que los registrados (${x.vehiculo.kilometros})`);
    }
    const ordenId = await transaccion(async (tx) => {
      const r = await tx.cita.updateMany({ where: { id: x.id, estado: { in: ['PENDIENTE', 'CONFIRMADA'] } }, data: { estado: 'RECIBIDA' } });
      if (!r.count) throw conflicto('CITA_NO_ACTIVA', 'Esta cita ya se recibió o está cerrada');
      const orden = await tx.orden.create({
        data: { citaId: x.id, vehiculoId: x.vehiculoId, kmEntrada: cuerpo.kmEntrada, notasRecepcion: cuerpo.notasRecepcion, abiertaEn: reloj.ahora() },
      });
      await tx.vehiculo.update({ where: { id: x.vehiculoId }, data: { kilometros: cuerpo.kmEntrada } });
      await registrarEvento(tx, orden.id, 'ESTADO_CAMBIADO', usuario.id, { a: 'EN_DIAGNOSTICO', texto: 'Vehículo recibido en el taller' });
      if (cuerpo.puestoId) await colocarEnPuesto(tx, orden.id, cuerpo.puestoId, usuario.id);
      await avisar(tx, x.cliente.usuarioId, {
        tipo: 'VEHICULO_RECIBIDO',
        mensaje: `Hemos recibido tu ${x.vehiculo.marca} ${x.vehiculo.modelo}. Empezamos el diagnóstico`,
        enlace: `/ordenes/${orden.id}`,
        datos: { ...datosEmail(x, c.zonaHoraria), orden: numeroOrden(orden.numero), km: cuerpo.kmEntrada.toLocaleString('es-ES'), notas: cuerpo.notasRecepcion ?? null },
      });
      return orden.id;
    });
    return aOrdenResumen(await prisma.orden.findUniqueOrThrow({ where: { id: ordenId }, include: { vehiculo: true, puesto: true, cita: { include: { cliente: { include: { usuario: true } } } } } }));
  },
});

/** Coloca la orden en un puesto, comprobando con cerrojo que esté activo y libre. */
export async function colocarEnPuesto(tx: Tx, ordenId: string, puestoId: string, actorId: string) {
  await bloquear(tx, `puesto:${puestoId}`);
  const puesto = await tx.puesto.findUnique({ where: { id: puestoId } });
  if (!puesto || !puesto.activo) throw noEncontrado('El puesto');
  const ocupado = await tx.ocupacionPuesto.findFirst({ where: { puestoId, fin: null, NOT: { ordenId } } });
  if (ocupado) throw conflicto('PUESTO_OCUPADO', `${puesto.nombre} está ocupado por otro vehículo`);
  await tx.ocupacionPuesto.updateMany({ where: { ordenId, fin: null }, data: { fin: reloj.ahora() } });
  await tx.ocupacionPuesto.create({ data: { ordenId, puestoId, inicio: reloj.ahora() } });
  await tx.orden.update({ where: { id: ordenId }, data: { puestoId } });
  await registrarEvento(tx, ordenId, 'PUESTO_ASIGNADO', actorId, { puesto: puesto.nombre }, false);
}

definir({
  metodo: 'post',
  ruta: '/citas/:id/no-presentado',
  etiqueta: 'Citas',
  resumen: 'Marcar que el cliente no se presentó',
  descripcion: 'Solo después de la hora de inicio de la cita. Libera la plaza.',
  acceso: GESTION,
  params: ParamId,
  cuerpo: z.object({}).strict(),
  respuesta: CitaSchema,
  errores: { 404: 'La cita no existe', 409: 'Ya recibida o cerrada', 422: 'CITA_NO_EMPEZADA' },
  manejador: async ({ usuario, params }) => {
    const x = await citaAccesible(usuario, params.id);
    const c = await obtenerConfig(prisma);
    if (reloj.ahora() < x.inicio) throw reglaNegocio('CITA_NO_EMPEZADA', 'Aún no es la hora de la cita');
    await transaccion(async (tx) => {
      const r = await tx.cita.updateMany({ where: { id: x.id, estado: { in: ['PENDIENTE', 'CONFIRMADA'] } }, data: { estado: 'NO_PRESENTADO' } });
      if (!r.count) throw conflicto('CITA_NO_ACTIVA', 'La cita ya no está activa');
      await avisar(tx, x.cliente.usuarioId, { tipo: 'CITA_NO_PRESENTADO', mensaje: 'No te presentaste a tu cita', enlace: '/reservar', datos: datosEmail(x, c.zonaHoraria) });
    });
    return aCita(await prisma.cita.findUniqueOrThrow({ where: { id: x.id }, include: incluir }));
  },
});

