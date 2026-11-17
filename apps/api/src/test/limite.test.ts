import { beforeEach, describe, expect, it } from 'vitest';
import { anonimo, reiniciarBd } from './ayudas';
import { reiniciarLimites } from '../middleware/limite';

beforeEach(async () => {
  await reiniciarBd();
  reiniciarLimites();
});

describe('límite de peticiones', () => {
  it('el acceso admite 20 intentos por minuto y IP; el 21.º recibe 429 con Retry-After', async () => {
    for (let i = 0; i < 20; i++) expect((await anonimo().post('/api/auth/test-login').send({ email: `u${i}@x.es` })).status).toBe(200);
    const r = await anonimo().post('/api/auth/test-login').send({ email: 'u21@x.es' });
    expect(r.status).toBe(429);
    expect(r.body.codigo).toBe('DEMASIADAS_PETICIONES');
    expect(Number(r.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('el límite estricto es solo para entrar: /auth/me (cada carga de página) no lo agota', async () => {
    const r = await anonimo().post('/api/auth/test-login').send({ email: 'ana@cliente.test' });
    const cookie = ([] as string[]).concat(r.headers['set-cookie'] ?? []).find((c) => c.startsWith('taller_sesion='))!.split(';')[0];
    for (let i = 0; i < 40; i++) expect((await anonimo().get('/api/auth/me').set('Cookie', cookie)).status).toBe(200);
    // Y entrar sigue teniendo su propio cupo intacto.
    expect((await anonimo().post('/api/auth/test-login').send({ email: 'luis@cliente.test' })).status).toBe(200);
  });

  it('el límite general no afecta a un uso normal', async () => {
    for (let i = 0; i < 50; i++) expect((await anonimo().get('/api/health')).status).toBe(200);
  });
});
