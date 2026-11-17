/** Email irreconocible para los logs (datos personales): «ana.garcia@gmail.com» → «a***@gmail.com». */
export function ocultarEmail(email: string): string {
  const [usuario, dominio] = email.split('@');
  return dominio ? `${usuario.slice(0, 1)}***@${dominio}` : '***';
}

/** Log en una línea JSON por evento. En tests se silencia salvo con DEBUG=1. */
export function log(nivel: 'info' | 'warn' | 'error', mensaje: string, datos: Record<string, unknown> = {}) {
  if (process.env.NODE_ENV === 'test' && !process.env.DEBUG) return;
  const linea = JSON.stringify({ t: new Date().toISOString(), nivel, mensaje, ...datos });
  (nivel === 'error' ? console.error : console.log)(linea);
}
