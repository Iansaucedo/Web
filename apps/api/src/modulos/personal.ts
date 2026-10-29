import type { Prisma, Usuario } from '@prisma/client';
import { z } from '../openapi/zod';
import { definir } from '../lib/ruta';
import { prisma } from '../db';
import { bloquear, transaccion } from '../lib/transaccion';
import { conflicto, noEncontrado, prohibido, reglaNegocio } from '../lib/errores';
import { reloj } from '../lib/reloj';
import { diaDeFechaDb, diaLocal, diasEntre, fechaDb } from '../lib/fechas';
import { GESTION, PERSONAL } from '../servicios/acceso';
import { obtenerConfig } from '../servicios/config';
import { ocupacionDia } from '../servicios/agenda';
import { avisarRoles, emailSinCuenta } from '../servicios/avisos';
import { diaLargo, numeroOrden, ROL_TEXTO } from '../emails/formato';
import { Dia, Id, Instante, Ok, ParamId, Rol, TextoCorto, lista } from './esquemas';
import { dejarConstancia } from '../servicios/constancias';

// ─── Puestos ─────────────────────────────────────────────────────────

const PuestoSchema = z
  .object({
    id: Id,
    nombre: z.string(),
    activo: z.boolean(),
    ocupadoPor: z.object({ ordenId: Id, codigo: z.string(), matricula: z.string(), estado: z.string() }).nullable(),
    mecanicoHoy: z.object({ empleadoId: Id, nombre: z.string() }).nullable(),
  })
  .openapi('Puesto');

async function listarPuestos() {
  const c = await obtenerConfig(prisma);
  const hoy = fechaDb(diaLocal(reloj.ahora(), c.zonaHoraria));
  const puestos = await prisma.puesto.findMany({
    orderBy: { nombre: 'asc' },
    include: {
      ocupaciones: { where: { fin: null }, include: { orden: { include: { vehiculo: true } } } },
      asignaciones: { where: { fecha: hoy }, include: { empleado: { include: { usuario: true } } } },
    },
  });
  return puestos.map((p) => {
    const o = p.ocupaciones[0]?.orden;
    const a = p.asignaciones[0];
    return {
      id: p.id,
      nombre: p.nombre,
      activo: p.activo,
      ocupadoPor: o ? { ordenId: o.id, codigo: numeroOrden(o.numero), matricula: o.vehiculo.matricula, estado: o.estado } : null,
      mecanicoHoy: a ? { empleadoId: a.empleadoId, nombre: a.empleado.usuario.nombre } : null,
    };
  });
}

definir({
  metodo: 'get',
  ruta: '/puestos',
  etiqueta: 'Personal',
  resumen: 'Puestos del taller',
  descripcion: 'Con el vehículo que ocupa cada puesto y el mecánico asignado hoy.',
  acceso: PERSONAL,
  respuesta: lista(PuestoSchema),
  manejador: async () => ({ datos: await listarPuestos() }),
});

async function nombreLibre(nombre: string, excepto?: string) {
  if (await prisma.puesto.findFirst({ where: { nombre: { equals: nombre, mode: 'insensitive' }, NOT: { id: excepto } } })) throw conflicto('NOMBRE_DUPLICADO', 'Ya hay un puesto con ese nombre');
}

definir({
  metodo: 'post',
  ruta: '/puestos',
  etiqueta: 'Personal',
  resumen: 'Crear un puesto',
  acceso: GESTION,
  cuerpo: z.object({ nombre: z.string().trim().min(1).max(40) }).strict(),
  respuesta: PuestoSchema,
  codigo: 201,
  errores: { 409: 'Nombre repetido' },
  manejador: async ({ cuerpo }) => {
    await nombreLibre(cuerpo.nombre);
    const p = await prisma.puesto.create({ data: { nombre: cuerpo.nombre } });
    return (await listarPuestos()).find((x) => x.id === p.id)!;
  },
});

