import type { Tono } from '../theme';
import type { EstadoCita, EstadoOrden } from './tipos';

const ZONA = 'Europe/Madrid';

export const euros = (centimos: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(centimos / 100);
export const fechaCorta = (iso: string) => new Intl.DateTimeFormat('es-ES', { timeZone: ZONA, day: 'numeric', month: 'short' }).format(new Date(iso));
export const fechaHora = (iso: string) =>
  new Intl.DateTimeFormat('es-ES', { timeZone: ZONA, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
export const hora = (iso: string) => new Intl.DateTimeFormat('es-ES', { timeZone: ZONA, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
/** "2026-11-10" → "mar, 10 nov" (sin desfases de zona: el día es del calendario). */
export const dia = (d: string) => new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${d}T12:00:00Z`));
export const diaLargo = (d: string) => new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${d}T12:00:00Z`));
/** Hoy en la zona del taller, yyyy-MM-dd. */
export const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(new Date());
export const sumarDias = (d: string, n: number) => {
  const f = new Date(`${d}T12:00:00Z`);
  f.setUTCDate(f.getUTCDate() + n);
  return f.toISOString().slice(0, 10);
};
export const horasMin = (min: number) => `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;

export const ESTADO_ORDEN: Record<EstadoOrden, { texto: string; tono: Tono }> = {
  EN_DIAGNOSTICO: { texto: 'En diagnóstico', tono: 'info' },
  ESPERANDO_AUTORIZACION: { texto: 'Esperando autorización', tono: 'aviso' },
  EN_REPARACION: { texto: 'En reparación', tono: 'info' },
  ESPERANDO_PIEZAS: { texto: 'Esperando piezas', tono: 'aviso' },
  COMPLETADA: { texto: 'Lista para recoger', tono: 'exito' },
  RECHAZADA: { texto: 'Rechazada', tono: 'error' },
  ENTREGADA: { texto: 'Entregada', tono: 'neutro' },
};

export const ESTADO_CITA: Record<EstadoCita, { texto: string; tono: Tono }> = {
  PENDIENTE: { texto: 'Pendiente de confirmar', tono: 'aviso' },
  CONFIRMADA: { texto: 'Confirmada', tono: 'exito' },
  RECIBIDA: { texto: 'Recibida', tono: 'info' },
  CANCELADA: { texto: 'Cancelada', tono: 'error' },
  NO_PRESENTADO: { texto: 'No presentado', tono: 'error' },
};

export const ESTADO_PEDIDO: Record<string, { texto: string; tono: Tono }> = {
  PENDIENTE: { texto: 'Por aprobar', tono: 'aviso' },
  APROBADO: { texto: 'Aprobado', tono: 'info' },
  PEDIDO: { texto: 'Pedido', tono: 'info' },
  RECIBIDO: { texto: 'Recibido', tono: 'exito' },
  RECHAZADO: { texto: 'Rechazado', tono: 'error' },
};

export const FICHAJE: Record<string, string> = { ENTRADA: 'Entrada', INICIO_PAUSA: 'Inicio de pausa', FIN_PAUSA: 'Fin de pausa', SALIDA: 'Salida' };
export const ROL: Record<string, string> = { CLIENTE: 'Cliente', MECANICO: 'Mecánico', JEFE: 'Jefe de taller', DUENO: 'Dueño' };

export const CATEGORIAS: Record<string, string> = {
  FRENOS: 'Frenos', MOTOR: 'Motor', FILTROS: 'Filtros', ACEITES: 'Aceites', ENCENDIDO: 'Encendido', ELECTRICIDAD: 'Electricidad',
  SUSPENSION: 'Suspensión', TRANSMISION: 'Transmisión', CARROCERIA: 'Carrocería', NEUMATICOS: 'Neumáticos', OTRAS: 'Otras',
};
