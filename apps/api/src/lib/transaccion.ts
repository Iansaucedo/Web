import type { Prisma } from '@prisma/client';
import { prisma } from '../db';

export type Tx = Prisma.TransactionClient;

/** Transacción con tiempo límite: si algo se bloquea, falla en vez de colgar la petición. */
export function transaccion<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(fn, { maxWait: 5_000, timeout: 15_000 });
}

/**
 * Cerrojo de PostgreSQL ligado a la transacción. Serializa operaciones que compiten por el
 * mismo recurso lógico (las citas de un día, la jornada de un empleado, un puesto)
 * y se libera solo al terminar la transacción.
 */
export async function bloquear(tx: Tx, recurso: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${recurso}))`;
}
