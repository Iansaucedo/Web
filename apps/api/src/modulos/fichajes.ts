import type { Fichaje, TipoFichaje, Usuario } from '@prisma/client';
import { z } from '../openapi/zod';
import { definir } from '../lib/ruta';
import { prisma } from '../db';
import { bloquear, transaccion, type Tx } from '../lib/transaccion';
import { conflicto, ErrorApp, noEncontrado, prohibido, reglaNegocio } from '../lib/errores';
import { reloj } from '../lib/reloj';
import { diaLocal, diasEntre, fechaDb, diaDeFechaDb, horaLocal, inicioDia, instanteLocal, sumarDias } from '../lib/fechas';
import { fichajesPermitidos, resumirJornada, secuenciaValida } from '../domain/jornada';
import { empleadoDe, esGestion, GESTION, PERSONAL } from '../servicios/acceso';
import { obtenerConfig } from '../servicios/config';
import { avisar, avisarRoles } from '../servicios/avisos';
import { diaLargo, FICHAJE_TEXTO } from '../emails/formato';
import { Dia, Id, Instante, ParamId, TextoCorto, lista } from './esquemas';

const TipoFichajeSchema = z.enum(['ENTRADA', 'INICIO_PAUSA', 'FIN_PAUSA', 'SALIDA']);
const Hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Usa el formato HH:mm').openapi({ example: '16:05' });

const FichajeSchema = z
  .object({ id: Id, tipo: TipoFichajeSchema, momento: Instante, hora: z.string(), origen: z.string(), corregido: z.boolean(), motivo: z.string().nullable() })
  .openapi('Fichaje');
const ResumenSchema = z.object({ minutosTrabajados: z.number().int(), minutosPausa: z.number().int(), completa: z.boolean() });

/** Fichajes en vigor (no sustituidos por una corrección) de un empleado en un día local. */
async function vigentesDelDia(tx: Tx, empleadoId: string, dia: string, zona: string) {
  return tx.fichaje.findMany({
    where: { empleadoId, sustituidoPor: null, momento: { gte: inicioDia(dia, zona), lt: inicioDia(sumarDias(dia, 1), zona) } },
    orderBy: [{ momento: 'asc' }, { creadoEn: 'asc' }],
  });
}

const aFichaje = (f: Fichaje, zona: string) => ({ id: f.id, tipo: f.tipo, momento: f.momento, hora: horaLocal(f.momento, zona), origen: f.origen, corregido: Boolean(f.sustituyeAId) || f.origen === 'corrección', motivo: f.motivo });

definir({
  metodo: 'get',
  ruta: '/fichajes/hoy',
  etiqueta: 'Fichaje',
  resumen: 'Mi jornada de hoy',
  descripcion: 'Fichajes en vigor, qué se puede fichar ahora y el tiempo trabajado (hasta ahora si sigue abierta).',
  acceso: PERSONAL,
  respuesta: z.object({ fecha: Dia, fichajes: z.array(FichajeSchema), permitidos: z.array(TipoFichajeSchema), resumen: ResumenSchema, jornadaMinutos: z.number().int() }),
  manejador: async ({ usuario }) => {
    const emp = await empleadoDe(usuario);
    const c = await obtenerConfig(prisma);
    const dia = diaLocal(reloj.ahora(), c.zonaHoraria);
    const f = await vigentesDelDia(prisma, emp.id, dia, c.zonaHoraria);
    return { fecha: dia, fichajes: f.map((x) => aFichaje(x, c.zonaHoraria)), permitidos: fichajesPermitidos(f.at(-1)?.tipo ?? null), resumen: resumirJornada(f, reloj.ahora()), jornadaMinutos: c.jornadaMinutosDia };
  },
});

