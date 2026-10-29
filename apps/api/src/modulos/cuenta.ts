import { z } from '../openapi/zod';
import { definir } from '../lib/ruta';
import { prisma } from '../db';
import { transaccion } from '../lib/transaccion';
import { noEncontrado, prohibido, reglaNegocio } from '../lib/errores';
import { avisar } from '../servicios/avisos';
import { aUsuario, ParamId, UsuarioSchema, Id, Instante, lista } from './esquemas';
import { obtenerConfig } from '../servicios/config';
import { dejarConstancia } from '../servicios/constancias';
import { DIAS_RECUPERACION } from '../servicios/bajas';
import { COOKIE_SESION } from '../middleware/auth';
import { conflicto } from '../lib/errores';
import { reloj } from '../lib/reloj';
import { diaLargo } from '../emails/formato';
import { diaLocal, sumarDias } from '../lib/fechas';

// ─── Perfil ──────────────────────────────────────────────────────────

const Telefono = z
  .string()
  .transform((t) => t.replace(/[\s.()-]/g, ''))
  .pipe(z.string().regex(/^\+?\d{9,15}$/, 'Teléfono no válido'))
  .openapi({ example: '600111222' });
// NIF, NIE o CIF: formato (no se comprueba la letra de control).
const Nif = z
  .string()
  .transform((t) => t.replace(/[\s-]/g, '').toUpperCase())
  .pipe(z.string().regex(/^([0-9]{8}[A-Z]|[XYZ][0-9]{7}[A-Z]|[ABCDEFGHJNPQRSUVW][0-9]{7}[0-9A-J])$/, 'NIF/CIF no válido'))
  .openapi({ example: 'B12345678' });

const PerfilEntrada = z
  .discriminatedUnion('tipo', [
    z.object({ tipo: z.literal('INDIVIDUAL'), telefono: Telefono }),
    z.object({ tipo: z.literal('EMPRESA'), telefono: Telefono, razonSocial: z.string().trim().min(2).max(120), nif: Nif }),
  ])
  .openapi('PerfilEntrada');

definir({
  metodo: 'put',
  ruta: '/perfil',
  etiqueta: 'Acceso',
  resumen: 'Completar o actualizar el perfil de cliente',
  descripcion: 'Particular o empresa. Al completarlo por primera vez se envía el email de bienvenida. Una empresa tiene una sola cuenta.',
  acceso: ['CLIENTE'],
  cuerpo: PerfilEntrada,
  respuesta: UsuarioSchema,
  manejador: async ({ usuario, cuerpo }) => {
    if (usuario.rol !== 'CLIENTE') throw prohibido('Solo los clientes tienen perfil');
    const datos = { tipo: cuerpo.tipo, telefono: cuerpo.telefono, razonSocial: cuerpo.tipo === 'EMPRESA' ? cuerpo.razonSocial : null, nif: cuerpo.tipo === 'EMPRESA' ? cuerpo.nif : null };
    await transaccion(async (tx) => {
      const previo = await tx.cliente.findUnique({ where: { usuarioId: usuario.id } });
      if (previo) return tx.cliente.update({ where: { id: previo.id }, data: datos });
      await tx.cliente.create({ data: { ...datos, usuarioId: usuario.id } });
      await avisar(tx, usuario.id, { tipo: 'BIENVENIDA', mensaje: 'Tu cuenta está lista. Ya puedes reservar cita.', enlace: '/reservar', datos: {} });
    });
    return aUsuario(await prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id }, include: { cliente: true, empleado: true } }));
  },
});