definir({
  metodo: 'patch',
  ruta: '/puestos/:id',
  etiqueta: 'Personal',
  resumen: 'Renombrar o activar/desactivar un puesto',
  descripcion: 'Un puesto con un vehículo dentro no se puede desactivar.',
  acceso: GESTION,
  params: ParamId,
  cuerpo: z.object({ nombre: z.string().trim().min(1).max(40).optional(), activo: z.boolean().optional() }).strict(),
  respuesta: PuestoSchema,
  errores: { 404: 'El puesto no existe', 409: 'NOMBRE_DUPLICADO o PUESTO_OCUPADO' },
  manejador: async ({ params, cuerpo }) => {
    await transaccion(async (tx) => {
      await bloquear(tx, `puesto:${params.id}`);
      if (!(await tx.puesto.findUnique({ where: { id: params.id } }))) throw noEncontrado('El puesto');
      if (cuerpo.nombre) await nombreLibre(cuerpo.nombre, params.id);
      if (cuerpo.activo === false && (await tx.ocupacionPuesto.findFirst({ where: { puestoId: params.id, fin: null } }))) {
        throw conflicto('PUESTO_OCUPADO', 'Hay un vehículo en este puesto. Muévelo antes de desactivarlo');
      }
      await tx.puesto.update({ where: { id: params.id }, data: cuerpo });
    });
    return (await listarPuestos()).find((x) => x.id === params.id)!;
  },
});

// ─── Mecánicos, asignaciones y ausencias ─────────────────────────────

const MecanicoSchema = z
  .object({ empleadoId: Id, usuarioId: Id, nombre: z.string(), email: z.string(), rol: Rol, activo: z.boolean(), ausenteHoy: z.boolean(), puestosHoy: z.array(z.string()) })
  .openapi('Mecanico');

definir({
  metodo: 'get',
  ruta: '/mecanicos',
  etiqueta: 'Personal',
  resumen: 'Mecánicos',
  descripcion: 'Con su ausencia y puestos de hoy.',
  acceso: GESTION,
  query: z.object({ incluirBajas: z.enum(['true', 'false']).optional() }),
  respuesta: lista(MecanicoSchema),
  manejador: async ({ query }) => {
    const c = await obtenerConfig(prisma);
    const hoy = fechaDb(diaLocal(reloj.ahora(), c.zonaHoraria));
    const emps = await prisma.empleado.findMany({
      where: { usuario: { rol: 'MECANICO', ...(query.incluirBajas === 'true' ? {} : { activo: true }) }, ...(query.incluirBajas === 'true' ? {} : { activo: true }) },
      include: { usuario: true, ausencias: { where: { fecha: hoy } }, asignaciones: { where: { fecha: hoy }, include: { puesto: true } } },
      orderBy: { usuario: { nombre: 'asc' } },
    });
    return {
      datos: emps.map((e) => ({
        empleadoId: e.id,
        usuarioId: e.usuarioId,
        nombre: e.usuario.nombre,
        email: e.usuario.email,
        rol: e.usuario.rol,
        activo: e.usuario.activo && e.activo,
        ausenteHoy: e.ausencias.length > 0,
        puestosHoy: e.asignaciones.map((a) => a.puesto.nombre),
      })),
    };
  },
});

async function mecanicoActivo(empleadoId: string) {
  const e = await prisma.empleado.findUnique({ where: { id: empleadoId }, include: { usuario: true } });
  if (!e || !e.activo || !e.usuario.activo || e.usuario.rol !== 'MECANICO') throw noEncontrado('El mecánico');
  return e;
}

function noPasado(dia: string, zona: string) {
  if (dia < diaLocal(reloj.ahora(), zona)) throw reglaNegocio('FECHA_PASADA', 'No se puede cambiar un día que ya ha pasado');
}