definir({
  metodo: 'post',
  ruta: '/fichajes',
  etiqueta: 'Fichaje',
  resumen: 'Fichar',
  descripcion: 'Registra el fichaje con la hora del servidor (no la del dispositivo). El orden es ENTRADA → (INICIO_PAUSA → FIN_PAUSA)* → SALIDA. Un doble toque no crea dos fichajes.',
  acceso: PERSONAL,
  cuerpo: z.object({ tipo: TipoFichajeSchema, origen: z.enum(['web', 'tablet del taller']).default('web') }).strict(),
  respuesta: FichajeSchema,
  codigo: 201,
  errores: { 409: 'FICHAJE_FUERA_DE_ORDEN (en `detalles.permitidos`, lo que sí se puede fichar)' },
  manejador: async ({ usuario, cuerpo }) => {
    const emp = await empleadoDe(usuario);
    const c = await obtenerConfig(prisma);
    return transaccion(async (tx) => {
      await bloquear(tx, `fichaje:${emp.id}`);
      const ahora = reloj.ahora();
      const f = await vigentesDelDia(tx, emp.id, diaLocal(ahora, c.zonaHoraria), c.zonaHoraria);
      const permitidos = fichajesPermitidos(f.at(-1)?.tipo ?? null);
      if (!permitidos.includes(cuerpo.tipo)) {
        throw new ErrorApp(409, 'FICHAJE_FUERA_DE_ORDEN', `Ahora no puedes fichar «${FICHAJE_TEXTO[cuerpo.tipo]}»`, { permitidos });
      }
      const nuevo = await tx.fichaje.create({ data: { empleadoId: emp.id, tipo: cuerpo.tipo, momento: ahora, origen: cuerpo.origen } });
      return aFichaje(nuevo, c.zonaHoraria);
    });
  },
});

// ─── Jornadas ────────────────────────────────────────────────────────

const JornadaSchema = z
  .object({ empleadoId: Id, nombre: z.string(), fecha: Dia, entrada: z.string().nullable(), salida: z.string().nullable(), minutosTrabajados: z.number().int(), minutosPausa: z.number().int(), completa: z.boolean(), corregida: z.boolean(), fichajes: z.array(FichajeSchema) })
  .openapi('Jornada');

const RangoJornadas = z
  .object({ desde: Dia, hasta: Dia, empleadoId: Id.optional() })
  .refine((q) => q.desde <= q.hasta, { message: '`desde` debe ser anterior o igual a `hasta`', path: ['hasta'] })
  .refine((q) => diasEntre(q.desde, q.hasta).length <= 62, { message: 'Como máximo 62 días', path: ['hasta'] });

async function jornadas(u: Usuario, q: z.infer<typeof RangoJornadas>) {
  let empleadoId = q.empleadoId;
  if (!esGestion(u)) {
    const propio = (await empleadoDe(u)).id;
    if (empleadoId && empleadoId !== propio) throw prohibido('Solo puedes ver tu propia jornada');
    empleadoId = propio;
  }
  const c = await obtenerConfig(prisma);
  const fichajes = await prisma.fichaje.findMany({
    where: { ...(empleadoId ? { empleadoId } : {}), sustituidoPor: null, momento: { gte: inicioDia(q.desde, c.zonaHoraria), lt: inicioDia(sumarDias(q.hasta, 1), c.zonaHoraria) } },
    include: { empleado: { include: { usuario: true } } },
    orderBy: [{ momento: 'asc' }, { creadoEn: 'asc' }],
  });
  const grupos = new Map<string, typeof fichajes>();
  for (const f of fichajes) {
    const k = `${f.empleado.usuario.nombre}\u0000${f.empleadoId}\u0000${diaLocal(f.momento, c.zonaHoraria)}`;
    grupos.set(k, [...(grupos.get(k) ?? []), f]);
  }
  const ahora = reloj.ahora();
  const hoy = diaLocal(ahora, c.zonaHoraria);
  return [...grupos.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, fs]) => {
      const [nombre, emp, fecha] = k.split('\u0000');
      // Un día pasado sin salida no cuenta horas hasta «ahora»: se corta en el último fichaje.
      const r = resumirJornada(fs, fecha === hoy ? ahora : fs.at(-1)!.momento);
      return {
        empleadoId: emp,
        nombre,
        fecha,
        entrada: fs.find((f) => f.tipo === 'ENTRADA') ? horaLocal(fs.find((f) => f.tipo === 'ENTRADA')!.momento, c.zonaHoraria) : null,
        salida: fs.findLast((f) => f.tipo === 'SALIDA') ? horaLocal(fs.findLast((f) => f.tipo === 'SALIDA')!.momento, c.zonaHoraria) : null,
        ...r,
        corregida: fs.some((f) => f.sustituyeAId || f.origen === 'corrección'),
        fichajes: fs.map((f) => aFichaje(f, c.zonaHoraria)),
      };
    });
}

