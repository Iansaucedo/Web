import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../db';
import { procesarCola, renderizarEmail, transporteMemoria, MAX_INTENTOS } from '../emails/cola';
import { NOMBRES_PLANTILLAS } from '../emails/plantillas';
import { datosEjemplo } from '../emails/ejemplos';
import { reloj } from '../lib/reloj';
import { reiniciarBd } from './ayudas';

beforeEach(async () => {
  await reiniciarBd();
  transporteMemoria.enviados = [];
  transporteMemoria.fallosPendientes = 0;
});

describe('plantillas', () => {
  it.each(NOMBRES_PLANTILLAS)('%s se maqueta con sus datos de ejemplo', (nombre) => {
    const { asunto, html, texto } = renderizarEmail(nombre, datosEjemplo[nombre]);
    expect(asunto.length).toBeGreaterThan(5);
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).not.toMatch(/undefined|NaN|\[object Object\]/);
    expect(texto).not.toMatch(/undefined|NaN|\[object Object\]/);
  });

  it('hay datos de ejemplo para todas las plantillas', () => {
    expect(Object.keys(datosEjemplo).sort()).toEqual([...NOMBRES_PLANTILLAS].sort());
  });

  it('escapa lo que escribe el usuario (XSS)', () => {
    const { html } = renderizarEmail('CITA_SOLICITADA', { ...datosEjemplo.CITA_SOLICITADA, problema: '<img src=x onerror=alert(1)>' });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('el botón solo enlaza a la web del taller', () => {
    const { html } = renderizarEmail('BIENVENIDA', { nombre: 'Ana', enlace: 'javascript:alert(1)' });
    expect(html).not.toContain('javascript:');
    const otro = renderizarEmail('BIENVENIDA', { nombre: 'Ana', enlace: 'https://malo.example/robar' });
    expect(otro.html).not.toContain('malo.example');
  });
});

describe('bandeja de salida', () => {
  const encolar = (datos: object = { nombre: 'Ana', enlace: 'http://localhost:3000/' }) =>
    prisma.emailSaliente.create({ data: { para: 'ana@cliente.test', plantilla: 'BIENVENIDA', datos } });

  it('envía lo pendiente y lo marca como enviado', async () => {
    await encolar();
    expect(await procesarCola(transporteMemoria)).toEqual({ enviados: 1, fallidos: 0 });
    expect(transporteMemoria.enviados[0].asunto).toBe('Bienvenido a TallerPro');
    expect((await prisma.emailSaliente.findFirstOrThrow()).estado).toBe('ENVIADO');
    expect(await procesarCola(transporteMemoria)).toEqual({ enviados: 0, fallidos: 0 });
  });

  it('si SMTP falla, reintenta más tarde con espera creciente y no se pierde', async () => {
    reloj.fijar(new Date('2026-11-09T09:00:00Z'));
    await encolar();
    transporteMemoria.fallosPendientes = 1;
    expect(await procesarCola(transporteMemoria)).toEqual({ enviados: 0, fallidos: 1 });
    const e = await prisma.emailSaliente.findFirstOrThrow();
    expect(e).toMatchObject({ estado: 'PENDIENTE', intentos: 1 });
    expect(e.ultimoError).toMatch(/SMTP/);
    expect(await procesarCola(transporteMemoria)).toEqual({ enviados: 0, fallidos: 0 }); // aún no toca
    reloj.fijar(new Date('2026-11-09T09:01:01Z'));
    expect(await procesarCola(transporteMemoria)).toEqual({ enviados: 1, fallidos: 0 });
  });

  it('tras el máximo de intentos queda como FALLIDO', async () => {
    await prisma.emailSaliente.create({ data: { para: 'a@b.es', plantilla: 'BIENVENIDA', datos: { nombre: 'A', enlace: '/' }, intentos: MAX_INTENTOS - 1 } });
    transporteMemoria.fallosPendientes = 1;
    await procesarCola(transporteMemoria);
    expect((await prisma.emailSaliente.findFirstOrThrow()).estado).toBe('FALLIDO');
  });

  it('una plantilla desconocida falla sin reintentos y no bloquea al resto', async () => {
    await prisma.emailSaliente.create({ data: { para: 'a@b.es', plantilla: 'NO_EXISTE', datos: {} } });
    await encolar();
    expect(await procesarCola(transporteMemoria)).toEqual({ enviados: 1, fallidos: 1 });
    expect((await prisma.emailSaliente.findFirstOrThrow({ where: { plantilla: 'NO_EXISTE' } })).estado).toBe('FALLIDO');
  });

  it('dos procesos a la vez no envían el mismo email dos veces', async () => {
    for (let i = 0; i < 10; i++) await encolar();
    const [a, b] = await Promise.all([procesarCola(transporteMemoria), procesarCola(transporteMemoria)]);
    expect(a.enviados + b.enviados).toBe(10);
    expect(transporteMemoria.enviados).toHaveLength(10);
  });
});

describe('diseño', () => {
  it('el botón de acción va centrado', () => {
    const { html } = renderizarEmail('BIENVENIDA', { nombre: 'Ana', enlace: 'http://localhost:3000/reservar' });
    expect(html).toMatch(/<table role="presentation" align="center"[^>]*style="margin:0 auto;"><tr><td style="background:#01687D;border-radius:20px;"><a href="http:\/\/localhost:3000\/reservar"/);
  });
});
