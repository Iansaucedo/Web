import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import type { Usuario } from '@prisma/client';
import { prisma } from '../db';
import { z } from '../openapi/zod';
import { definir } from '../lib/ruta';
import { borrarCookieSesion, cerrarSesiones, fijarCookieSesion } from '../middleware/auth';
import { almacenEstadoOAuth } from '../servicios/estadoOAuth';
import type { StateStore } from 'passport-oauth2';
import { ErrorApp } from '../lib/errores';
import { UsuarioSchema, aUsuario } from './esquemas';
import { invitacionVigente } from '../servicios/acceso';
import { reloj } from '../lib/reloj';

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
    const valida = invitacion && invitacionVigente(invitacion, reloj.ahora()) ? invitacion : null;
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
  const publicWebUrl = (process.env.PUBLIC_WEB_URL ?? '').trim().replace(/\/+$/, '');
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        // Ruta pública a través del proxy de Next, para que la cookie quede en el dominio web.
        callbackURL: `${publicWebUrl}/api/auth/google/callback`,
        // `state` contra el CSRF en el login (ver servicios/estadoOAuth.ts).
        // Los tipos piden una función sobrecargada; passport-oauth2 elige la firma por `store.length` (3).
        store: almacenEstadoOAuth as unknown as StateStore,
      },
      async (_at, _rt, profile, done) => {
        try {
          // Solo un email que Google marque expresamente como verificado (sin el dato, no se da por bueno).
          const email = profile.emails?.find((e) => e.verified === true)?.value;
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
    // passport necesita `next`: sin él, un error (p. ej. `?code=` inventado en esta ruta) lanzaba
    // «next is not a function» fuera de cualquier try/catch y tiraba el proceso entero.
    await new Promise<void>((resolve) => {
      res.once('finish', () => resolve());
      passport.authenticate('google', { scope: ['email', 'profile'], session: false, prompt: 'select_account' })(req, res, (err?: unknown) => {
        if (!res.headersSent) res.redirect(`/login?error=${encodeURIComponent(err instanceof ErrorApp ? err.codigo : 'GOOGLE')}`);
        resolve();
      });
    });
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
        try {
          if (err || !u) {
            const codigo = err instanceof ErrorApp ? err.codigo : 'GOOGLE';
            res.redirect(`/login?error=${encodeURIComponent(codigo)}`);
            return;
          }
          fijarCookieSesion(res, u);
          const cliente = u.rol === 'CLIENTE' ? await prisma.cliente.findUnique({ where: { usuarioId: u.id } }) : true;
          res.redirect(cliente ? '/' : '/perfil');
        } catch {
          if (!res.headersSent) res.redirect('/login?error=GOOGLE');
        } finally {
          resolve();
        }
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
  descripcion: 'Borra la cookie y además invalida en el servidor los tokens ya emitidos del usuario (en todos sus dispositivos).',
  manejador: async ({ usuario, res }) => {
    // Ruta pública: `usuario` es null si no había sesión válida.
    if (usuario) await cerrarSesiones(usuario.id);
    borrarCookieSesion(res);
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
      fijarCookieSesion(res, u);
      return aUsuario(await prisma.usuario.findUniqueOrThrow({ where: { id: u.id }, include: { cliente: true, empleado: true } }));
    },
  });
}
