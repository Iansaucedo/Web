import { z } from '../openapi/zod';
import { definir } from '../lib/ruta';
import { prisma } from '../db';
import { diaLocal, diasEntre, inicioDia, sumarDias } from '../lib/fechas';
import { obtenerConfig } from '../servicios/config';
import { calcularFactura } from './factura';
import { Centimos, Dia } from './esquemas';

const EstadisticasSchema = z
  .object({
    facturacion: z.object({ base: Centimos, iva: Centimos, total: Centimos }),
    ordenes: z.object({
      abiertas: z.number().int().openapi({ description: 'Ahora mismo (no entregadas)' }),
      completadas: z.number().int(),
      rechazadas: z.number().int(),
      ticketMedioCentimos: Centimos,
      horasMediasReparacion: z.number().openapi({ description: 'Desde la recepción hasta completar' }),
    }),
    citas: z.object({ total: z.number().int(), canceladas: z.number().int(), noPresentado: z.number().int() }),
    trabajosFrecuentes: z.array(z.object({ descripcion: z.string(), veces: z.number().int() })),
    mecanicos: z.array(z.object({ nombre: z.string(), minutosRegistrados: z.number().int(), ordenes: z.number().int() })),
    porDia: z.array(z.object({ fecha: Dia, facturadoCentimos: Centimos, citas: z.number().int() })),
  })
  .openapi('Estadisticas');

definir({
  metodo: 'get',
  ruta: '/estadisticas',
  etiqueta: 'Estadísticas',
  resumen: 'Indicadores del taller en un periodo',
  descripcion: 'Facturación (por fecha de completado), órdenes, citas, trabajos más frecuentes y horas por mecánico. Máximo 366 días.',
  acceso: ['DUENO'],
  query: z
    .object({ desde: Dia, hasta: Dia })
    .refine((q) => q.desde <= q.hasta, { message: '`desde` debe ser anterior o igual a `hasta`', path: ['hasta'] })
    .refine((q) => diasEntre(q.desde, q.hasta).length <= 366, { message: 'Como máximo un año', path: ['hasta'] }),
  respuesta: EstadisticasSchema,
  manejador: async ({ query }) => {
    const c = await obtenerConfig(prisma);
    const rango = { gte: inicioDia(query.desde, c.zonaHoraria), lt: inicioDia(sumarDias(query.hasta, 1), c.zonaHoraria) };
    const [completadas, rechazadas, abiertas, citas, partidas, trabajos] = await Promise.all([
      prisma.orden.findMany({ where: { completadaEn: rango } }),
      prisma.orden.count({ where: { estado: { in: ['RECHAZADA'] }, abiertaEn: rango } }),
      prisma.orden.count({ where: { estado: { not: 'ENTREGADA' } } }),
      prisma.cita.findMany({ where: { inicio: rango }, select: { estado: true, inicio: true } }),
      prisma.partida.groupBy({ by: ['descripcion'], where: { estado: 'ACEPTADA', solicitud: { orden: { abiertaEn: rango } } }, _count: { _all: true }, orderBy: { _count: { descripcion: 'desc' } }, take: 5 }),
      prisma.registroTrabajo.findMany({ where: { fecha: rango }, include: { empleado: { include: { usuario: true } } } }),
    ]);

    const porDia = new Map(diasEntre(query.desde, query.hasta).map((d) => [d, { fecha: d, facturadoCentimos: 0, citas: 0 }]));
    const total = { base: 0, iva: 0, total: 0 };
    for (const o of completadas) {
      const f = await calcularFactura(o.id);
      total.base += f.base;
      total.iva += f.iva;
      total.total += f.total;
      const d = porDia.get(diaLocal(o.completadaEn!, c.zonaHoraria));
      if (d) d.facturadoCentimos += f.total;
    }
    for (const x of citas) {
      const d = porDia.get(diaLocal(x.inicio, c.zonaHoraria));
      if (d) d.citas++;
    }
    const mecanicos = new Map<string, { nombre: string; minutosRegistrados: number; ordenes: Set<string> }>();
    for (const t of trabajos) {
      const m = mecanicos.get(t.empleadoId) ?? { nombre: t.empleado.usuario.nombre, minutosRegistrados: 0, ordenes: new Set<string>() };
      m.minutosRegistrados += t.minutos;
      m.ordenes.add(t.ordenId);
      mecanicos.set(t.empleadoId, m);
    }
    const horas = completadas.map((o) => (o.completadaEn!.getTime() - o.abiertaEn.getTime()) / 3_600_000);
    return {
      facturacion: total,
      ordenes: {
        abiertas,
        completadas: completadas.length,
        rechazadas,
        ticketMedioCentimos: completadas.length ? Math.round(total.total / completadas.length) : 0,
        horasMediasReparacion: horas.length ? Math.round((horas.reduce((a, b) => a + b, 0) / horas.length) * 10) / 10 : 0,
      },
      citas: { total: citas.length, canceladas: citas.filter((x) => x.estado === 'CANCELADA').length, noPresentado: citas.filter((x) => x.estado === 'NO_PRESENTADO').length },
      trabajosFrecuentes: partidas.map((p) => ({ descripcion: p.descripcion, veces: p._count._all })),
      mecanicos: [...mecanicos.values()].sort((a, b) => b.minutosRegistrados - a.minutosRegistrados).map((m) => ({ nombre: m.nombre, minutosRegistrados: m.minutosRegistrados, ordenes: m.ordenes.size })),
      porDia: [...porDia.values()],
    };
  },
});
