import type { Prisma, Usuario } from '@prisma/client';
import { z } from '../openapi/zod';
import { definir } from '../lib/ruta';
import { prisma } from '../db';
import { transaccion } from '../lib/transaccion';
import { conflicto, noEncontrado } from '../lib/errores';
import { reloj } from '../lib/reloj';
import { empleadoDe, esGestion, GESTION, PERSONAL } from '../servicios/acceso';
import { avisar, avisarRoles } from '../servicios/avisos';
import { registrarEvento } from '../servicios/eventos';
import { datosVehiculo, partidaParaTrabajar } from '../servicios/ordenes';
import { numeroOrden } from '../emails/formato';
import { obtenerConfig } from '../servicios/config';
import { inicioDia, sumarDias } from '../lib/fechas';
import { moverStock } from '../servicios/stock';
import { dejarConstancia } from '../servicios/constancias';
import { Centimos, Dia, Id, Instante, ParamId, TextoCorto, lista } from './esquemas';

const Categoria = z.enum(['FRENOS', 'MOTOR', 'FILTROS', 'ACEITES', 'ENCENDIDO', 'ELECTRICIDAD', 'SUSPENSION', 'TRANSMISION', 'CARROCERIA', 'NEUMATICOS', 'OTRAS']);

// ─── Catálogo ────────────────────────────────────────────────────────

const PiezaSchema = z
  .object({ id: Id, referencia: z.string(), nombre: z.string(), categoria: Categoria, precioCentimos: Centimos, stock: z.number().int(), stockMinimo: z.number().int(), activa: z.boolean(), stockBajo: z.boolean() })
  .openapi('Pieza');
const aPieza = (p: Prisma.PiezaGetPayload<object>) => ({
  id: p.id,
  referencia: p.referencia,
  nombre: p.nombre,
  categoria: p.categoria,
  precioCentimos: p.precioCentimos,
  stock: p.stock,
  stockMinimo: p.stockMinimo,
  activa: p.activa,
  stockBajo: p.stock <= p.stockMinimo,
});
const Referencia = z
  .string()
  .transform((r) => r.trim().toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9][A-Z0-9._/-]{0,39}$/, 'Referencia no válida'));

definir({
  metodo: 'get',
  ruta: '/piezas',
  etiqueta: 'Piezas',
  resumen: 'Catálogo de piezas',
  descripcion: 'Busca por referencia o nombre y filtra por categoría. `stockBajo=true`: solo las que están en su stock mínimo o por debajo.',
  acceso: PERSONAL,
  query: z.object({ q: z.string().max(60).optional(), categoria: Categoria.optional(), stockBajo: z.enum(['true', 'false']).optional(), inactivas: z.enum(['true', 'false']).optional() }),
  respuesta: lista(PiezaSchema),
  manejador: async ({ query }) => {
    const where: Prisma.PiezaWhereInput = query.inactivas === 'true' ? {} : { activa: true };
    if (query.q) where.OR = [{ referencia: { contains: query.q.trim(), mode: 'insensitive' } }, { nombre: { contains: query.q.trim(), mode: 'insensitive' } }];
    if (query.categoria) where.categoria = query.categoria;
    if (query.stockBajo === 'true') where.stock = { lte: prisma.pieza.fields.stockMinimo };
    return { datos: (await prisma.pieza.findMany({ where, orderBy: { nombre: 'asc' }, take: 300 })).map(aPieza) };
  },
});