definir({
  metodo: 'get',
  ruta: '/jornadas',
  etiqueta: 'Fichaje',
  resumen: 'Jornadas por empleado y día',
  descripcion: 'El jefe ve las de todos (o de `empleadoId`); un mecánico, solo la suya. Máximo 62 días.',
  acceso: PERSONAL,
  query: RangoJornadas,
  respuesta: lista(JornadaSchema),
  errores: { 403: 'Un mecánico pidiendo la jornada de otro' },
  manejador: async ({ usuario, query }) => ({ datos: await jornadas(usuario, query) }),
});

/** Celda CSV: entre comillas y sin permitir que Excel la interprete como fórmula. */
const celda = (v: string) => `"${(/^[=+\-@\t\r]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`;

definir({
  metodo: 'get',
  ruta: '/jornadas.csv',
  etiqueta: 'Fichaje',
  resumen: 'Exportar jornadas a CSV (Excel)',
  descripcion: 'Separador `;`, decimales con coma y BOM UTF-8 para que Excel en español lo abra bien. Las celdas que empiezan por = + - @ se neutralizan.',
  acceso: PERSONAL,
  query: RangoJornadas,
  produce: 'text/csv',
  errores: { 403: 'Un mecánico pidiendo la jornada de otro' },
  manejador: async ({ usuario, query, res }) => {
    const filas = await jornadas(usuario, query);
    const lineas = [
      'Empleado;Día;Entrada;Salida;Pausas (min);Trabajado (h);Completa;Corregida',
      ...filas.map((j) =>
        [celda(j.nombre), j.fecha, j.entrada ?? '', j.salida ?? '', String(j.minutosPausa), (j.minutosTrabajados / 60).toFixed(2).replace('.', ','), j.completa ? 'Sí' : 'No', j.corregida ? 'Sí' : 'No'].join(';'),
      ),
    ];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="jornadas-${query.desde}-${query.hasta}.csv"`);
    res.send(`﻿${lineas.join('\r\n')}\r\n`);
  },
});

// ─── Correcciones ────────────────────────────────────────────────────

const EstadoCorreccion = z.enum(['PENDIENTE', 'ACEPTADA', 'RECHAZADA']);
const CorreccionSchema = z
  .object({ id: Id, empleadoId: Id, empleado: z.string(), fecha: Dia, tipo: TipoFichajeSchema, hora: z.string(), motivo: z.string(), estado: EstadoCorreccion, creadaEn: Instante })
  .openapi('SolicitudCorreccion');

async function aCorreccion(s: Awaited<ReturnType<typeof prisma.solicitudCorreccionFichaje.findUniqueOrThrow>>, zona: string) {
  const e = await prisma.empleado.findUniqueOrThrow({ where: { id: s.empleadoId }, include: { usuario: true } });
  return { id: s.id, empleadoId: s.empleadoId, empleado: e.usuario.nombre, fecha: diaDeFechaDb(s.fecha), tipo: s.tipo, hora: horaLocal(s.horaPedida, zona), motivo: s.motivo, estado: s.estado, creadaEn: s.creadaEn };
}

/**
 * Aplica un cambio a los fichajes de un día dentro de la transacción y comprueba que el día resultante
 * siga siendo posible. `sustituye`: fichaje que se corrige (si no, se añade uno nuevo).
 */
async function aplicarCorreccion(tx: Tx, empleadoId: string, dia: string, tipo: TipoFichaje, momento: Date, motivo: string, corrector: string, sustituye?: Fichaje) {
  const c = await obtenerConfig(tx);
  await bloquear(tx, `fichaje:${empleadoId}`);
  const vigentes = await vigentesDelDia(tx, empleadoId, dia, c.zonaHoraria);
  const resto = vigentes.filter((f) => f.id !== sustituye?.id);
  const resultado = [...resto.map((f) => ({ tipo: f.tipo, momento: f.momento })), { tipo, momento }].sort((a, b) => a.momento.getTime() - b.momento.getTime());
  if (!secuenciaValida(resultado.map((f) => f.tipo))) throw reglaNegocio('SECUENCIA_INVALIDA', 'Con ese cambio la jornada quedaría en un orden imposible (p. ej. salida antes de la entrada)');
  if (momento > reloj.ahora()) throw reglaNegocio('FECHA_FUTURA', 'No se puede fichar en el futuro');
  return tx.fichaje.create({ data: { empleadoId, tipo, momento, origen: 'corrección', sustituyeAId: sustituye?.id, corregidoPorId: corrector, motivo } });
}

definir({
  metodo: 'post',
  ruta: '/correcciones',
  etiqueta: 'Fichaje',
  resumen: 'Pedir que se corrija un fichaje',
  descripcion: 'Para un fichaje olvidado o mal hecho de hoy o de días anteriores. Avisa a los jefes.',
  acceso: PERSONAL,
  idempotente: true,
  cuerpo: z.object({ fecha: Dia, tipo: TipoFichajeSchema, hora: Hora, motivo: TextoCorto }).strict(),
  respuesta: CorreccionSchema,
  codigo: 201,
  errores: { 422: 'FECHA_FUTURA' },
  manejador: async ({ usuario, cuerpo }) => {
    const emp = await empleadoDe(usuario);
    const c = await obtenerConfig(prisma);
    const [hh, mm] = cuerpo.hora.split(':').map(Number);
    const momento = instanteLocal(cuerpo.fecha, hh * 60 + mm, c.zonaHoraria);
    if (cuerpo.fecha > diaLocal(reloj.ahora(), c.zonaHoraria) || momento > reloj.ahora()) throw reglaNegocio('FECHA_FUTURA', 'Solo se corrigen fichajes de hoy o de días anteriores');
    const s = await transaccion(async (tx) => {
      const s = await tx.solicitudCorreccionFichaje.create({ data: { empleadoId: emp.id, fecha: fechaDb(cuerpo.fecha), tipo: cuerpo.tipo, horaPedida: momento, motivo: cuerpo.motivo } });
      await avisarRoles(tx, ['JEFE'], {
        tipo: 'CORRECCION_SOLICITADA',
        mensaje: `${usuario.nombre} pide corregir «${FICHAJE_TEXTO[cuerpo.tipo]}» del ${diaLargo(cuerpo.fecha)}`,
        enlace: '/jefe/jornadas',
        datos: { empleado: usuario.nombre, fecha: diaLargo(cuerpo.fecha), tipo: FICHAJE_TEXTO[cuerpo.tipo], hora: cuerpo.hora, motivo: cuerpo.motivo },
      });
      return s;
    });
    return aCorreccion(s, c.zonaHoraria);
  },
});

definir({
  metodo: 'get',
  ruta: '/correcciones',
  etiqueta: 'Fichaje',
  resumen: 'Solicitudes de corrección',
  descripcion: 'El jefe ve todas; cada empleado, las suyas.',
  acceso: PERSONAL,
  query: z.object({ estado: EstadoCorreccion.optional() }),
  respuesta: lista(CorreccionSchema),
  manejador: async ({ usuario, query }) => {
    const c = await obtenerConfig(prisma);
    const where = { ...(query.estado ? { estado: query.estado } : {}), ...(esGestion(usuario) ? {} : { empleadoId: (await empleadoDe(usuario)).id }) };
    const s = await prisma.solicitudCorreccionFichaje.findMany({ where, orderBy: { creadaEn: 'desc' }, take: 200 });
    return { datos: await Promise.all(s.map((x) => aCorreccion(x, c.zonaHoraria))) };
  },
});

/** Nadie se corrige a sí mismo, salvo el dueño (no tiene a quién pedírselo). */
function noAutocorreccion(u: Usuario, empleadoUsuarioId: string) {
  if (u.rol !== 'DUENO' && u.id === empleadoUsuarioId) throw prohibido('Otra persona debe revisar tus propios fichajes');
}

async function resolver(u: Usuario, id: string, aceptar: boolean) {
  const corrector = await empleadoDe(u);
  const c = await obtenerConfig(prisma);
  const s = await prisma.solicitudCorreccionFichaje.findUnique({ where: { id } });
  if (!s) throw noEncontrado('La solicitud');
  const emp = await prisma.empleado.findUniqueOrThrow({ where: { id: s.empleadoId } });
  noAutocorreccion(u, emp.usuarioId);
  await transaccion(async (tx) => {
    await bloquear(tx, `correccion:${s.id}`);
    const actual = await tx.solicitudCorreccionFichaje.findUniqueOrThrow({ where: { id: s.id } });
    if (actual.estado !== 'PENDIENTE') throw conflicto('YA_RESUELTA', 'Esta solicitud ya está resuelta');
    const dia = diaDeFechaDb(s.fecha);
    if (aceptar) {
      const vigentes = await vigentesDelDia(tx, s.empleadoId, dia, c.zonaHoraria);
      // Si ese tipo ya existe ese día y es único (entrada o salida), se corrige; si no, se añade.
      const mismos = vigentes.filter((f) => f.tipo === s.tipo);
      const sustituye = mismos.length === 1 && (s.tipo === 'ENTRADA' || s.tipo === 'SALIDA') ? mismos[0] : undefined;
      await aplicarCorreccion(tx, s.empleadoId, dia, s.tipo, s.horaPedida, s.motivo, corrector.id, sustituye);
    }
    await tx.solicitudCorreccionFichaje.update({ where: { id: s.id }, data: { estado: aceptar ? 'ACEPTADA' : 'RECHAZADA', resueltaPor: u.id } });
    await avisar(tx, emp.usuarioId, {
      tipo: 'CORRECCION_RESUELTA',
      mensaje: `Tu corrección del ${diaLargo(dia)} se ha ${aceptar ? 'aceptado' : 'rechazado'}`,
      enlace: '/mecanico/jornada',
      datos: { aceptada: aceptar, fecha: diaLargo(dia), tipo: FICHAJE_TEXTO[s.tipo], hora: horaLocal(s.horaPedida, c.zonaHoraria) },
    });
  });
  return aCorreccion(await prisma.solicitudCorreccionFichaje.findUniqueOrThrow({ where: { id } }), c.zonaHoraria);
}

for (const [ruta, aceptar] of [['aceptar', true], ['rechazar', false]] as const) {
  definir({
    metodo: 'post',
    ruta: `/correcciones/:id/${ruta}`,
    etiqueta: 'Fichaje',
    resumen: aceptar ? 'Aceptar una corrección' : 'Rechazar una corrección',
    descripcion: aceptar
      ? 'Crea un fichaje de corrección (el original no se borra: queda sustituido). Se rechaza si la jornada quedaría en un orden imposible.'
      : 'La jornada queda como estaba.',
    acceso: GESTION,
    params: ParamId,
    cuerpo: z.object({}).strict(),
    respuesta: CorreccionSchema,
    errores: { 403: 'Es tu propia solicitud', 404: 'La solicitud no existe', 409: 'Ya resuelta', ...(aceptar ? { 422: 'SECUENCIA_INVALIDA' } : {}) },
    manejador: async ({ usuario, params }) => resolver(usuario, params.id, aceptar),
  });
}

definir({
  metodo: 'post',
  ruta: '/fichajes/:id/corregir',
  etiqueta: 'Fichaje',
  resumen: 'Corregir la hora de un fichaje',
  descripcion: 'El jefe corrige directamente. Se guarda quién, cuándo y por qué; el fichaje original queda en el historial.',
  acceso: GESTION,
  params: ParamId,
  cuerpo: z.object({ hora: Hora, motivo: TextoCorto }).strict(),
  respuesta: FichajeSchema,
  codigo: 201,
  errores: { 403: 'Es tu propio fichaje', 404: 'El fichaje no existe', 409: 'Ya estaba corregido', 422: 'SECUENCIA_INVALIDA o FECHA_FUTURA' },
  manejador: async ({ usuario, params, cuerpo }) => {
    const corrector = await empleadoDe(usuario);
    const c = await obtenerConfig(prisma);
    const f = await prisma.fichaje.findUnique({ where: { id: params.id }, include: { empleado: true, sustituidoPor: true } });
    if (!f) throw noEncontrado('El fichaje');
    noAutocorreccion(usuario, f.empleado.usuarioId);
    if (f.sustituidoPor) throw conflicto('YA_CORREGIDO', 'Ese fichaje ya se corrigió. Corrige el vigente');
    const dia = diaLocal(f.momento, c.zonaHoraria);
    const [hh, mm] = cuerpo.hora.split(':').map(Number);
    const momento = instanteLocal(dia, hh * 60 + mm, c.zonaHoraria);
    const nuevo = await transaccion(async (tx) => {
      const n = await aplicarCorreccion(tx, f.empleadoId, dia, f.tipo, momento, cuerpo.motivo, corrector.id, f);
      await avisar(tx, f.empleado.usuarioId, {
        tipo: 'FICHAJE_CORREGIDO',
        mensaje: `${usuario.nombre} ha corregido tu fichaje del ${diaLargo(dia)}`,
        enlace: '/mecanico/jornada',
        datos: { fecha: diaLargo(dia), tipo: FICHAJE_TEXTO[f.tipo], antes: horaLocal(f.momento, c.zonaHoraria), ahora: cuerpo.hora, motivo: cuerpo.motivo, jefe: usuario.nombre },
      });
      return n;
    });
    return aFichaje(nuevo, c.zonaHoraria);
  },
});
