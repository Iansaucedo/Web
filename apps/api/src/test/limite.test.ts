import { beforeEach, describe, expect, it } from 'vitest';
import { AHORA, anonimo, clienteConCoche, entrar, PASADO, reiniciarBd, reservar, tallerAbierto } from './ayudas';
import { prisma } from '../db';
import { reloj } from '../lib/reloj';
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

describe('límite diario de acciones de cliente que avisan al taller', () => {
  it('un cliente reserva, cambia o cancela citas como mucho 20 veces al día; al día siguiente vuelve a poder', async () => {
    await reiniciarBd();
    await tallerAbierto(1);
    const ana = await clienteConCoche();
    const jefe = await entrar('jefe@taller.test', 'JEFE');
    let cita = '';
    // 10 reservas y 10 cancelaciones: 20 acciones.
    for (let i = 0; i < 10; i++) {
      const r = await reservar(ana, PASADO, '10:00');
      expect(r.status).toBe(201);
      cita = r.body.id;
      expect((await ana.post(`/api/citas/${cita}/cancelar`).send({})).status).toBe(200);
    }
    const r = await reservar(ana, PASADO, '10:00');
    expect(r.status).toBe(429);
    expect(r.body.codigo).toBe('LIMITE_DIARIO');
    expect(await prisma.cita.count({ where: { estado: 'PENDIENTE' } })).toBe(0);
    // El taller no tiene ese límite (cancelar por el taller no cuenta para nadie).
    const otro = await clienteConCoche('luis@cliente.test', '9999XYZ');
    const deLuis = (await reservar(otro, PASADO, '11:00')).body.id;
    expect((await jefe.post(`/api/citas/${deLuis}/cancelar`).send({ motivo: 'Avería en el elevador' })).status).toBe(200);
    // Al día siguiente el contador empieza de cero.
    reloj.fijar(new Date(AHORA.getTime() + 24 * 3_600_000));
    expect((await reservar(ana, '2026-11-12', '10:00')).status).toBe(201);
  });

  it('un intento rechazado no cuenta', async () => {
    await reiniciarBd();
    await tallerAbierto(1);
    const ana = await clienteConCoche();
    for (let i = 0; i < 25; i++) expect((await reservar(ana, PASADO, '07:00')).body.codigo).toBe('FRANJA_NO_VALIDA');
    expect((await reservar(ana, PASADO, '10:00')).status).toBe(201);
  });
});

describe('modo de pruebas: solo en local o con la clave', () => {
  it('desde fuera de la máquina, las rutas de pruebas no existen (404); con la clave, sí', async () => {
    const { esLocal } = await import('../middleware/pruebas');
    expect(esLocal('::ffff:127.0.0.1', undefined)).toBe(true);
    expect(esLocal('127.0.0.1', '::1, 127.0.0.1:5000')).toBe(true);
    // Un X-Forwarded-For inventado con 127.0.0.1 no basta: los proxies añaden la IP real detrás.
    expect(esLocal('127.0.0.1', '127.0.0.1, 81.40.12.7')).toBe(false);
    expect(esLocal('10.0.0.5', undefined)).toBe(false);

    const fuera = { 'X-Forwarded-For': '81.40.12.7' };
    expect((await anonimo().post('/api/test/reloj').set(fuera).send({ ahora: null })).status).toBe(404);
    expect((await anonimo().post('/api/auth/test-login').set(fuera).send({ email: 'a@x.es' })).status).toBe(404);
    expect((await anonimo().post('/api/test/reloj').send({ ahora: null })).status).toBe(200);

    process.env.PRUEBAS_SECRETO = 'clave-de-pruebas-muy-larga-0123456789';
    try {
      expect((await anonimo().post('/api/test/reloj').set({ ...fuera, 'X-Pruebas-Secreto': 'otra' }).send({ ahora: null })).status).toBe(404);
      expect((await anonimo().post('/api/test/reloj').set({ ...fuera, 'X-Pruebas-Secreto': process.env.PRUEBAS_SECRETO }).send({ ahora: null })).status).toBe(200);
      // Una clave corta no vale nunca (para que nadie la configure como «1234»).
      process.env.PRUEBAS_SECRETO = 'corta';
      expect((await anonimo().post('/api/test/reloj').set({ ...fuera, 'X-Pruebas-Secreto': 'corta' }).send({ ahora: null })).status).toBe(404);
    } finally {
      delete process.env.PRUEBAS_SECRETO;
    }
  });
});
