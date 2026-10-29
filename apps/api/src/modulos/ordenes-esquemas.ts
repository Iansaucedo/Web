import type { Prisma } from '@prisma/client';
import { z } from '../openapi/zod';
import { numeroOrden } from '../emails/formato';
import { Id, Instante } from './esquemas';

export const EstadoOrden = z.enum(['EN_DIAGNOSTICO', 'ESPERANDO_AUTORIZACION', 'EN_REPARACION', 'ESPERANDO_PIEZAS', 'COMPLETADA', 'RECHAZADA', 'ENTREGADA']);

export const OrdenResumenSchema = z
  .object({
    id: Id,
    numero: z.number().int(),
    codigo: z.string().openapi({ example: 'OR-0042' }),
    estado: EstadoOrden,
    abiertaEn: Instante,
    completadaEn: Instante.nullable(),
    entregaEstimada: Instante.nullable(),
    kmEntrada: z.number().int(),
    kmSalida: z.number().int().nullable().openapi({ description: 'Los pone el mecánico al completar y el jefe los confirma al entregar' }),
    vehiculo: z.object({ id: Id, matricula: z.string(), marca: z.string(), modelo: z.string() }),
    cliente: z.object({ id: Id, nombre: z.string(), telefono: z.string() }),
    puesto: z.object({ id: Id, nombre: z.string() }).nullable(),
  })
  .openapi('OrdenResumen');

export const incluirResumen = { vehiculo: true, puesto: true, cita: { include: { cliente: { include: { usuario: true } } } } } satisfies Prisma.OrdenInclude;
type OrdenResumenBd = Prisma.OrdenGetPayload<{ include: typeof incluirResumen }>;

export const aOrdenResumen = (o: OrdenResumenBd) => ({
  id: o.id,
  numero: o.numero,
  codigo: numeroOrden(o.numero),
  estado: o.estado,
  abiertaEn: o.abiertaEn,
  completadaEn: o.completadaEn,
  entregaEstimada: o.entregaEstimada,
  kmEntrada: o.kmEntrada,
  kmSalida: o.kmSalida,
  vehiculo: { id: o.vehiculo.id, matricula: o.vehiculo.matricula, marca: o.vehiculo.marca, modelo: o.vehiculo.modelo },
  cliente: { id: o.cita.cliente.id, nombre: o.cita.cliente.razonSocial ?? o.cita.cliente.usuario.nombre, telefono: o.cita.cliente.telefono },
  puesto: o.puesto ? { id: o.puesto.id, nombre: o.puesto.nombre } : null,
});
