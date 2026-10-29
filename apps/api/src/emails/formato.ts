import { formatInTimeZone } from 'date-fns-tz';
import { es } from 'date-fns/locale';

const ZONA = 'Europe/Madrid';

export const euros = (centimos: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(centimos / 100);

/** «martes, 10 de noviembre» */
export const fechaLarga = (d: Date, zona = ZONA) => formatInTimeZone(d, zona, "EEEE, d 'de' MMMM", { locale: es });
export const hora = (d: Date, zona = ZONA) => formatInTimeZone(d, zona, 'HH:mm');
/** Día yyyy-MM-dd → «martes, 10 de noviembre» */
export const diaLargo = (dia: string) => fechaLarga(new Date(`${dia}T12:00:00Z`), 'UTC');
export const numeroOrden = (n: number) => `OR-${String(n).padStart(4, '0')}`;
export const numeroReserva = (n: number) => `RM-${String(n).padStart(2, '0')}`;
/** «a, b y c» */
export const enumerar = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}`);

export const ROL_TEXTO: Record<string, string> = { CLIENTE: 'cliente', MECANICO: 'mecánico', JEFE: 'jefe de taller', DUENO: 'dueño' };
export const FICHAJE_TEXTO: Record<string, string> = { ENTRADA: 'Entrada', INICIO_PAUSA: 'Inicio de pausa', FIN_PAUSA: 'Fin de pausa', SALIDA: 'Salida' };
