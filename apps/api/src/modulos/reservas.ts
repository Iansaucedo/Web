import type { Prisma, Usuario } from '@prisma/client';
import { z } from '../openapi/zod';
import { definir } from '../lib/ruta';
import { prisma } from '../db';
import { bloquear, transaccion } from '../lib/transaccion';
import { conflicto, noEncontrado, reglaNegocio } from '../lib/errores';
import { reloj } from '../lib/reloj';
import { diaDeFechaDb, diaLocal, fechaDb } from '../lib/fechas';
import { clienteDe, esPersonal, GESTION } from '../servicios/acceso';
import { obtenerConfig } from '../servicios/config';
import { esLaborable, franjasDelDia, libresEnFranja, ocupacionDia } from '../servicios/agenda';
import { avisar, avisarRoles } from '../servicios/avisos';
import { diaLargo, enumerar, hora, numeroReserva } from '../emails/formato';
import { Dia, Id, Instante, ParamId, lista } from './esquemas';

const EstadoReserva = z.enum(['EN_ESPERA', 'HUECO_OFRECIDO', 'CONVERTIDA', 'CANCELADA']);
const ReservaSchema = z
  .object({
    id: Id,
    estado: EstadoReserva,
    fechasPreferidas: z.array(Dia),
    codigo: z.string().openapi({ example: 'RM-07' }),
    fechaOfrecida: Dia.nullable(),
    franjasOfrecidas: z.array(Instante).openapi({ description: 'Una por vehículo, en el mismo orden que `vehiculos`' }),
    convertidaEn: Instante.nullable(),
    cliente: z.object({ id: Id, nombre: z.string(), telefono: z.string() }),
    vehiculos: z.array(z.object({ id: Id, matricula: z.string(), marca: z.string(), modelo: z.string() })),
    creadaEn: Instante,
  })
  .openapi('ReservaMultiple');

// Los vehículos siempre en el mismo orden: la franja i es la del vehículo i.
const incluir = { cliente: { include: { usuario: true } }, vehiculos: { include: { vehiculo: true }, orderBy: { vehiculo: { matricula: 'asc' } } } } satisfies Prisma.ReservaMultipleInclude;
type ReservaBd = Prisma.ReservaMultipleGetPayload<{ include: typeof incluir }>;
const aReserva = (r: ReservaBd) => ({
  id: r.id,
  codigo: numeroReserva(r.numero),
  estado: r.estado,
  fechasPreferidas: r.fechasPreferidas.map(diaDeFechaDb),
  fechaOfrecida: r.fechaOfrecida ? diaDeFechaDb(r.fechaOfrecida) : null,
  franjasOfrecidas: r.franjasOfrecidas,
  convertidaEn: r.convertidaEn,
  cliente: { id: r.cliente.id, nombre: r.cliente.razonSocial ?? r.cliente.usuario.nombre, telefono: r.cliente.telefono },
  vehiculos: r.vehiculos.map(({ vehiculo: v }) => ({ id: v.id, matricula: v.matricula, marca: v.marca, modelo: v.modelo })),
  creadaEn: r.creadaEn,
});
const textoVehiculos = (r: ReservaBd) => r.vehiculos.map((x) => x.vehiculo.matricula).join(', ');

async function reservaAccesible(u: Usuario, id: string) {
  const r = await prisma.reservaMultiple.findUnique({ where: { id }, include: incluir });
  if (!r || (!esPersonal(u) && r.cliente.usuarioId !== u.id)) throw noEncontrado('La reserva');
  return r;
}

/**
 * Comprueba que las franjas elegidas (HH:mm) son del horario de ese día, futuras y tienen hueco
 * contando también las demás franjas elegidas. Devuelve las franjas o el motivo por el que no caben.
 */
type Comprobacion = { sinHueco: string; franjas?: undefined } | { sinHueco?: undefined; franjas: { inicio: Date; fin: Date; hora: string }[] };

