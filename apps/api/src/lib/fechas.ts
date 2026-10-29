import { addDays, format, getISODay, parseISO } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

/**
 * Fechas del taller. Los instantes se guardan en UTC; los días ("2026-11-10") son días del
 * calendario en la zona del taller. Las franjas se calculan en hora local, así que el cambio
 * de hora de marzo y octubre no desplaza las citas.
 */

export const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Día local (yyyy-MM-dd) de un instante. */
export function diaLocal(instante: Date, zona: string): string {
  return formatInTimeZone(instante, zona, 'yyyy-MM-dd');
}

export function horaLocal(instante: Date, zona: string): string {
  return formatInTimeZone(instante, zona, 'HH:mm');
}

/** Instante UTC en que empieza un día local. */
export function inicioDia(dia: string, zona: string): Date {
  return fromZonedTime(`${dia}T00:00:00`, zona);
}

export function minutosAHora(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

/** Instante UTC de una hora local de un día ("09:30" del 2026-11-10 en Madrid). */
export function instanteLocal(dia: string, minutosDesdeMedianoche: number, zona: string): Date {
  return fromZonedTime(`${dia}T${minutosAHora(minutosDesdeMedianoche)}:00`, zona);
}

/** Lunes = 1 … domingo = 7. */
export function diaSemana(dia: string): number {
  return getISODay(parseISO(dia));
}

export function sumarDias(dia: string, n: number): string {
  return format(addDays(parseISO(dia), n), 'yyyy-MM-dd');
}

/** Valor para columnas `@db.Date` (Prisma las trata como medianoche UTC). */
export function fechaDb(dia: string): Date {
  return new Date(`${dia}T00:00:00.000Z`);
}

export function diaDeFechaDb(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function diasEntre(desde: string, hasta: string): string[] {
  const dias: string[] = [];
  for (let d = desde; d <= hasta; d = sumarDias(d, 1)) dias.push(d);
  return dias;
}
