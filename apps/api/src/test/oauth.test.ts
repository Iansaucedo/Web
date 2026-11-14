import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import type request from 'supertest';

// Google «configurado» solo en este archivo (cada archivo de tests corre en su propio proceso).
// Las llamadas a Google se sustituyen: ningún test sale a la red.
process.env.GOOGLE_CLIENT_ID = 'cliente-de-prueba';
process.env.GOOGLE_CLIENT_SECRET = 'secreto-de-prueba';

type Llamada = { codigo: string };
let app: Express;
let peticion: typeof request;
let estrategia: {
  _oauth2: { getOAuthAccessToken: (c: string, p: object, cb: (e: Error | null, at?: string, rt?: string, r?: object) => void) => void };
  userProfile: (at: string, done: (e: Error | null, p?: object) => void) => void;
};
let llamadasAGoogle: Llamada[];
let reiniciarBd: () => Promise<void>;
let prisma: typeof import('../db').prisma;

beforeAll(async () => {
  const passport = (await import('passport')).default;
  ({ reiniciarBd } = await import('./ayudas'));
  ({ prisma } = await import('../db'));
  app = (await import('./ayudas')).app;
  peticion = (await import('supertest')).default;
  estrategia = (passport as unknown as { _strategy: (n: string) => typeof estrategia })._strategy('google');
});

/** Google responde a un código con este perfil (o con error si `perfil` es null). */
function googleResponde(perfil: object | null) {
  estrategia._oauth2.getOAuthAccessToken = (codigo, _p, cb) => {
    llamadasAGoogle.push({ codigo });
    setImmediate(() => (perfil ? cb(null, 'token', 'refresco', {}) : cb(new Error('invalid_grant'))));
  };
  estrategia.userProfile = (_at, done) => done(null, perfil ?? undefined);
}

const perfilGoogle = (verified: boolean | undefined) => ({ id: 'g-123', displayName: 'Ana García', emails: [{ value: 'ana@gmail.test', verified }], provider: 'google' });

/** Empieza el acceso: devuelve la cookie de `state` y el `state` que viajó a Google. */
async function empezar() {
  const r = await peticion(app).get('/api/auth/google');
  expect(r.status).toBe(302);
  const estado = new URL(r.headers.location).searchParams.get('state');
  const cookie = ([] as string[]).concat(r.headers['set-cookie'] ?? []).find((c) => c.startsWith('taller_oauth_estado='));
  return { estado, cookie: cookie?.split(';')[0] };
}

beforeEach(async () => {
  await reiniciarBd();
  llamadasAGoogle = [];
  googleResponde(perfilGoogle(true));
});

describe('acceso con Google', () => {
  it('el inicio manda a Google un `state` aleatorio y lo guarda en una cookie httpOnly de corta duración', async () => {
    const r = await peticion(app).get('/api/auth/google');
    const estado = new URL(r.headers.location).searchParams.get('state');
    const cookie = ([] as string[]).concat(r.headers['set-cookie'] ?? []).find((c) => c.startsWith('taller_oauth_estado='))?.split(';')[0];
    expect(estado).toMatch(/^[\w-]{40,}$/);
    expect(cookie).toBe(`taller_oauth_estado=${estado}`);
    const crudo = ([] as string[]).concat(r.headers['set-cookie'] ?? []).join(' ');
    expect(crudo).toMatch(/HttpOnly/i);
    expect(crudo).toMatch(/Path=\/api\/auth/);
    expect(crudo).toMatch(/SameSite=Lax/i);
  });

  it('con el `state` correcto entra y fija la sesión', async () => {
    const { estado, cookie } = await empezar();
    const r = await peticion(app).get(`/api/auth/google/callback?code=bueno&state=${estado}`).set('Cookie', cookie!);
    expect(r.status).toBe(302);
    expect(r.headers.location).toBe('/perfil');
    expect(([] as string[]).concat(r.headers['set-cookie'] ?? []).some((c) => c.startsWith('taller_sesion='))).toBe(true);
    expect(llamadasAGoogle).toEqual([{ codigo: 'bueno' }]);
  });

  it('CSRF en el login: una vuelta de Google sin `state` o con otro `state` no entra ni llega a canjear el código', async () => {
    const { estado } = await empezar();
    for (const [query, cookie] of [
      ['?code=del-atacante', undefined],
      [`?code=del-atacante&state=${estado}`, undefined], // la víctima no tiene la cookie de ese `state`
      ['?code=del-atacante&state=inventado', 'taller_oauth_estado=otro-distinto'],
    ] as const) {
      const r = cookie ? await peticion(app).get(`/api/auth/google/callback${query}`).set('Cookie', cookie) : await peticion(app).get(`/api/auth/google/callback${query}`);
      expect(r.status).toBe(302);
      expect(r.headers.location).toBe('/login?error=GOOGLE');
      expect(([] as string[]).concat(r.headers['set-cookie'] ?? []).some((c) => c.startsWith('taller_sesion='))).toBe(false);
    }
    expect(llamadasAGoogle).toHaveLength(0);
  });

  it('QA: un `?code=` inventado en la ruta de inicio ya no tira la API (antes: «next is not a function» y el proceso se cerraba)', async () => {
    googleResponde(null);
    const capturadas: unknown[] = [];
    const oyente = (e: unknown) => capturadas.push(e);
    process.prependListener('uncaughtException', oyente);
    try {
      const { estado, cookie } = await empezar();
      const r = await peticion(app).get(`/api/auth/google?code=basura&state=${estado}`).set('Cookie', cookie!);
      expect(r.status).toBe(302);
      expect(r.headers.location).toBe('/login?error=GOOGLE');
      expect((await peticion(app).get('/api/auth/google?error=server_error')).status).toBeLessThan(500);
      await new Promise((ok) => setTimeout(ok, 50));
    } finally {
      process.removeListener('uncaughtException', oyente);
    }
    expect(capturadas).toEqual([]);
    expect((await peticion(app).get('/api/health')).status).toBe(200);
  });

  it('un email que Google no marca expresamente como verificado no sirve para entrar', async () => {
    for (const verified of [false, undefined]) {
      googleResponde(perfilGoogle(verified));
      const { estado, cookie } = await empezar();
      const r = await peticion(app).get(`/api/auth/google/callback?code=x&state=${estado}`).set('Cookie', cookie!);
      expect(r.headers.location).toBe('/login?error=SIN_EMAIL');
    }
    expect(await prisma.usuario.count()).toBe(0);
  });
});
