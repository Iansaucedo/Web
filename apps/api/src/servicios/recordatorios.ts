import { prisma } from '../db';
import { reloj } from '../lib/reloj';
import { log } from '../lib/log';
import { transaccion } from '../lib/transaccion';
import { fechaLarga, hora } from '../emails/formato';
import { avisar } from './avisos';
import { obtenerConfig } from './config';

const HORAS_ANTES = 24;

/**
 * Envía el recordatorio a las citas que empiezan dentro de 24 h. Una sola vez por cita: la marca va en un
 * UPDATE condicional, así que varios procesos a la vez no lo duplican. No se recuerda una cita reservada
 * con menos de 24 h (el cliente acaba de recibir el email de la reserva).
 */
export async function enviarRecordatorios(): Promise<number> {
  const ahora = reloj.ahora();
  const limite = new Date(ahora.getTime() + HORAS_ANTES * 3_600_000);
  const citas = await prisma.cita.findMany({
    where: { estado: { in: ['PENDIENTE', 'CONFIRMADA'] }, recordatorioEn: null, inicio: { gt: ahora, lte: limite } },
    select: { id: true, inicio: true, creadaEn: true },
  });
  const c = await obtenerConfig(prisma);
  let n = 0;
  for (const cita of citas.filter((x) => x.creadaEn.getTime() <= x.inicio.getTime() - HORAS_ANTES * 3_600_000)) {
    if (await recordar(cita.id, ahora, c.zonaHoraria)) n++;
  }
  if (n) log('info', 'recordatorios de cita enviados', { n });
  return n;
}

/**
 * Reclama la cita y encola el recordatorio en la misma transacción. Devuelve false si otro proceso
 * ya lo había enviado (la condición `recordatorioEn: null` va en el propio UPDATE).
 */
export async function recordar(citaId: string, ahora: Date, zona: string): Promise<boolean> {
  return transaccion(async (tx) => {
    const marcada = await tx.cita.updateMany({ where: { id: citaId, recordatorioEn: null, estado: { in: ['PENDIENTE', 'CONFIRMADA'] } }, data: { recordatorioEn: ahora } });
    if (!marcada.count) return false;
    const cita = await tx.cita.findUniqueOrThrow({ where: { id: citaId }, include: { vehiculo: true, cliente: true } });
    const datos = {
      marca: cita.vehiculo.marca,
      modelo: cita.vehiculo.modelo,
      matricula: cita.vehiculo.matricula,
      fecha: fechaLarga(cita.inicio, zona),
      hora: hora(cita.inicio, zona),
      problema: cita.descripcionProblema,
    };
    await avisar(tx, cita.cliente.usuarioId, { tipo: 'RECORDATORIO_CITA', mensaje: `Mañana te esperamos a las ${datos.hora} con tu ${datos.marca} ${datos.modelo}`, enlace: '/ordenes', datos });
    return true;
  });
}

/** Revisa cada 15 minutos. Devuelve una función para pararlo. */
export function arrancarRecordatorios(cadaMs = 15 * 60_000) {
  const t = setInterval(() => void enviarRecordatorios().catch((e) => log('error', 'fallo enviando recordatorios', { error: String(e) })), cadaMs);
  return () => clearInterval(t);
}