definir({
  metodo: 'post',
  ruta: '/piezas',
  etiqueta: 'Piezas',
  resumen: 'Dar de alta una pieza',
  acceso: GESTION,
  idempotente: true,
  cuerpo: z
    .object({ referencia: Referencia, nombre: TextoCorto, categoria: Categoria.default('OTRAS'), precioCentimos: z.number().int().min(0).max(10_000_000), stock: z.number().int().min(0).max(100_000), stockMinimo: z.number().int().min(0).max(10_000).default(2) })
    .strict(),
  respuesta: PiezaSchema,
  codigo: 201,
  errores: { 409: 'Ya existe esa referencia' },
  manejador: async ({ usuario, cuerpo }) => {
    if (await prisma.pieza.findUnique({ where: { referencia: cuerpo.referencia } })) throw conflicto('REFERENCIA_DUPLICADA', 'Ya existe una pieza con esa referencia');
    return aPieza(
      await transaccion(async (tx) => {
        const p = await tx.pieza.create({ data: { ...cuerpo, stock: 0 } });
        await moverStock(tx, p.id, { fijar: cuerpo.stock }, { tipo: 'ALTA', usuarioId: usuario.id });
        return tx.pieza.findUniqueOrThrow({ where: { id: p.id } });
      }),
    );
  },
});

definir({
  metodo: 'patch',
  ruta: '/piezas/:id',
  etiqueta: 'Piezas',
  resumen: 'Editar una pieza',
  descripcion: 'El cambio de precio no afecta a las piezas ya usadas (guardan el precio del momento).',
  acceso: GESTION,
  params: ParamId,
  cuerpo: z.object({ nombre: TextoCorto.optional(), categoria: Categoria.optional(), precioCentimos: z.number().int().min(0).max(10_000_000).optional(), stockMinimo: z.number().int().min(0).max(10_000).optional(), activa: z.boolean().optional() }).strict(),
  respuesta: PiezaSchema,
  errores: { 404: 'La pieza no existe' },
  manejador: async ({ params, cuerpo }) => aPieza(await prisma.pieza.update({ where: { id: params.id }, data: cuerpo })),
});

definir({
  metodo: 'post',
  ruta: '/piezas/:id/ajuste-stock',
  etiqueta: 'Piezas',
  resumen: 'Ajustar el stock (sumar o restar)',
  descripcion: 'Solo el jefe (y el dueño). Exige motivo y queda registrado en los movimientos de la pieza. El stock nunca queda negativo.',
  acceso: GESTION,
  params: ParamId,
  cuerpo: z.object({ delta: z.number().int().min(-100_000).max(100_000).refine((d) => d !== 0, 'El ajuste no puede ser 0'), motivo: TextoCorto }).strict(),
  respuesta: PiezaSchema,
  errores: { 404: 'La pieza no existe', 409: 'STOCK_INSUFICIENTE' },
  manejador: async ({ usuario, params, cuerpo }) => {
    await transaccion((tx) => moverStock(tx, params.id, { delta: cuerpo.delta }, { tipo: 'AJUSTE', usuarioId: usuario.id, motivo: cuerpo.motivo, mensajeSinStock: 'No hay tantas unidades para restar' }));
    return aPieza(await prisma.pieza.findUniqueOrThrow({ where: { id: params.id } }));
  },
});

definir({
  metodo: 'post',
  ruta: '/piezas/:id/cuadre',
  etiqueta: 'Piezas',
  resumen: 'Cuadrar el stock con el recuento real',
  descripcion: 'Tras un inventario: fija el stock al número contado. Solo el jefe (y el dueño), con motivo; la diferencia queda registrada.',
  acceso: GESTION,
  params: ParamId,
  cuerpo: z.object({ stockReal: z.number().int().min(0).max(100_000), motivo: TextoCorto }).strict(),
  respuesta: PiezaSchema,
  errores: { 404: 'La pieza no existe' },
  manejador: async ({ usuario, params, cuerpo }) => {
    await transaccion((tx) => moverStock(tx, params.id, { fijar: cuerpo.stockReal }, { tipo: 'CUADRE', usuarioId: usuario.id, motivo: cuerpo.motivo }));
    return aPieza(await prisma.pieza.findUniqueOrThrow({ where: { id: params.id } }));
  },
});