definir({
  metodo: 'get',
  ruta: '/asignaciones',
  etiqueta: 'Personal',
  resumen: 'Asignaciones de puestos de un día',
  acceso: PERSONAL,
  query: z.object({ fecha: Dia }),
  respuesta: lista(z.object({ puestoId: Id, puesto: z.string(), empleadoId: Id, mecanico: z.string() })),
  manejador: async ({ query }) => {
    const a = await prisma.asignacionPuesto.findMany({ where: { fecha: fechaDb(query.fecha) }, include: { puesto: true, empleado: { include: { usuario: true } } }, orderBy: { puesto: { nombre: 'asc' } } });
    return { datos: a.map((x) => ({ puestoId: x.puestoId, puesto: x.puesto.nombre, empleadoId: x.empleadoId, mecanico: x.empleado.usuario.nombre })) };
  },
});

definir({
  metodo: 'put',
  ruta: '/asignaciones',
  etiqueta: 'Personal',
  resumen: 'Asignar (o quitar) el mecánico de un puesto un día',
  descripcion: 'Un mecánico por puesto y día. Un mecánico puede llevar como mucho `vehiculosPorMecanico` puestos. `empleadoId: null` deja el puesto sin asignar.',
  acceso: GESTION,
  cuerpo: z.object({ fecha: Dia, puestoId: Id, empleadoId: Id.nullable() }).strict(),
  respuesta: Ok,
  errores: { 404: 'Puesto o mecánico no existen', 422: 'FECHA_PASADA, MECANICO_AUSENTE o DEMASIADOS_PUESTOS' },
  manejador: async ({ cuerpo }) => {
    const c = await obtenerConfig(prisma);
    noPasado(cuerpo.fecha, c.zonaHoraria);
    const fecha = fechaDb(cuerpo.fecha);
    const puesto = await prisma.puesto.findUnique({ where: { id: cuerpo.puestoId } });
    if (!puesto || !puesto.activo) throw noEncontrado('El puesto');
    await transaccion(async (tx) => {
      await bloquear(tx, `asignaciones:${cuerpo.fecha}`);
      if (!cuerpo.empleadoId) return tx.asignacionPuesto.deleteMany({ where: { puestoId: puesto.id, fecha } });
      const e = await mecanicoActivo(cuerpo.empleadoId);
      if (await tx.ausencia.findUnique({ where: { empleadoId_fecha: { empleadoId: e.id, fecha } } })) throw reglaNegocio('MECANICO_AUSENTE', `${e.usuario.nombre} no está ese día`);
      const otros = await tx.asignacionPuesto.count({ where: { empleadoId: e.id, fecha, NOT: { puestoId: puesto.id } } });
      if (otros >= c.vehiculosPorMecanico) throw reglaNegocio('DEMASIADOS_PUESTOS', `${e.usuario.nombre} ya lleva ${otros} puestos ese día (máximo ${c.vehiculosPorMecanico})`);
      await tx.asignacionPuesto.upsert({ where: { puestoId_fecha: { puestoId: puesto.id, fecha } }, create: { puestoId: puesto.id, empleadoId: e.id, fecha }, update: { empleadoId: e.id } });
    });
    return { ok: true as const };
  },
});

const TipoAusencia = z.enum(['VACACIONES', 'BAJA_MEDICA', 'PERSONAL', 'OTRA']);
const TIPO_TEXTO: Record<z.infer<typeof TipoAusencia>, string> = { VACACIONES: 'vacaciones', BAJA_MEDICA: 'baja médica', PERSONAL: 'asuntos propios', OTRA: 'ausencia' };
const AusenciaSchema = z.object({ id: Id, empleadoId: Id, mecanico: z.string(), fecha: Dia, tipo: TipoAusencia, nota: z.string().nullable() }).openapi('Ausencia');

