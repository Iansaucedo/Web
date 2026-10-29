import type { Prisma, TipoEvento } from '@prisma/client';
import type { Tx } from '../lib/transaccion';
import { reloj } from '../lib/reloj';

/** Línea de tiempo de la orden. Solo se inserta: nunca se edita ni se borra. */
export function registrarEvento(tx: Tx, ordenId: string, tipo: TipoEvento, actorId: string, payload: Record<string, unknown>, visibleCliente = true) {
  return tx.eventoOrden.create({ data: { ordenId, tipo, actorId, payload: payload as Prisma.InputJsonValue, visibleCliente, fecha: reloj.ahora() } });
}