async function comprobarFranjas(tx: Prisma.TransactionClient, dia: string, horas: string[]): Promise<Comprobacion> {
  const c = await obtenerConfig(tx);
  const delDia = franjasDelDia(dia, c).filter((f) => f.inicio > reloj.ahora());
  const elegidas = horas.map((h) => delDia.find((f) => f.hora === h));
  const mala = horas.find((_, i) => !elegidas[i]);
  if (mala) throw reglaNegocio('FRANJA_NO_VALIDA', `${mala} no es una franja libre del ${diaLargo(dia)}`);
  const o = await ocupacionDia(tx, dia, c);
  if (o.ocupadas + horas.length > o.capacidad) return { sinHueco: `El ${diaLargo(dia)} no caben los ${horas.length} vehículos` };
  const llenas = elegidas.filter((f) => libresEnFranja(o, f!.inicio, c) < 1).map((f) => f!.hora);
  if (llenas.length) return { sinHueco: `La franja de las ${enumerar(llenas)} ya está llena` };
  return { franjas: elegidas as { inicio: Date; fin: Date; hora: string }[] };
}

definir({
  metodo: 'get',
  ruta: '/reservas-multiples',
  etiqueta: 'Reservas múltiples',
  resumen: 'Listar reservas múltiples',
  descripcion: 'La empresa ve las suyas; el personal, todas.',
  query: z.object({ estado: EstadoReserva.optional() }),
  respuesta: lista(ReservaSchema),
  manejador: async ({ usuario, query }) => {
    const where: Prisma.ReservaMultipleWhereInput = { ...(esPersonal(usuario) ? {} : { cliente: { usuarioId: usuario.id } }), ...(query.estado ? { estado: query.estado } : {}) };
    return { datos: (await prisma.reservaMultiple.findMany({ where, include: incluir, orderBy: { creadaEn: 'desc' } })).map(aReserva) };
  },
});

definir({
  metodo: 'post',
  ruta: '/reservas-multiples',
  etiqueta: 'Reservas múltiples',
  resumen: 'Pedir cita para varios vehículos el mismo día',
  descripcion: 'Solo empresas. El jefe busca un día con hueco para todos entre las fechas preferidas y lo ofrece.',
  acceso: ['CLIENTE'],
  idempotente: true,
  cuerpo: z
    .object({
      vehiculoIds: z.array(Id).min(2).max(20).refine((v) => new Set(v).size === v.length, 'Hay vehículos repetidos'),
      fechasPreferidas: z.array(Dia).min(1).max(5).refine((v) => new Set(v).size === v.length, 'Hay fechas repetidas'),
    })
    .strict(),
  respuesta: ReservaSchema,
  codigo: 201,
  errores: { 404: 'Algún vehículo no existe o no es tuyo', 409: 'Algún vehículo ya tiene cita', 422: 'SOLO_EMPRESAS o FECHA_NO_VALIDA' },
  manejador: async ({ usuario, cuerpo }) => {
    const cliente = await clienteDe(usuario);
    if (cliente.tipo !== 'EMPRESA') throw reglaNegocio('SOLO_EMPRESAS', 'La reserva de varios vehículos es para empresas');
    const c = await obtenerConfig(prisma);
    const hoy = diaLocal(reloj.ahora(), c.zonaHoraria);
    const malas = cuerpo.fechasPreferidas.filter((d) => d <= hoy || !esLaborable(d, c));
    if (malas.length) throw reglaNegocio('FECHA_NO_VALIDA', `Estas fechas no son días laborables futuros: ${malas.join(', ')}`);
    const vehiculos = await prisma.vehiculo.findMany({ where: { id: { in: cuerpo.vehiculoIds }, clienteId: cliente.id } });
    if (vehiculos.length !== cuerpo.vehiculoIds.length) throw noEncontrado('Alguno de los vehículos');
    const ocupado = await prisma.cita.findFirst({ where: { vehiculoId: { in: cuerpo.vehiculoIds }, estado: { in: ['PENDIENTE', 'CONFIRMADA'] } }, include: { vehiculo: true } });
    if (ocupado) throw conflicto('VEHICULO_CON_CITA', `${ocupado.vehiculo.matricula} ya tiene una cita`);

    const id = await transaccion(async (tx) => {
      const r = await tx.reservaMultiple.create({
        data: {
          clienteId: cliente.id,
          fechasPreferidas: [...cuerpo.fechasPreferidas].sort().map(fechaDb),
          vehiculos: { create: cuerpo.vehiculoIds.map((vehiculoId) => ({ vehiculoId })) },
        },
        include: incluir,
      });
      const datos = { numVehiculos: vehiculos.length, vehiculos: textoVehiculos(r), fechas: cuerpo.fechasPreferidas.map(diaLargo).join(' · ') };
      await avisar(tx, usuario.id, { tipo: 'RESERVA_MULTIPLE_RECIBIDA', mensaje: `Reserva de ${vehiculos.length} vehículos recibida`, enlace: '/reservas', datos });
      await avisarRoles(tx, ['JEFE'], {
        tipo: 'RESERVA_MULTIPLE_NUEVA',
        mensaje: `${cliente.razonSocial} pide cita para ${vehiculos.length} vehículos`,
        enlace: '/jefe/citas',
        datos: { ...datos, cliente: cliente.razonSocial },
      });
      return r.id;
    });
    return aReserva(await prisma.reservaMultiple.findUniqueOrThrow({ where: { id }, include: incluir }));
  },
});