const MovimientoSchema = z
  .object({
    id: Id,
    tipo: z.enum(['ALTA', 'AJUSTE', 'CUADRE', 'USO', 'RECEPCION']),
    delta: z.number().int(),
    stockAntes: z.number().int(),
    stockDespues: z.number().int(),
    motivo: z.string().nullable(),
    usuario: z.string(),
    ordenCodigo: z.string().nullable(),
    fecha: Instante,
  })
  .openapi('MovimientoStock');

definir({
  metodo: 'get',
  ruta: '/piezas/:id/movimientos',
  etiqueta: 'Piezas',
  resumen: 'Historial de stock de una pieza',
  descripcion: 'Todos los cambios de stock, del más reciente al más antiguo: altas, ajustes, cuadres, usos en reparaciones y recepciones. La suma de `delta` es el stock actual.',
  acceso: GESTION,
  params: ParamId,
  respuesta: lista(MovimientoSchema),
  errores: { 404: 'La pieza no existe' },
  manejador: async ({ params }) => {
    if (!(await prisma.pieza.findUnique({ where: { id: params.id } }))) throw noEncontrado('La pieza');
    const m = await prisma.movimientoStock.findMany({ where: { piezaId: params.id }, orderBy: [{ fecha: 'desc' }, { id: 'desc' }], take: 500 });
    const [usuarios, ordenes] = await Promise.all([
      prisma.usuario.findMany({ where: { id: { in: [...new Set(m.map((x) => x.usuarioId))] } } }),
      prisma.orden.findMany({ where: { id: { in: m.flatMap((x) => (x.ordenId ? [x.ordenId] : [])) } } }),
    ]);
    const nombre = new Map(usuarios.map((u) => [u.id, u.nombre]));
    const codigo = new Map(ordenes.map((o) => [o.id, numeroOrden(o.numero)]));
    return { datos: m.map((x) => ({ id: x.id, tipo: x.tipo, delta: x.delta, stockAntes: x.stockAntes, stockDespues: x.stockDespues, motivo: x.motivo, usuario: nombre.get(x.usuarioId) ?? '—', ordenCodigo: x.ordenId ? codigo.get(x.ordenId) ?? null : null, fecha: x.fecha })) };
  },
});

definir({
  metodo: 'get',
  ruta: '/movimientos-stock',
  etiqueta: 'Piezas',
  resumen: 'Movimientos de stock de un día (todas las piezas)',
  descripcion: 'Para el panel «Movimientos de hoy» del catálogo.',
  acceso: GESTION,
  query: z.object({ fecha: Dia }),
  respuesta: lista(MovimientoSchema.extend({ piezaId: Id, pieza: z.string(), referencia: z.string() })),
  manejador: async ({ query }) => {
    const c = await obtenerConfig(prisma);
    const m = await prisma.movimientoStock.findMany({
      where: { fecha: { gte: inicioDia(query.fecha, c.zonaHoraria), lt: inicioDia(sumarDias(query.fecha, 1), c.zonaHoraria) } },
      include: { pieza: true },
      orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
      take: 200,
    });
    const nombres = new Map((await prisma.usuario.findMany({ where: { id: { in: [...new Set(m.map((x) => x.usuarioId))] } } })).map((u) => [u.id, u.nombre]));
    const ordenes = new Map((await prisma.orden.findMany({ where: { id: { in: m.flatMap((x) => (x.ordenId ? [x.ordenId] : [])) } } })).map((o) => [o.id, numeroOrden(o.numero)]));
    return {
      datos: m.map((x) => ({
        id: x.id, tipo: x.tipo, delta: x.delta, stockAntes: x.stockAntes, stockDespues: x.stockDespues, motivo: x.motivo,
        usuario: nombres.get(x.usuarioId) ?? '—', ordenCodigo: x.ordenId ? ordenes.get(x.ordenId) ?? null : null, fecha: x.fecha,
        piezaId: x.piezaId, pieza: x.pieza.nombre, referencia: x.pieza.referencia,
      })),
    };
  },
});