definir({
  metodo: 'get',
  ruta: '/ausencias',
  etiqueta: 'Personal',
  resumen: 'Ausencias en un rango',
  descripcion: 'Un elemento por día de ausencia.',
  acceso: GESTION,
  query: z.object({ desde: Dia, hasta: Dia }),
  respuesta: lista(AusenciaSchema),
  manejador: async ({ query }) => {
    const a = await prisma.ausencia.findMany({ where: { fecha: { gte: fechaDb(query.desde), lte: fechaDb(query.hasta) } }, include: { empleado: { include: { usuario: true } } }, orderBy: [{ fecha: 'asc' }] });
    return { datos: a.map((x) => ({ id: x.id, empleadoId: x.empleadoId, mecanico: x.empleado.usuario.nombre, fecha: diaDeFechaDb(x.fecha), tipo: x.tipo, nota: x.nota })) };
  },
});

definir({
  metodo: 'post',
  ruta: '/ausencias',
  etiqueta: 'Personal',
  resumen: 'Registrar una ausencia (vacaciones, baja médica, asuntos propios…)',
  descripcion:
    'De `desde` a `hasta` (incluidos; sin `hasta`, un solo día), máximo 90 días. Crea una ausencia por día, quita las asignaciones de esos días y baja la capacidad. Si en algún día quedan más citas de las que caben, avisa a los jefes una sola vez con el total. Si algún día ya tenía ausencia, no se crea nada (409).',
  acceso: GESTION,
  cuerpo: z
    .object({ empleadoId: Id, desde: Dia, hasta: Dia.optional(), tipo: TipoAusencia, nota: z.string().trim().max(200).optional() })
    .strict()
    .refine((c) => !c.hasta || c.desde <= c.hasta, { message: '`hasta` no puede ser anterior a `desde`', path: ['hasta'] })
    .refine((c) => !c.hasta || diasEntre(c.desde, c.hasta).length <= 90, { message: 'Como máximo 90 días seguidos', path: ['hasta'] }),
  respuesta: z.object({ ids: z.array(Id), dias: z.number().int(), desde: Dia, hasta: Dia, tipo: TipoAusencia }),
  codigo: 201,
  errores: { 404: 'El mecánico no existe', 409: 'YA_AUSENTE: algún día ya tenía ausencia', 422: 'FECHA_PASADA' },
  manejador: async ({ cuerpo }) => {
    const c = await obtenerConfig(prisma);
    noPasado(cuerpo.desde, c.zonaHoraria);
    const e = await mecanicoActivo(cuerpo.empleadoId);
    const hasta = cuerpo.hasta ?? cuerpo.desde;
    const dias = diasEntre(cuerpo.desde, hasta);
    const ids = await transaccion(async (tx) => {
      for (const d of dias) await bloquear(tx, `citas:${d}`);
      const previas = await tx.ausencia.findMany({ where: { empleadoId: e.id, fecha: { in: dias.map(fechaDb) } } });
      if (previas.length) throw conflicto('YA_AUSENTE', `Ya tiene una ausencia el ${diaLargo(diaDeFechaDb(previas[0].fecha))}`);
      await tx.ausencia.createMany({ data: dias.map((d) => ({ empleadoId: e.id, fecha: fechaDb(d), tipo: cuerpo.tipo, nota: cuerpo.nota })) });
      await tx.asignacionPuesto.deleteMany({ where: { empleadoId: e.id, fecha: { in: dias.map(fechaDb) } } });
      let citas = 0;
      let exceso = 0;
      let capacidadMin = Infinity;
      for (const d of dias) {
        const o = await ocupacionDia(tx, d, c);
        citas += o.ocupadas;
        exceso += Math.max(0, o.ocupadas - o.capacidad);
        capacidadMin = Math.min(capacidadMin, o.capacidad);
      }
      const periodo = dias.length === 1 ? diaLargo(cuerpo.desde) : `del ${diaLargo(cuerpo.desde)} al ${diaLargo(hasta)}`;
      await avisarRoles(tx, ['JEFE'], {
        tipo: 'MECANICO_AUSENTE',
        mensaje: `${e.usuario.nombre}: ${TIPO_TEXTO[cuerpo.tipo]} ${periodo}${exceso ? `. Sobran ${exceso} citas` : ''}`,
        enlace: `/jefe/citas?fecha=${cuerpo.desde}`,
        datos: { mecanico: e.usuario.nombre, tipo: TIPO_TEXTO[cuerpo.tipo], fecha: periodo, capacidad: capacidadMin, citas, exceso },
      });
      return (await tx.ausencia.findMany({ where: { empleadoId: e.id, fecha: { in: dias.map(fechaDb) } }, orderBy: { fecha: 'asc' } })).map((a) => a.id);
    });
    return { ids, dias: dias.length, desde: cuerpo.desde, hasta, tipo: cuerpo.tipo };
  },
});

