import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { ErrorApp } from '../lib/errores';
import { ipSinPuerto } from './limite';

/**
 * Rutas del modo de pruebas (`/auth/test-login` y `/test/*`, solo con NODE_ENV=test). Entran sin Google y borran
 * la base de datos, así que solo responden:
 * - desde la propia máquina: el socket y TODAS las IP de X-Forwarded-For son locales (no depende de TRUST_PROXY:
 *   un atacante puede añadir IP falsas a la cabecera, pero no quitar las que añaden los proxies de verdad), o
 * - con la cabecera `X-Pruebas-Secreto` igual a PRUEBAS_SECRETO (al menos 24 caracteres), para un entorno de pruebas
 *   desplegado.
 * Si no, 404: desde fuera, las rutas no existen.
 */
const LOCALES = new Set(['127.0.0.1', '::1']);
const MIN_SECRETO = 24;

export function esLocal(remota: string | undefined, reenviada: string | undefined): boolean {
  const ips = [remota, ...(reenviada ? reenviada.split(',') : [])].map((x) => ipSinPuerto(x?.trim()));
  return ips.every((ip) => LOCALES.has(ip));
}

function secretoValido(recibido: string | undefined): boolean {
  const esperado = process.env.PRUEBAS_SECRETO ?? '';
  if (esperado.length < MIN_SECRETO || !recibido) return false;
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const soloAccesoDePruebas: RequestHandler = (req, _res, next) => {
  if (esLocal(req.socket.remoteAddress, req.get('X-Forwarded-For')) || secretoValido(req.get('X-Pruebas-Secreto'))) return next();
  next(new ErrorApp(404, 'RUTA_NO_ENCONTRADA', 'Esa ruta no existe'));
};