definir({
  metodo: 'delete',
  ruta: '/piezas/:id',
  etiqueta: 'Piezas',
  resumen: 'Eliminar una pieza del catálogo (con constancia)',
  descripcion: 'Siempre deja copia en las constancias. Si nunca se usó ni se pidió, se borra; si no, se da de baja (sale del catálogo pero su historial sigue).',
  acceso: GESTION,
  params: ParamId,
  cuerpo: z.object({ motivo: z.string().trim().max(300).optional() }).strict(),
  codigo: 204,
  errores: { 404: 'La pieza no existe' },
  manejador: async ({ usuario, params, cuerpo }) => {
    await transaccion(async (tx) => {
      const p = await tx.pieza.findUnique({ where: { id: params.id } });
      if (!p) throw noEncontrado('La pieza');
      const usada = (await tx.piezaUsada.count({ where: { piezaId: p.id } })) + (await tx.pedidoPieza.count({ where: { piezaId: p.id } }));
      await dejarConstancia(tx, 'Pieza', p, usada ? 'BAJA' : 'BORRADO', usuario.id, cuerpo.motivo);
      if (usada) await tx.pieza.update({ where: { id: p.id }, data: { activa: false } });
      else await tx.pieza.delete({ where: { id: p.id } });
    });
  },
});

// ─── Piezas en un trabajo ────────────────────────────────────────────

definir({
  metodo: 'post',
  ruta: '/partidas/:id/piezas-usadas',
  etiqueta: 'Trabajos',
  resumen: 'Usar piezas del almacén',
  descripcion: 'Descuenta stock de forma atómica (solo si hay suficientes) y guarda el precio del momento. Solo en trabajos aceptados por el cliente.',
  acceso: PERSONAL,
  idempotente: true,
  params: ParamId,
  cuerpo: z.object({ piezaId: Id, cantidad: z.number().int().min(1).max(100) }).strict(),
  respuesta: z.object({ id: Id, stockRestante: z.number().int() }),
  codigo: 201,
  errores: { 404: 'El trabajo o la pieza no existen', 409: 'STOCK_INSUFICIENTE, orden fuera de reparación o trabajo terminado', 422: 'TRABAJO_NO_ACEPTADO' },
  manejador: async ({ usuario, params, cuerpo }) => {
    const emp = await empleadoDe(usuario);
    return transaccion(async (tx) => {
      const { partida, orden } = await partidaParaTrabajar(tx, params.id, 'usar piezas');
      const pieza = await tx.pieza.findUnique({ where: { id: cuerpo.piezaId } });
      if (!pieza || !pieza.activa) throw noEncontrado('La pieza');
      // Con la fila bloqueada: si otro la cogió antes, aquí ya se ve el stock real.
      await moverStock(tx, pieza.id, { delta: -cuerpo.cantidad }, { tipo: 'USO', usuarioId: usuario.id, ordenId: orden.id, mensajeSinStock: `No hay ${cuerpo.cantidad} unidades de ${pieza.nombre} en el almacén. Pide la pieza` });
      const uso = await tx.piezaUsada.create({ data: { partidaId: partida.id, piezaId: pieza.id, cantidad: cuerpo.cantidad, precioUnitarioCentimos: pieza.precioCentimos, empleadoId: emp.id, fecha: reloj.ahora() } });
      await registrarEvento(tx, orden.id, 'PIEZA_USADA', usuario.id, { pieza: pieza.nombre, referencia: pieza.referencia, cantidad: cuerpo.cantidad, trabajo: partida.descripcion });
      const restante = (await tx.pieza.findUniqueOrThrow({ where: { id: pieza.id } })).stock;
      return { id: uso.id, stockRestante: restante };
    });
  },
});

