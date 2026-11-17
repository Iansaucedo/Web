import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Rol, Usuario } from '@prisma/client';
import { prisma } from '../db';
import { noAutenticado } from '../lib/errores';
import { log } from '../lib/log';

/** Cliente que se dio de baja él mismo y aún puede recuperar la cuenta. */
export const enPlazoDeRecuperacion = (u: Usuario) => !u.activo && Boolean(u.bajaSolicitadaEn) && !u.desvinculadoEn;

export const COOKIE_SESION = 'taller_sesion';

export interface Sesion {
  sub: string; // id de Usuario
  rol: Rol;
  /** Versión de sesión del usuario al firmar. Al cerrar sesión sube y los tokens anteriores dejan de valer. */
  v?: number;
}

const LONGITUD_MINIMA_SECRETO = 32;
let secretoTemporal: string | null = null;

/**
 * Secreto de firma. No hay ningún valor por defecto en el código (sería público en el repositorio):
 * - En producción, sin JWT_SECRET o con uno corto, la API no arranca (ver `comprobarSecretoSesion`).
 * - En desarrollo, sin JWT_SECRET se usa uno aleatorio por proceso: las sesiones se pierden al reiniciar.
 */
const secreto = () => {
  const s = process.env.JWT_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === 'production') throw new Error('Falta JWT_SECRET');
  if (!secretoTemporal) {
    secretoTemporal = randomBytes(48).toString('base64url');
    log('warn', 'JWT_SECRET no configurado: se usa un secreto temporal; las sesiones se pierden al reiniciar');
  }
  return secretoTemporal;
};

/** Se llama al crear la app: en producción, mejor no arrancar que firmar sesiones con un secreto débil. */
export function comprobarSecretoSesion() {
  const s = process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production' && (!s || s.length < LONGITUD_MINIMA_SECRETO)) {
    throw new Error(`JWT_SECRET es obligatorio en producción y debe tener al menos ${LONGITUD_MINIMA_SECRETO} caracteres`);
  }
}

export function firmarSesion(sesion: Sesion): string {
  return jwt.sign(sesion, secreto(), { expiresIn: '8h', algorithm: 'HS256' });
}

/** Atributos de la cookie. `Secure` en producción o siempre que la web pública vaya por HTTPS. */
export const opcionesCookie = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production' || (process.env.PUBLIC_WEB_URL ?? '').trim().startsWith('https://'),
  sameSite: 'lax' as const,
  path: '/',
});

/** Fija la cookie de sesión del usuario con su versión de sesión actual. */
export function fijarCookieSesion(res: Response, u: Pick<Usuario, 'id' | 'rol' | 'versionSesion'>): void {
  res.cookie(COOKIE_SESION, firmarSesion({ sub: u.id, rol: u.rol, v: u.versionSesion }), { ...opcionesCookie(), maxAge: 8 * 3_600_000 });
}

/** Invalida en el servidor todas las sesiones abiertas del usuario (en todos sus dispositivos). */
export async function cerrarSesiones(usuarioId: string): Promise<void> {
  await prisma.usuario.update({ where: { id: usuarioId }, data: { versionSesion: { increment: 1 } } });
}

/** Borra la cookie con los mismos atributos con los que se fijó (si no, algunos navegadores la conservan). */
export function borrarCookieSesion(res: Response): void {
  res.clearCookie(COOKIE_SESION, opcionesCookie());
}

/**
 * Lee la cookie y carga el usuario de la base de datos. Se consulta en cada petición para que
 * dar de baja a alguien o cambiarle el rol tenga efecto inmediato, sin esperar a que caduque el token.
 */
export async function autenticar(req: Request, obligatorio: true): Promise<Usuario>;
export async function autenticar(req: Request, obligatorio: boolean): Promise<Usuario | null>;
export async function autenticar(req: Request, obligatorio: boolean): Promise<Usuario | null> {
  const token = req.cookies?.[COOKIE_SESION];
  if (!token) {
    if (obligatorio) throw noAutenticado();
    return null;
  }
  let sesion: Sesion;
  try {
    sesion = jwt.verify(token, secreto(), { algorithms: ['HS256'] }) as Sesion;
  } catch {
    if (obligatorio) throw noAutenticado('Tu sesión ha caducado. Vuelve a entrar');
    return null;
  }
  const usuario = typeof sesion.sub === 'string' ? await prisma.usuario.findUnique({ where: { id: sesion.sub } }) : null;
  // Token de antes de cerrar sesión: ya no vale aunque no haya caducado (p. ej. una cookie robada).
  if (usuario && (sesion.v ?? 0) !== usuario.versionSesion) {
    if (obligatorio) throw noAutenticado('Tu sesión se cerró. Vuelve a entrar');
    return null;
  }
  // Autobaja dentro del plazo: la sesión sigue, pero `ruta.ts` solo deja recuperar la cuenta o salir.
  if (usuario && enPlazoDeRecuperacion(usuario)) return usuario;
  if (!usuario || !usuario.activo) {
    if (obligatorio) throw noAutenticado('Tu cuenta no está activa');
    return null;
  }
  return usuario;
}