definir({
  metodo: 'post',
  ruta: '/reservas-multiples/:id/ofrecer',
  etiqueta: 'Reservas múltiples',
  resumen: 'Ofrecer un día y sus franjas a la empresa',
  descripcion:
    'El jefe elige el día y una franja por vehículo (HH:mm, sin repetir). Se comprueba que caben ese día y en cada franja. El hueco no se reserva hasta que la empresa acepta (o el jefe pulsa «Confirmar ya» si aceptan por teléfono).',
  acceso: GESTION,
  params: ParamId,
  cuerpo: z
    .object({
      fecha: Dia,
      franjas: z
        .array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Formato HH:mm'))
        .min(1)
        .max(20)
        .refine((v) => new Set(v).size === v.length, 'Hay franjas repetidas'),
    })
    .strict(),
  respuesta: ReservaSchema,
  errores: { 404: 'La reserva no existe', 409: 'SIN_HUECO (el mensaje dice qué franja está llena) o la reserva no está en espera', 422: 'FRANJAS_NO_COINCIDEN o FRANJA_NO_VALIDA' },
  manejador: async ({ usuario, params, cuerpo }) => {
    const r = await reservaAccesible(usuario, params.id);
    if (cuerpo.franjas.length !== r.vehiculos.length) {
      throw reglaNegocio('FRANJAS_NO_COINCIDEN', `Elige ${r.vehiculos.length} franjas, una por vehículo`);
    }
    const horas = [...cuerpo.franjas].sort();
    await transaccion(async (tx) => {
      await bloquear(tx, `citas:${cuerpo.fecha}`);
      const x = await comprobarFranjas(tx, cuerpo.fecha, horas);
      if (!x.franjas) throw conflicto('SIN_HUECO', x.sinHueco);
      const n = await tx.reservaMultiple.updateMany({
        where: { id: r.id, estado: { in: ['EN_ESPERA', 'HUECO_OFRECIDO'] } },
        data: { estado: 'HUECO_OFRECIDO', fechaOfrecida: fechaDb(cuerpo.fecha), franjasOfrecidas: x.franjas.map((f) => f.inicio) },
      });
      if (!n.count) throw conflicto('RESERVA_CERRADA', 'La reserva ya no está en espera');
      await avisar(tx, r.cliente.usuarioId, {
        tipo: 'HUECO_OFRECIDO',
        mensaje: `Hay hueco el ${diaLargo(cuerpo.fecha)} para tus ${r.vehiculos.length} vehículos`,
        enlace: '/reservas',
        datos: { fecha: diaLargo(cuerpo.fecha), franjas: enumerar(horas), numVehiculos: r.vehiculos.length, vehiculos: textoVehiculos(r) },
      });
    });
    return aReserva(await prisma.reservaMultiple.findUniqueOrThrow({ where: { id: r.id }, include: incluir }));
  },
});