definir({
  metodo: 'post',
  ruta: '/partidas/:id/piezas-quitadas',
  etiqueta: 'Trabajos',
  resumen: 'Registrar piezas retiradas del vehículo',
  descripcion: 'Trazabilidad: qué se quitó y si se desechó o se devolvió al cliente.',
  acceso: PERSONAL,
  idempotente: true,
  params: ParamId,
  cuerpo: z.object({ descripcion: TextoCorto, cantidad: z.number().int().min(1).max(100), destino: z.enum(['DESECHADA', 'DEVUELTA_CLIENTE']) }).strict(),
  respuesta: z.object({ id: Id }),
  codigo: 201,
  errores: { 404: 'El trabajo no existe', 409: 'Orden fuera de reparación', 422: 'TRABAJO_NO_ACEPTADO' },
  manejador: async ({ usuario, params, cuerpo }) => {
    const emp = await empleadoDe(usuario);
    return transaccion(async (tx) => {
      const { partida, orden } = await partidaParaTrabajar(tx, params.id, 'registrar piezas retiradas', { permitirTerminada: true });
      const q = await tx.piezaQuitada.create({ data: { partidaId: partida.id, ...cuerpo, empleadoId: emp.id, fecha: reloj.ahora() } });
      await registrarEvento(tx, orden.id, 'PIEZA_QUITADA', usuario.id, { ...cuerpo, trabajo: partida.descripcion });
      return { id: q.id };
    });
  },
});

definir({
  metodo: 'post',
  ruta: '/partidas/:id/terminar',
  etiqueta: 'Trabajos',
  resumen: 'Marcar un trabajo como terminado',
  acceso: PERSONAL,
  params: ParamId,
  cuerpo: z.object({}).strict(),
  respuesta: z.object({ id: Id, terminadaEn: Instante }),
  errores: { 404: 'El trabajo no existe', 409: 'Ya terminado u orden fuera de reparación', 422: 'TRABAJO_NO_ACEPTADO' },
  manejador: async ({ usuario, params }) =>
    transaccion(async (tx) => {
      const { partida, orden } = await partidaParaTrabajar(tx, params.id, 'terminar trabajos');
      const ahora = reloj.ahora();
      await tx.partida.update({ where: { id: partida.id }, data: { terminadaEn: ahora } });
      await registrarEvento(tx, orden.id, 'TRABAJO_REGISTRADO', usuario.id, { trabajo: partida.descripcion, terminado: true });
      return { id: partida.id, terminadaEn: ahora };
    }),
});

// ─── Pedidos ─────────────────────────────────────────────────────────

const EstadoPedido = z.enum(['PENDIENTE', 'APROBADO', 'PEDIDO', 'RECIBIDO', 'RECHAZADO']);
const PedidoSchema = z
  .object({
    id: Id,
    estado: EstadoPedido,
    pieza: z.object({ id: Id, referencia: z.string(), nombre: z.string() }).nullable(),
    descripcionLibre: z.string().nullable(),
    cantidad: z.number().int(),
    orden: z.object({ id: Id, codigo: z.string(), matricula: z.string() }),
    trabajo: z.string(),
    mecanico: z.string(),
    creadoEn: Instante,
    actualizadoEn: Instante,
  })
  .openapi('PedidoPieza');

const incluirPedido = {
  pieza: true,
  creadoPor: { include: { usuario: true } },
  partida: { include: { solicitud: { include: { orden: { include: { vehiculo: true, cita: { include: { cliente: true } } } } } } } },
} satisfies Prisma.PedidoPiezaInclude;
type PedidoBd = Prisma.PedidoPiezaGetPayload<{ include: typeof incluirPedido }>;
const aPedido = (p: PedidoBd) => ({
  id: p.id,
  estado: p.estado,
  pieza: p.pieza ? { id: p.pieza.id, referencia: p.pieza.referencia, nombre: p.pieza.nombre } : null,
  descripcionLibre: p.descripcionLibre,
  cantidad: p.cantidad,
  orden: { id: p.partida.solicitud.orden.id, codigo: numeroOrden(p.partida.solicitud.orden.numero), matricula: p.partida.solicitud.orden.vehiculo.matricula },
  trabajo: p.partida.descripcion,
  mecanico: p.creadoPor.usuario.nombre,
  creadoEn: p.creadoEn,
  actualizadoEn: p.actualizadoEn,
});
const nombrePieza = (p: PedidoBd) => (p.pieza ? `${p.pieza.nombre} (${p.pieza.referencia})` : p.descripcionLibre ?? 'Pieza');

