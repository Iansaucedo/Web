import { prisma } from '../db';
import { reloj } from '../lib/reloj';
import { log } from '../lib/log';

/** Días durante los que una autobaja se puede deshacer entrando de nuevo. */
export const DIAS_RECUPERACION = 14;

/**
 * Desliga Google de las cuentas cuya autobaja tiene más de 14 días: borra el `googleId` y cambia el email
 * por uno no utilizable, para que esa cuenta de Google pueda empezar de cero si vuelve. La fila del usuario
 * se conserva (citas, órdenes y facturas la necesitan) y el email original queda en la constancia de la baja.
 * Es idempotente y seguro con varias instancias (la condición va en el propio UPDATE).
 */
export async function desvincularCuentasCaducadas(): Promise<number> {
  const limite = new Date(reloj.ahora().getTime() - DIAS_RECUPERACION * 86_400_000);
  const caducadas = await prisma.usuario.findMany({ where: { bajaSolicitadaEn: { lte: limite }, desvinculadoEn: null, activo: false }, select: { id: true } });
  let n = 0;
  for (const { id } of caducadas) {
    const r = await prisma.usuario.updateMany({
      where: { id, desvinculadoEn: null, activo: false, bajaSolicitadaEn: { lte: limite } },
      data: { googleId: null, email: `baja-${id}@sin-cuenta.invalid`, desvinculadoEn: reloj.ahora() },
    });
    n += r.count;
  }
  if (n) log('info', 'cuentas desvinculadas tras la autobaja', { n });
  return n;
}

/** Revisa las bajas cada hora. Devuelve una función para pararlo. */
export function arrancarDesvinculacion(cadaMs = 3_600_000) {
  const t = setInterval(() => void desvincularCuentasCaducadas().catch((e) => log('error', 'fallo desvinculando cuentas', { error: String(e) })), cadaMs);
  return () => clearInterval(t);
}
