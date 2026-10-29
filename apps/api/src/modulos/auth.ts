import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import type { Usuario } from '@prisma/client';
import { prisma } from '../db';
import { z } from '../openapi/zod';
import { definir } from '../lib/ruta';
import { COOKIE_SESION, fijarCookieSesion } from '../middleware/auth';
import { ErrorApp } from '../lib/errores';
import { UsuarioSchema, aUsuario } from './esquemas';

/** Busca o crea el usuario. Si su email tiene invitación, recibe ese rol; si no, CLIENTE. */
export async function resolverUsuario(emailBruto: string, nombre: string, googleId?: string): Promise<Usuario> {
  const email = emailBruto.trim().toLowerCase();
  const existente = await prisma.usuario.findUnique({ where: { email } });
  if (existente) {
    // Autobaja dentro del plazo: puede entrar, pero solo verá la página para recuperar la cuenta o salir.
    if (!existente.activo && existente.bajaSolicitadaEn && !existente.desvinculadoEn) return existente;
    if (!existente.activo) throw new ErrorApp(403, 'CUENTA_DESACTIVADA', 'Tu cuenta está dada de baja. Habla con el taller');
    if (googleId && !existente.googleId) return prisma.usuario.update({ where: { id: existente.id }, data: { googleId } });
    return existente;
  }
  return prisma.$transaction(async (tx) => {
    const invitacion = await tx.invitacion.findUnique({ where: { email } });
    const valida = invitacion && !invitacion.usadaEn ? invitacion : null;
    const usuario = await tx.usuario.create({ data: { email, nombre: nombre.slice(0, 120), googleId, rol: valida?.rol ?? 'CLIENTE' } });
    if (valida) {
      await tx.invitacion.update({ where: { id: valida.id }, data: { usadaEn: new Date() } });
      if (valida.rol === 'MECANICO' || valida.rol === 'JEFE') await tx.empleado.create({ data: { usuarioId: usuario.id } });
    }
    return usuario;
  });
}

const googleConfigurado = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
if (googleConfigurado) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        // Ruta pública a través del proxy de Next, para que la cookie quede en el dominio web.
        callbackURL: `${process.env.PUBLIC_WEB_URL}/api/auth/google/callback`,
      },
      async (_at, _rt, profile, done) => {
        try {
          const email = profile.emails?.find((e) => e.verified !== false)?.value;
          if (!email) return done(new ErrorApp(400, 'SIN_EMAIL', 'Google no devolvió un email verificado'));
          done(null, await resolverUsuario(email, profile.displayName || email, profile.id));
        } catch (e) {
          done(e as Error);
        }
      },
    ),
  );
}

const sinGoogle = () => new ErrorApp(503, 'GOOGLE_NO_CONFIGURADO', 'El acceso con Google no está configurado en este servidor');

definir({
  metodo: 'get',
  ruta: '/auth/google',
  etiqueta: 'Acceso',
  resumen: 'Empieza el acceso con Google',
  descripcion: 'Redirige a la pantalla de Google. Al volver, `/auth/google/callback` fija la cookie de sesión.',
  acceso: 'publico',
  produce: 'redireccion',
  manejador: async ({ req, res }) => {
    if (!googleConfigurado) throw sinGoogle();
    passport.authenticate('google', { scope: ['email', 'profile'], session: false, prompt: 'select_account' })(req, res);
  },
});

definir({
  metodo: 'get',
  ruta: '/auth/google/callback',
  etiqueta: 'Acceso',
  resumen: 'Vuelta de Google',
  descripcion: 'Crea el usuario si es nuevo (con el rol de su invitación, si la hay), fija la cookie y redirige: a `/perfil` si es cliente sin perfil, si no a `/`.',
  acceso: 'publico',
  produce: 'redireccion',
  manejador: async ({ req, res }) => {
    if (!googleConfigurado) throw sinGoogle();
    await new Promise<void>((resolve) => {
      passport.authenticate('google', { session: false }, async (err: unknown, u: Usuario | false) => {
        if (err || !u) {
          const codigo = err instanceof ErrorApp ? err.codigo : 'GOOGLE';
          res.redirect(`/login?error=${encodeURIComponent(codigo)}`);
          return resolve();
        }
        fijarCookieSesion(res, { sub: u.id, rol: u.rol });
        const cliente = u.rol === 'CLIENTE' ? await prisma.cliente.findUnique({ where: { usuarioId: u.id } }) : true;
        res.redirect(cliente ? '/' : '/perfil');
        resolve();
      })(req, res);
    });
  },
});

definir({
  metodo: 'post',
  ruta: '/auth/logout',
  etiqueta: 'Acceso',
  resumen: 'Cerrar sesión',
  acceso: 'publico',
  permiteEnBaja: true,
  codigo: 204,
  manejador: async ({ res }) => {
    res.clearCookie(COOKIE_SESION, { path: '/' });
  },
});

definir({
  metodo: 'get',
  ruta: '/auth/me',
  etiqueta: 'Acceso',
  resumen: 'Usuario con sesión',
  descripcion: 'Devuelve el usuario, su rol y, si es cliente, su perfil (`cliente: null` si aún no lo ha completado).',
  respuesta: UsuarioSchema,
  permiteEnBaja: true,
  manejador: async ({ usuario }) => {
    const u = await prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id }, include: { cliente: true, empleado: true } });
    return aUsuario(u);
  },
});

// Acceso sin Google para tests de integración y E2E. Nunca existe en producción.
if (process.env.NODE_ENV === 'test') {
  definir({
    metodo: 'post',
    ruta: '/auth/test-login',
    etiqueta: 'Solo tests',
    resumen: 'Entrar sin Google (solo NODE_ENV=test)',
    acceso: 'publico',
    cuerpo: z.object({ email: z.email(), nombre: z.string().min(1).max(120).optional() }),
    respuesta: UsuarioSchema,
    permiteEnBaja: true,
    manejador: async ({ cuerpo, res }) => {
      const u = await resolverUsuario(cuerpo.email, cuerpo.nombre ?? cuerpo.email.split('@')[0]);
      fijarCookieSesion(res, { sub: u.id, rol: u.rol });
      return aUsuario(await prisma.usuario.findUniqueOrThrow({ where: { id: u.id }, include: { cliente: true, empleado: true } }));
    },
  });
}