definir({
  metodo: 'post',
  ruta: '/partidas/:id/pedidos',
  etiqueta: 'Trabajos',
  resumen: 'Pedir una pieza que no hay en stock',
  descripcion: 'Del catálogo (`piezaId`) o descrita (`descripcionLibre`). El jefe la aprueba.',
  acceso: PERSONAL,
  idempotente: true,
  params: ParamId,
  cuerpo: z
    .object({ piezaId: Id.optional(), descripcionLibre: z.string().trim().min(3).max(200).optional(), cantidad: z.number().int().min(1).max(100) })
    .strict()
    .refine((p) => Boolean(p.piezaId) !== Boolean(p.descripcionLibre), { message: 'Indica una pieza del catálogo o una descripción (solo una de las dos)', path: ['piezaId'] }),
  respuesta: PedidoSchema,
  codigo: 201,
  errores: { 404: 'El trabajo o la pieza no existen', 409: 'Orden fuera de reparación', 422: 'TRABAJO_NO_ACEPTADO' },
  manejador: async ({ usuario, params, cuerpo }) => {
    const emp = await empleadoDe(usuario);
    const id = await transaccion(async (tx) => {
      const { partida, orden } = await partidaParaTrabajar(tx, params.id, 'pedir piezas');
      if (cuerpo.piezaId && !(await tx.pieza.findUnique({ where: { id: cuerpo.piezaId } }))) throw noEncontrado('La pieza');
      const p = await tx.pedidoPieza.create({ data: { partidaId: partida.id, piezaId: cuerpo.piezaId, descripcionLibre: cuerpo.descripcionLibre, cantidad: cuerpo.cantidad, creadoPorId: emp.id }, include: incluirPedido });
      await registrarEvento(tx, orden.id, 'PEDIDO_ACTUALIZADO', usuario.id, { pedidoId: p.id, estado: 'PENDIENTE', pieza: nombrePieza(p) }, false);
      await avisarRoles(tx, ['JEFE'], {
        tipo: 'PEDIDO_PENDIENTE',
        mensaje: `${usuario.nombre} pide ${cuerpo.cantidad} × ${nombrePieza(p)} (${numeroOrden(orden.numero)})`,
        enlace: '/jefe/pedidos',
        datos: { ...datosVehiculo(orden), mecanico: usuario.nombre, pieza: nombrePieza(p), cantidad: cuerpo.cantidad, partida: partida.descripcion },
      });
      return p.id;
    });
    return aPedido(await prisma.pedidoPieza.findUniqueOrThrow({ where: { id }, include: incluirPedido }));
  },
});

definir({
  metodo: 'get',
  ruta: '/pedidos',
  etiqueta: 'Pedidos',
  resumen: 'Pedidos de piezas',
  descripcion: 'El jefe ve todos; el mecánico, los suyos.',
  acceso: PERSONAL,
  query: z.object({ estado: EstadoPedido.optional() }),
  respuesta: lista(PedidoSchema),
  manejador: async ({ usuario, query }) => {
    const where: Prisma.PedidoPiezaWhereInput = query.estado ? { estado: query.estado } : {};
    if (!esGestion(usuario)) where.creadoPorId = (await empleadoDe(usuario)).id;
    return { datos: (await prisma.pedidoPieza.findMany({ where, include: incluirPedido, orderBy: { creadoEn: 'desc' }, take: 300 })).map(aPedido) };
  },
});

