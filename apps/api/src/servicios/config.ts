import type { ConfigTaller, PrismaClient } from '@prisma/client';
import type { Tx } from '../lib/transaccion';

/** Lee la fila única de configuración; si no existe (base recién creada) la crea con los valores por defecto. */
export async function obtenerConfig(db: Tx | PrismaClient): Promise<ConfigTaller> {
  return (await db.configTaller.findUnique({ where: { id: 1 } })) ?? db.configTaller.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
}
