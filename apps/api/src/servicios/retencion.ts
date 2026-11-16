import { prisma } from '../db';
import { reloj } from '../lib/reloj';
import { log } from '../lib/log';

/**
 * Plazos de conservación de datos que ya no hacen falta (minimización de datos personales):
 * - Emails de la bandeja de salida ya enviados o fallidos: guardan el email y los datos del aviso.
 * - Avisos de la campana ya leídos, y cualquier aviso muy antiguo.
 * - Constancias de eliminación (copia del registro borrado): 6 años, el plazo de conservación de la documentación
 *   mercantil (art. 30 del Código de Comercio). Las facturas en sí van en las órdenes y no se borran.
 */
export const DIAS_RETENCION = {
  emailsProcesados: 30,
  avisosLeidos: 180,
  avisos: 365,
  constancias: 6 * 365,
} as const;

const haceDias = (dias: number) => new Date(reloj.ahora().getTime() - dias * 86_400_000);

export async function aplicarRetencion() {
  const [emails, leidos, viejos, constancias] = await Promise.all([
    prisma.emailSaliente.deleteMany({ where: { estado: { in: ['ENVIADO', 'FALLIDO'] }, creadoEn: { lt: haceDias(DIAS_RETENCION.emailsProcesados) } } }),
    prisma.notificacion.deleteMany({ where: { leida: true, creadaEn: { lt: haceDias(DIAS_RETENCION.avisosLeidos) } } }),
    prisma.notificacion.deleteMany({ where: { creadaEn: { lt: haceDias(DIAS_RETENCION.avisos) } } }),
    prisma.registroEliminacion.deleteMany({ where: { fecha: { lt: haceDias(DIAS_RETENCION.constancias) } } }),
  ]);
  const r = { emails: emails.count, avisos: leidos.count + viejos.count, constancias: constancias.count };
  if (r.emails || r.avisos || r.constancias) log('info', 'datos caducados borrados', r);
  return r;
}

/** Revisa una vez al día. Devuelve una función para pararlo. */
export function arrancarRetencion(cadaMs = 24 * 3_600_000) {
  const t = setInterval(() => void aplicarRetencion().catch((e) => log('error', 'fallo aplicando la retención de datos', { error: String(e) })), cadaMs);
  return () => clearInterval(t);
}