/** Cambia el estado de un pedido solo si está en uno de los estados de origen (sin carreras). */
async function cambiarPedido(u: Usuario, id: string, de: ('PENDIENTE' | 'APROBADO' | 'PEDIDO')[], a: 'APROBADO' | 'PEDIDO' | 'RECIBIDO' | 'RECHAZADO', motivo?: string) {
  const emp = await empleadoDe(u);
  return transaccion(async (tx) => {
    const r = await tx.pedidoPieza.updateMany({ where: { id, estado: { in: de } }, data: { estado: a, ...(a === 'APROBADO' || a === 'RECHAZADO' ? { aprobadoPorId: emp.id } : {}) } });
    if (!r.count) {
      if (!(await tx.pedidoPieza.findUnique({ where: { id } }))) throw noEncontrado('El pedido');
      throw conflicto('PEDIDO_ESTADO', `El pedido no se puede pasar a ${a.toLowerCase()} desde su estado actual`);
    }
    const p = await tx.pedidoPieza.findUniqueOrThrow({ where: { id }, include: incluirPedido });
    const orden = p.partida.solicitud.orden;
    if (a === 'RECIBIDO' && p.piezaId) await moverStock(tx, p.piezaId, { delta: p.cantidad }, { tipo: 'RECEPCION', usuarioId: u.id, ordenId: orden.id });
    await registrarEvento(tx, orden.id, 'PEDIDO_ACTUALIZADO', u.id, { pedidoId: p.id, estado: a, pieza: nombrePieza(p), motivo }, false);
    const tipo = ({ APROBADO: 'PEDIDO_APROBADO', RECHAZADO: 'PEDIDO_RECHAZADO', RECIBIDO: 'PIEZA_RECIBIDA' } as const)[a as 'APROBADO'];
    if (tipo) {
      await avisar(tx, p.creadoPor.usuarioId, {
        tipo,
        mensaje: `${nombrePieza(p)}: pedido ${a.toLowerCase()} (${numeroOrden(orden.numero)})`,
        enlace: `/mecanico/ordenes/${orden.id}`,
        datos: { ...datosVehiculo(orden), pieza: nombrePieza(p), cantidad: p.cantidad, motivo: motivo ?? null },
      });
    }
    return aPedido(p);
  });
}

const accionPedido = (ruta: string, resumen: string, de: ('PENDIENTE' | 'APROBADO' | 'PEDIDO')[], a: 'APROBADO' | 'PEDIDO' | 'RECIBIDO', descripcion: string) =>
  definir({
    metodo: 'post',
    ruta: `/pedidos/:id/${ruta}`,
    etiqueta: 'Pedidos',
    resumen,
    descripcion,
    acceso: GESTION,
    params: ParamId,
    cuerpo: z.object({}).strict(),
    respuesta: PedidoSchema,
    errores: { 404: 'El pedido no existe', 409: 'PEDIDO_ESTADO: no está en el estado de partida' },
    manejador: async ({ usuario, params }) => cambiarPedido(usuario, params.id, de, a),
  });

accionPedido('aprobar', 'Aprobar un pedido', ['PENDIENTE'], 'APROBADO', 'PENDIENTE → APROBADO. Avisa al mecánico.');
accionPedido('pedido', 'Marcar como pedido al proveedor', ['APROBADO'], 'PEDIDO', 'APROBADO → PEDIDO.');
accionPedido('recibir', 'Recibir la pieza', ['APROBADO', 'PEDIDO'], 'RECIBIDO', 'Suma la cantidad al stock (si es del catálogo) y avisa al mecánico. Recibir dos veces da 409: el stock no se duplica.');

definir({
  metodo: 'post',
  ruta: '/pedidos/:id/rechazar',
  etiqueta: 'Pedidos',
  resumen: 'Rechazar un pedido',
  acceso: GESTION,
  params: ParamId,
  cuerpo: z.object({ motivo: TextoCorto }).strict(),
  respuesta: PedidoSchema,
  errores: { 404: 'El pedido no existe', 409: 'Ya no está pendiente' },
  manejador: async ({ usuario, params, cuerpo }) => cambiarPedido(usuario, params.id, ['PENDIENTE'], 'RECHAZADO', cuerpo.motivo),
});
