import type { ModoEliminacion, Prisma } from '@prisma/client';
import type { Tx } from '../lib/transaccion';
import { reloj } from '../lib/reloj';

/**
 * Deja constancia de una eliminación con una copia completa del registro.
 * Se llama dentro de la misma transacción que el borrado (o la baja): o quedan ambos, o ninguno.
 */
export function dejarConstancia(tx: Tx, entidad: string, registro: { id: string } & Record<string, unknown>, modo: ModoEliminacion, usuarioId: string, motivo?: string) {
  return tx.registroEliminacion.create({
    data: { entidad, entidadId: registro.id, modo, datos: JSON.parse(JSON.stringify(registro)) as Prisma.InputJsonValue, motivo, usuarioId, fecha: reloj.ahora() },
  });
}
