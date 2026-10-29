import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Rol, Usuario } from '@prisma/client';
import { prisma } from '../db';
import { noAutenticado } from '../lib/errores';

/** Cliente que se dio de baja él mismo y aún puede recuperar la cuenta. */
export const enPlazoDeRecuperacion = (u: Usuario) => !u.activo && Boolean(u.bajaSolicitadaEn) && !u.desvinculadoEn;

export const COOKIE_SESION = 'taller_sesion';

export interface Sesion {
  sub: string; // id de Usuario
  rol: Rol;
}

const secreto = () => {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) throw new Error('JWT_SECRET falta o es demasiado corto (mínimo 16 caracteres)');
  return s;
};

export function firmarSesion(sesion: Sesion): string {
  return jwt.sign(sesion, secreto(), { expiresIn: '8h', algorithm: 'HS256' });
}

export function fijarCookieSesion(res: Response, sesion: Sesion): void {
  res.cookie(COOKIE_SESION, firmarSesion(sesion), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 8 * 3_600_000,
    path: '/',
  });
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
  // Autobaja dentro del plazo: la sesión sigue, pero `ruta.ts` solo deja recuperar la cuenta o salir.
  if (usuario && enPlazoDeRecuperacion(usuario)) return usuario;
  if (!usuario || !usuario.activo) {
    if (obligatorio) throw noAutenticado('Tu cuenta no está activa');
    return null;
  }
  return usuario;
}
