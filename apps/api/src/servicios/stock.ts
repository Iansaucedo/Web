import type { TipoMovimientoStock } from '@prisma/client';
import { conflicto, noEncontrado } from '../lib/errores';
import { reloj } from '../lib/reloj';
import type { Tx } from '../lib/transaccion';

/**
 * Único punto por el que cambia el stock. Bloquea la fila de la pieza (FOR UPDATE) para leer el valor
 * real, aplica el cambio y deja el movimiento con antes y después. Si el resultado fuera negativo, falla.
 * `delta` suma o resta; `fijar` pone un valor absoluto (cuadre de inventario).
 */
export async function moverStock(
  tx: Tx,
  piezaId: string,
  cambio: { delta: number } | { fijar: number },
  datos: { tipo: TipoMovimientoStock; usuarioId: string; motivo?: string; ordenId?: string; mensajeSinStock?: string },
) {
  const filas = await tx.$queryRaw<{ stock: number }[]>`SELECT stock FROM "Pieza" WHERE id = ${piezaId} FOR UPDATE`;
  if (!filas.length) throw noEncontrado('La pieza');
  const antes = filas[0].stock;
  const despues = 'fijar' in cambio ? cambio.fijar : antes + cambio.delta;
  if (despues < 0) throw conflicto('STOCK_INSUFICIENTE', datos.mensajeSinStock ?? `Solo hay ${antes} unidades`);
  await tx.pieza.update({ where: { id: piezaId }, data: { stock: despues } });
  await tx.movimientoStock.create({
    data: { piezaId, tipo: datos.tipo, delta: despues - antes, stockAntes: antes, stockDespues: despues, motivo: datos.motivo, usuarioId: datos.usuarioId, ordenId: datos.ordenId, fecha: reloj.ahora() },
  });
  return despues;
}