definir({
  metodo: 'post',
  ruta: '/perfil/baja',
  etiqueta: 'Acceso',
  resumen: 'Darme de baja (clientes)',
  descripcion: `Baja lógica de la propia cuenta, solo para clientes (al personal lo da de baja su responsable). Se cancelan sus citas futuras y reservas múltiples pendientes (no se recuperan), se cierra la sesión y queda constancia. Durante ${DIAS_RECUPERACION} días puede entrar, pero solo para recuperar la cuenta o salir. Después se desliga Google y se libera el email; el historial se conserva. No se puede iniciar con un vehículo en el taller.`,
  acceso: ['CLIENTE'],
  cuerpo: z.object({ confirmacion: z.literal('DAR DE BAJA').openapi({ description: 'Texto que el usuario escribe para confirmar' }), motivo: z.string().trim().max(300).optional() }).strict(),
  codigo: 204,
  errores: { 403: 'Solo los clientes se dan de baja ellos mismos', 409: 'BAJA_CON_PENDIENTES: hay un vehículo en el taller' },
  manejador: async ({ usuario, cuerpo, res }) => {
    if (usuario.rol !== 'CLIENTE') throw prohibido('Al personal lo da de baja su responsable');
    await transaccion(async (tx) => {
      const enTaller = await tx.orden.count({ where: { cita: { cliente: { usuarioId: usuario.id } }, estado: { not: 'ENTREGADA' } } });
      if (enTaller) throw conflicto('BAJA_CON_PENDIENTES', 'Tienes un vehículo en el taller. Podrás darte de baja cuando lo recojas');
      const r = await tx.usuario.updateMany({ where: { id: usuario.id, activo: true }, data: { activo: false, bajaSolicitadaEn: reloj.ahora() } });
      if (!r.count) throw conflicto('YA_DE_BAJA', 'Tu cuenta ya está dada de baja');
      // Las citas futuras se cancelan y liberan su franja; si vuelve, tendrá que reservar de nuevo.
      const citas = await tx.cita.updateMany({ where: { cliente: { usuarioId: usuario.id }, estado: { in: ['PENDIENTE', 'CONFIRMADA'] } }, data: { estado: 'CANCELADA' } });
      await tx.reservaMultiple.updateMany({ where: { cliente: { usuarioId: usuario.id }, estado: { in: ['EN_ESPERA', 'HUECO_OFRECIDO'] } }, data: { estado: 'CANCELADA' } });
      const { googleId: _g, ...copia } = usuario;
      await dejarConstancia(tx, 'Usuario', copia, 'BAJA', usuario.id, cuerpo.motivo);
      const c = await obtenerConfig(tx);
      // El aviso va directo a la bandeja de salida: la cuenta ya no está activa.
      await tx.emailSaliente.create({
        data: {
          para: usuario.email,
          plantilla: 'BAJA_CUENTA',
          datos: { nombre: usuario.nombre, hasta: diaLargo(sumarDias(diaLocal(reloj.ahora(), c.zonaHoraria), DIAS_RECUPERACION)), dias: DIAS_RECUPERACION, citasCanceladas: citas.count, enlace: `${process.env.PUBLIC_WEB_URL ?? ''}/login` },
        },
      });
    });
    res.clearCookie(COOKIE_SESION, { path: '/' });
  },
});

definir({
  metodo: 'post',
  ruta: '/perfil/reactivar',
  etiqueta: 'Acceso',
  resumen: 'Recuperar mi cuenta',
  descripcion: `Deshace la autobaja si no han pasado ${DIAS_RECUPERACION} días. Las citas canceladas no vuelven.`,
  acceso: ['CLIENTE'],
  permiteEnBaja: true,
  cuerpo: z.object({}).strict(),
  respuesta: UsuarioSchema,
  errores: { 409: 'La cuenta no está en baja' },
  manejador: async ({ usuario }) => {
    const r = await prisma.usuario.updateMany({ where: { id: usuario.id, activo: false, bajaSolicitadaEn: { not: null }, desvinculadoEn: null }, data: { activo: true, bajaSolicitadaEn: null } });
    if (!r.count) throw conflicto('NO_EN_BAJA', 'Tu cuenta no está dada de baja');
    return aUsuario(await prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id }, include: { cliente: true, empleado: true } }));
  },
});

// ─── Configuración ───────────────────────────────────────────────────