definir({
  metodo: 'delete',
  ruta: '/ausencias/:id',
  etiqueta: 'Personal',
  resumen: 'Quitar una ausencia',
  acceso: GESTION,
  params: ParamId,
  codigo: 204,
  errores: { 404: 'La ausencia no existe' },
  manejador: async ({ usuario, params }) => {
    await transaccion(async (tx) => {
      const a = await tx.ausencia.findUnique({ where: { id: params.id } });
      if (!a) throw noEncontrado('La ausencia');
      await dejarConstancia(tx, 'Ausencia', a, 'BORRADO', usuario.id);
      await tx.ausencia.delete({ where: { id: a.id } });
    });
  },
});

// ─── Invitaciones ────────────────────────────────────────────────────

const InvitacionSchema = z.object({ id: Id, email: z.string(), rol: Rol, creadaPor: z.string(), creadaEn: Instante, usadaEn: Instante.nullable() }).openapi('Invitacion');
const incluirInv = { creadaPor: true } satisfies Prisma.InvitacionInclude;
const aInv = (i: Prisma.InvitacionGetPayload<{ include: typeof incluirInv }>) => ({ id: i.id, email: i.email, rol: i.rol, creadaPor: i.creadaPor.nombre, creadaEn: i.creadaEn, usadaEn: i.usadaEn });

definir({
  metodo: 'get',
  ruta: '/invitaciones',
  etiqueta: 'Personal',
  resumen: 'Invitaciones enviadas',
  acceso: GESTION,
  respuesta: lista(InvitacionSchema),
  manejador: async () => ({ datos: (await prisma.invitacion.findMany({ include: incluirInv, orderBy: { creadaEn: 'desc' } })).map(aInv) }),
});

definir({
  metodo: 'post',
  ruta: '/invitaciones',
  etiqueta: 'Personal',
  resumen: 'Dar de alta a un empleado',
  descripcion: 'El jefe invita mecánicos; el dueño, mecánicos y jefes. La persona entra con la cuenta de Google de ese email y recibe el rol.',
  acceso: GESTION,
  idempotente: true,
  cuerpo: z.object({ email: z.email().transform((e) => e.trim().toLowerCase()), rol: z.enum(['MECANICO', 'JEFE']) }).strict(),
  respuesta: InvitacionSchema,
  codigo: 201,
  errores: { 403: 'El jefe solo invita mecánicos', 409: 'YA_REGISTRADO o YA_INVITADO' },
  manejador: async ({ usuario, cuerpo }) => {
    if (cuerpo.rol === 'JEFE' && usuario.rol !== 'DUENO') throw prohibido('Solo el dueño puede dar de alta jefes de taller');
    if (await prisma.usuario.findUnique({ where: { email: cuerpo.email } })) {
      throw conflicto('YA_REGISTRADO', 'Ese email ya tiene cuenta. Cambia su rol desde Usuarios');
    }
    const previa = await prisma.invitacion.findUnique({ where: { email: cuerpo.email } });
    if (previa && !previa.usadaEn) throw conflicto('YA_INVITADO', 'Ese email ya tiene una invitación pendiente');
    const id = await transaccion(async (tx) => {
      const inv = previa
        ? await tx.invitacion.update({ where: { id: previa.id }, data: { rol: cuerpo.rol, creadaPorId: usuario.id, usadaEn: null, creadaEn: reloj.ahora() } })
        : await tx.invitacion.create({ data: { email: cuerpo.email, rol: cuerpo.rol, creadaPorId: usuario.id } });
      await emailSinCuenta(tx, cuerpo.email, 'INVITACION', { rol: ROL_TEXTO[cuerpo.rol], invitadoPor: usuario.nombre, email: cuerpo.email }, '/login');
      return inv.id;
    });
    return aInv(await prisma.invitacion.findUniqueOrThrow({ where: { id }, include: incluirInv }));
  },
});

