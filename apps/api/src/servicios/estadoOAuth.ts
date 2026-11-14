import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { opcionesCookie } from '../middleware/auth';

/**
 * Parámetro `state` del acceso con Google, sin sesiones de servidor: el valor aleatorio va a Google en la URL
 * y a la vez en una cookie httpOnly de corta duración; a la vuelta deben coincidir. Así nadie puede colar en el
 * navegador de otra persona una vuelta de Google con su propio código y dejarla dentro de la cuenta del atacante
 * (CSRF en el login). passport-oauth2 elige la firma por el número de parámetros: `store(req, meta, cb)` y
 * `verify(req, state, cb)`.
 */
export const COOKIE_ESTADO_OAUTH = 'taller_oauth_estado';
const RUTA_COOKIE = '/api/auth';
const MINUTOS_VALIDEZ = 10;

const iguales = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export const almacenEstadoOAuth = {
  store(req: Request, _meta: unknown, cb: (err: Error | null, estado?: string) => void) {
    const estado = randomBytes(32).toString('base64url');
    req.res!.cookie(COOKIE_ESTADO_OAUTH, estado, { ...opcionesCookie(), path: RUTA_COOKIE, maxAge: MINUTOS_VALIDEZ * 60_000 });
    cb(null, estado);
  },

  verify(req: Request, recibido: unknown, cb: (err: Error | null, ok: boolean, info?: { message: string }) => void) {
    const guardado: unknown = req.cookies?.[COOKIE_ESTADO_OAUTH];
    // De un solo uso: se borra tanto si vale como si no.
    req.res?.clearCookie(COOKIE_ESTADO_OAUTH, { ...opcionesCookie(), path: RUTA_COOKIE });
    const ok = typeof guardado === 'string' && typeof recibido === 'string' && guardado.length > 0 && iguales(guardado, recibido);
    cb(null, ok, ok ? undefined : { message: 'El acceso con Google no se inició desde esta web o ha caducado' });
  },
};