const ConfigSchema = z
  .object({
    zonaHoraria: z.string(),
    aperturaMinutos: z.number().int().min(0).max(1439).openapi({ description: 'Minutos desde medianoche (480 = 08:00)' }),
    cierreMinutos: z.number().int().min(1).max(1440),
    diasLaborables: z.array(z.number().int().min(1).max(7)).min(1).max(7).openapi({ description: '1 = lunes … 7 = domingo' }),
    minutosFranja: z.union([z.literal(15), z.literal(20), z.literal(30), z.literal(60)]),
    recepcionesPorFranja: z.number().int().min(1).max(20),
    vehiculosPorMecanico: z.number().int().min(1).max(10),
    tarifaHoraCentimos: z.number().int().min(0).max(100_000),
    ivaPorcentaje: z.number().int().min(0).max(100),
    horasMinimasCancelar: z.number().int().min(0).max(168),
    jornadaMinutosDia: z.number().int().min(60).max(720),
  })
  .openapi('Config');

definir({
  metodo: 'get',
  ruta: '/config',
  etiqueta: 'Configuración',
  resumen: 'Configuración del taller',
  respuesta: ConfigSchema,
  manejador: async () => {
    const { id: _id, ...c } = await obtenerConfig(prisma);
    return c;
  },
});

definir({
  metodo: 'put',
  ruta: '/config',
  etiqueta: 'Configuración',
  resumen: 'Cambiar la configuración',
  descripcion: 'Cambio parcial: solo se modifican los campos enviados.',
  acceso: ['DUENO'],
  cuerpo: ConfigSchema.omit({ zonaHoraria: true }).partial().strict(),
  respuesta: ConfigSchema,
  errores: { 422: 'La apertura debe ser anterior al cierre' },
  manejador: async ({ usuario, cuerpo }) => {
    if (usuario.rol !== 'DUENO') throw prohibido();
    const actual = await obtenerConfig(prisma);
    const nueva = { ...actual, ...cuerpo };
    if (nueva.aperturaMinutos >= nueva.cierreMinutos) throw reglaNegocio('HORARIO_INVALIDO', 'La hora de apertura debe ser anterior a la de cierre');
    if (cuerpo.diasLaborables) nueva.diasLaborables = [...new Set(cuerpo.diasLaborables)].sort();
    const { id: _id, ...c } = await prisma.configTaller.update({ where: { id: 1 }, data: { ...cuerpo, diasLaborables: nueva.diasLaborables } });
    return c;
  },
});

// ─── Avisos (campana) ────────────────────────────────────────────────

const NotificacionSchema = z
  .object({ id: Id, tipo: z.string(), mensaje: z.string(), enlace: z.string().nullable(), leida: z.boolean(), creadaEn: Instante })
  .openapi('Notificacion');

definir({
  metodo: 'get',
  ruta: '/notificaciones',
  etiqueta: 'Avisos',
  resumen: 'Mis avisos',
  descripcion: 'Los 50 más recientes y el número de no leídos.',
  query: z.object({ soloNoLeidas: z.enum(['true', 'false']).optional() }),
  respuesta: lista(NotificacionSchema).extend({ noLeidas: z.number().int() }),
  manejador: async ({ usuario, query }) => {
    const [datos, noLeidas] = await Promise.all([
      prisma.notificacion.findMany({
        where: { usuarioId: usuario.id, ...(query.soloNoLeidas === 'true' ? { leida: false } : {}) },
        orderBy: { creadaEn: 'desc' },
        take: 50,
      }),
      prisma.notificacion.count({ where: { usuarioId: usuario.id, leida: false } }),
    ]);
    return { datos: datos.map(({ usuarioId: _u, ...n }) => n), noLeidas };
  },
});

definir({
  metodo: 'post',
  ruta: '/notificaciones/:id/leer',
  etiqueta: 'Avisos',
  resumen: 'Marcar un aviso como leído',
  params: ParamId,
  codigo: 204,
  errores: { 404: 'El aviso no existe o no es tuyo' },
  manejador: async ({ usuario, params }) => {
    const r = await prisma.notificacion.updateMany({ where: { id: params.id, usuarioId: usuario.id }, data: { leida: true } });
    if (!r.count) throw noEncontrado('El aviso');
  },
});

definir({
  metodo: 'post',
  ruta: '/notificaciones/leer-todas',
  etiqueta: 'Avisos',
  resumen: 'Marcar todos mis avisos como leídos',
  codigo: 204,
  manejador: async ({ usuario }) => {
    await prisma.notificacion.updateMany({ where: { usuarioId: usuario.id, leida: false }, data: { leida: true } });
  },
});