definir({
  metodo: 'delete',
  ruta: '/invitaciones/:id',
  etiqueta: 'Personal',
  resumen: 'Anular una invitación sin usar',
  acceso: GESTION,
  params: ParamId,
  codigo: 204,
  errores: { 404: 'No existe o ya se usó' },
  manejador: async ({ usuario, params }) => {
    await transaccion(async (tx) => {
      const i = await tx.invitacion.findFirst({ where: { id: params.id, usadaEn: null } });
      if (!i) throw noEncontrado('La invitación pendiente');
      await dejarConstancia(tx, 'Invitacion', i, 'BORRADO', usuario.id);
      await tx.invitacion.delete({ where: { id: i.id } });
    });
  },
});

// ─── Usuarios (dueño) y clientes ─────────────────────────────────────

const UsuarioAdminSchema = z.object({ id: Id, email: z.string(), nombre: z.string(), rol: Rol, activo: z.boolean(), creadoEn: Instante }).openapi('UsuarioAdmin');

definir({
  metodo: 'get',
  ruta: '/usuarios',
  etiqueta: 'Usuarios',
  resumen: 'Todos los usuarios',
  acceso: ['DUENO'],
  query: z.object({ rol: Rol.optional(), q: z.string().max(60).optional() }),
  respuesta: lista(UsuarioAdminSchema),
  manejador: async ({ query }) => {
    const where: Prisma.UsuarioWhereInput = query.rol ? { rol: query.rol } : {};
    if (query.q) where.OR = [{ email: { contains: query.q, mode: 'insensitive' } }, { nombre: { contains: query.q, mode: 'insensitive' } }];
    const u = await prisma.usuario.findMany({ where, orderBy: { nombre: 'asc' }, take: 500 });
    return { datos: u.map(({ id, email, nombre, rol, activo, creadoEn }) => ({ id, email, nombre, rol, activo, creadoEn })) };
  },
});

definir({
  metodo: 'patch',
  ruta: '/usuarios/:id',
  etiqueta: 'Usuarios',
  resumen: 'Cambiar rol o dar de baja',
  descripcion: 'Dar de baja cierra la sesión del usuario al instante. Nadie puede cambiarse a sí mismo. Un cliente con vehículos no pasa a personal.',
  acceso: ['DUENO'],
  params: ParamId,
  cuerpo: z.object({ rol: Rol.optional(), activo: z.boolean().optional() }).strict(),
  respuesta: UsuarioAdminSchema,
  errores: { 404: 'El usuario no existe', 422: 'NO_A_TI_MISMO o ES_CLIENTE' },
  manejador: async ({ usuario, params, cuerpo }) => {
    if (params.id === usuario.id) throw reglaNegocio('NO_A_TI_MISMO', 'No puedes cambiar tu propio rol ni darte de baja');
    const u = await prisma.usuario.findUnique({ where: { id: params.id }, include: { cliente: { include: { vehiculos: { take: 1 } } } } });
    if (!u) throw noEncontrado('El usuario');
    if (cuerpo.rol && cuerpo.rol !== 'CLIENTE' && u.cliente?.vehiculos.length) throw reglaNegocio('ES_CLIENTE', 'Este usuario es cliente con vehículos registrados. Debe usar otra cuenta');
    const r = await transaccion(async (tx) => {
      if (cuerpo.activo === false && u.activo) {
        const { cliente: _c, googleId: _g, ...copia } = u;
        await dejarConstancia(tx, 'Usuario', copia, 'BAJA', usuario.id);
      }
      const act = await tx.usuario.update({ where: { id: u.id }, data: { ...cuerpo, ...(cuerpo.activo === false ? { bajaSolicitadaEn: null } : {}) } });
      if (act.rol === 'MECANICO' || act.rol === 'JEFE') await tx.empleado.upsert({ where: { usuarioId: u.id }, create: { usuarioId: u.id, activo: act.activo }, update: { activo: act.activo } });
      else await tx.empleado.updateMany({ where: { usuarioId: u.id }, data: { activo: false } });
      return act;
    });
    return { id: r.id, email: r.email, nombre: r.nombre, rol: r.rol, activo: r.activo, creadoEn: r.creadoEn };
  },
});