definir({
  metodo: 'post',
  ruta: '/reservas-multiples/:id/aceptar',
  etiqueta: 'Reservas múltiples',
  resumen: 'Aceptar el día ofrecido',
  descripcion:
    'Crea una cita CONFIRMADA por vehículo en las franjas ofrecidas. La acepta la empresa, o el jefe («Confirmar ya») si la empresa ha aceptado por teléfono; la empresa recibe el email en los dos casos. Si mientras tanto el día o alguna franja se ha llenado, la reserva vuelve a EN_ESPERA y se responde 409.',
  acceso: ['CLIENTE', 'JEFE'],
  params: ParamId,
  cuerpo: z.object({}).strict(),
  respuesta: ReservaSchema,
  errores: { 404: 'No existe o no es tuya', 409: 'SIN_HUECO o no hay hueco ofrecido' },
  manejador: async ({ usuario, params }) => {
    const r = await reservaAccesible(usuario, params.id);
    const sinHueco = await transaccion(async (tx) => {
      await bloquear(tx, `reserva:${r.id}`);
      const actual = await tx.reservaMultiple.findUniqueOrThrow({ where: { id: r.id } });
      if (actual.estado !== 'HUECO_OFRECIDO' || !actual.fechaOfrecida) throw conflicto('SIN_OFERTA', 'No hay ningún día ofrecido para aceptar');
      const dia = diaDeFechaDb(actual.fechaOfrecida);
      await bloquear(tx, `citas:${dia}`);
      const c = await obtenerConfig(tx);
      const x = await comprobarFranjas(tx, dia, actual.franjasOfrecidas.map((f) => hora(f, c.zonaHoraria))).catch((): Comprobacion => ({ sinHueco: 'Alguna franja ofrecida ya ha pasado' }));
      if (!x.franjas) {
        await tx.reservaMultiple.update({ where: { id: r.id }, data: { estado: 'EN_ESPERA', fechaOfrecida: null, franjasOfrecidas: [] } });
        return true;
      }
      const huecos = x.franjas;
      const citas = [];
      for (const [i, { vehiculo }] of r.vehiculos.entries()) {
        citas.push(
          await tx.cita.create({
            data: { clienteId: r.clienteId, vehiculoId: vehiculo.id, inicio: huecos[i].inicio, fin: huecos[i].fin, estado: 'CONFIRMADA', descripcionProblema: 'Reserva de flota', reservaMultipleId: r.id, creadaEn: reloj.ahora() },
          }),
        );
      }
      await tx.reservaMultiple.update({ where: { id: r.id }, data: { estado: 'CONVERTIDA', convertidaEn: reloj.ahora() } });
      await avisar(tx, r.cliente.usuarioId, {
        tipo: 'RESERVA_MULTIPLE_CONFIRMADA',
        mensaje: `Citas confirmadas el ${diaLargo(dia)} para ${citas.length} vehículos`,
        enlace: '/ordenes',
        datos: {
          fecha: diaLargo(dia),
          numVehiculos: citas.length,
          citas: citas.map((x, i) => ({ vehiculo: `${r.vehiculos[i].vehiculo.marca} ${r.vehiculos[i].vehiculo.modelo} · ${r.vehiculos[i].vehiculo.matricula}`, hora: hora(x.inicio, c.zonaHoraria) })),
        },
      });
      return false;
    });
    if (sinHueco) throw conflicto('SIN_HUECO', 'Ese día se ha llenado mientras tanto. El taller te ofrecerá otro');
    return aReserva(await prisma.reservaMultiple.findUniqueOrThrow({ where: { id: r.id }, include: incluir }));
  },
});

definir({
  metodo: 'post',
  ruta: '/reservas-multiples/:id/cancelar',
  etiqueta: 'Reservas múltiples',
  resumen: 'Cancelar una reserva múltiple',
  descripcion: 'Mientras esté en espera o con hueco ofrecido. Una reserva ya convertida se gestiona cita a cita.',
  acceso: ['CLIENTE', 'JEFE'],
  params: ParamId,
  cuerpo: z.object({}).strict(),
  respuesta: ReservaSchema,
  errores: { 404: 'No existe o no es tuya', 409: 'Ya convertida o cancelada' },
  manejador: async ({ usuario, params }) => {
    const r = await reservaAccesible(usuario, params.id);
    const n = await prisma.reservaMultiple.updateMany({ where: { id: r.id, estado: { in: ['EN_ESPERA', 'HUECO_OFRECIDO'] } }, data: { estado: 'CANCELADA' } });
    if (!n.count) throw conflicto('RESERVA_CERRADA', 'La reserva ya está convertida o cancelada');
    return aReserva(await prisma.reservaMultiple.findUniqueOrThrow({ where: { id: r.id }, include: incluir }));
  },
});
