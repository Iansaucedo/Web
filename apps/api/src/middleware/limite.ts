import type { RequestHandler } from 'express';
import { ErrorApp } from '../lib/errores';

/**
 * Límite de peticiones por IP en ventana fija de un minuto. Frena fuerza bruta y abuso del acceso
 * (que además pasa por Google) y protege la base de datos de bucles de un cliente roto.
 * Está en memoria: con varias instancias, cada una cuenta lo suyo (suficiente para este despliegue).
 */
const ventanas = new Map<string, { inicio: number; n: number }>();

export function reiniciarLimites() {
  ventanas.clear();
}

export function limitar(nombre: string, maximo: number, ventanaMs = 60_000): RequestHandler {
  return (req, res, next) => {
    const clave = `${nombre}:${req.ip}`;
    const ahora = Date.now();
    let v = ventanas.get(clave);
    if (!v || ahora - v.inicio >= ventanaMs) {
      v = { inicio: ahora, n: 0 };
      ventanas.set(clave, v);
    }
    v.n++;
    if (v.n > maximo) {
      res.setHeader('Retry-After', String(Math.ceil((v.inicio + ventanaMs - ahora) / 1000)));
      return next(new ErrorApp(429, 'DEMASIADAS_PETICIONES', 'Has hecho demasiadas peticiones seguidas. Espera un momento y vuelve a intentarlo'));
    }
    if (ventanas.size > 50_000) for (const [k, x] of ventanas) if (ahora - x.inicio >= ventanaMs) ventanas.delete(k);
    next();
  };
}