definir({
  metodo: 'get',
  ruta: '/clientes',
  etiqueta: 'Usuarios',
  resumen: 'Clientes (particulares y empresas)',
  acceso: GESTION,
  query: z.object({ tipo: z.enum(['INDIVIDUAL', 'EMPRESA']).optional(), q: z.string().max(60).optional() }),
  respuesta: lista(
    z.object({ id: Id, nombre: z.string(), email: z.string(), telefono: z.string(), tipo: z.enum(['INDIVIDUAL', 'EMPRESA']), razonSocial: z.string().nullable(), nif: z.string().nullable(), vehiculos: z.number().int(), ordenesAbiertas: z.number().int() }).openapi('ClienteListado'),
  ),
  manejador: async ({ query }) => {
    const where: Prisma.ClienteWhereInput = query.tipo ? { tipo: query.tipo } : {};
    if (query.q) where.OR = [{ razonSocial: { contains: query.q, mode: 'insensitive' } }, { usuario: { nombre: { contains: query.q, mode: 'insensitive' } } }, { nif: { contains: query.q.toUpperCase() } }];
    const cs = await prisma.cliente.findMany({
      where,
      include: { usuario: true, _count: { select: { vehiculos: true } }, vehiculos: { include: { ordenes: { where: { estado: { not: 'ENTREGADA' } }, select: { id: true } } } } },
      orderBy: { usuario: { nombre: 'asc' } },
      take: 300,
    });
    return {
      datos: cs.map((c) => ({
        id: c.id,
        nombre: c.usuario.nombre,
        email: c.usuario.email,
        telefono: c.telefono,
        tipo: c.tipo,
        razonSocial: c.razonSocial,
        nif: c.nif,
        vehiculos: c._count.vehiculos,
        ordenesAbiertas: c.vehiculos.reduce((s, v) => s + v.ordenes.length, 0),
      })),
    };
  },
});


// ─── Constancias de eliminación (dueño) ──────────────────────────────

definir({
  metodo: 'get',
  ruta: '/eliminaciones',
  etiqueta: 'Usuarios',
  resumen: 'Constancias de eliminación',
  descripcion: 'Copia de cada registro borrado o dado de baja, con quién, cuándo y por qué. Solo lectura.',
  acceso: ['DUENO'],
  query: z.object({ entidad: z.string().max(40).optional() }),
  respuesta: lista(
    z.object({ id: Id, entidad: z.string(), entidadId: Id, modo: z.enum(['BORRADO', 'BAJA']), datos: z.record(z.string(), z.unknown()), motivo: z.string().nullable(), usuario: z.string(), fecha: Instante }).openapi('Constancia'),
  ),
  manejador: async ({ query }) => {
    const r = await prisma.registroEliminacion.findMany({ where: query.entidad ? { entidad: query.entidad } : {}, orderBy: { fecha: 'desc' }, take: 300 });
    const usuarios = new Map((await prisma.usuario.findMany({ where: { id: { in: [...new Set(r.map((x) => x.usuarioId))] } } })).map((u) => [u.id, u.nombre]));
    return { datos: r.map((x) => ({ id: x.id, entidad: x.entidad, entidadId: x.entidadId, modo: x.modo, datos: x.datos as Record<string, unknown>, motivo: x.motivo, usuario: usuarios.get(x.usuarioId) ?? '—', fecha: x.fecha })) };
  },
});

// ─── Bajas de personal ───────────────────────────────────────────────

async function empleadoGestionable(actor: Usuario, empleadoId: string) {
  const e = await prisma.empleado.findUnique({ where: { id: empleadoId }, include: { usuario: true } });
  if (!e) throw noEncontrado('El empleado');
  if (e.usuarioId === actor.id) throw prohibido('No puedes darte de baja a ti mismo');
  // El jefe gestiona mecánicos; a los jefes solo los gestiona el dueño.
  if (e.usuario.rol === 'JEFE' && actor.rol !== 'DUENO') throw prohibido('Solo el dueño da de baja a un jefe de taller');
  if (e.usuario.rol === 'DUENO') throw prohibido();
  return e;
}

definir({
  metodo: 'post',
  ruta: '/empleados/:id/baja',
  etiqueta: 'Personal',
  resumen: 'Dar de baja a un empleado',
  descripcion: 'El jefe da de baja mecánicos; el dueño, mecánicos y jefes. Pierde el acceso al momento (no lo recupera entrando), sale de la capacidad y de sus puestos futuros, y queda constancia. Su historial se conserva. Se puede reactivar.',
  acceso: GESTION,
  params: ParamId,
  cuerpo: z.object({ motivo: TextoCorto }).strict(),
  respuesta: Ok,
  errores: { 403: 'Un jefe dando de baja a otro jefe, o a sí mismo', 404: 'El empleado no existe', 409: 'Ya estaba de baja' },
  manejador: async ({ usuario, params, cuerpo }) => {
    const e = await empleadoGestionable(usuario, params.id);
    await transaccion(async (tx) => {
      const r = await tx.usuario.updateMany({ where: { id: e.usuarioId, activo: true }, data: { activo: false, bajaSolicitadaEn: null } });
      if (!r.count) throw conflicto('YA_DE_BAJA', `${e.usuario.nombre} ya estaba de baja`);
      await tx.empleado.update({ where: { id: e.id }, data: { activo: false } });
      await tx.asignacionPuesto.deleteMany({ where: { empleadoId: e.id, fecha: { gte: fechaDb(diaLocal(reloj.ahora(), (await obtenerConfig(tx)).zonaHoraria)) } } });
      const { usuario: u } = e;
      const { googleId: _g, ...copia } = u;
      await dejarConstancia(tx, 'Usuario', copia, 'BAJA', usuario.id, cuerpo.motivo);
    });
    return { ok: true as const };
  },
});

definir({
  metodo: 'post',
  ruta: '/empleados/:id/reactivar',
  etiqueta: 'Personal',
  resumen: 'Reactivar a un empleado dado de baja',
  acceso: GESTION,
  params: ParamId,
  cuerpo: z.object({}).strict(),
  respuesta: Ok,
  errores: { 403: 'Un jefe reactivando a otro jefe', 404: 'El empleado no existe', 409: 'No estaba de baja' },
  manejador: async ({ usuario, params }) => {
    const e = await empleadoGestionable(usuario, params.id);
    await transaccion(async (tx) => {
      const r = await tx.usuario.updateMany({ where: { id: e.usuarioId, activo: false, desvinculadoEn: null }, data: { activo: true } });
      if (!r.count) throw conflicto('NO_DE_BAJA', `${e.usuario.nombre} no está de baja`);
      await tx.empleado.update({ where: { id: e.id }, data: { activo: true } });
    });
    return { ok: true as const };
  },
});
