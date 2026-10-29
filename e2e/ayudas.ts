import { expect, type APIRequestContext, type Page } from '@playwright/test';

/** Lunes 9 de noviembre de 2026, 07:00 en Madrid: antes de abrir el taller. */
export const LUNES_7 = '2026-11-09T06:00:00.000Z';

export async function reiniciar(request: APIRequestContext) {
  const r = await request.post('/api/test/reiniciar', { data: {} });
  expect(r.ok()).toBeTruthy();
}

/** Fija la hora en el servidor y en el navegador, para que «hoy» sea el mismo en ambos. */
export async function fijarHora(page: Page, iso: string) {
  const r = await page.request.post('/api/test/reloj', { data: { ahora: iso } });
  expect(r.ok()).toBeTruthy();
  await page.clock.setFixedTime(new Date(iso));
}

/** Entra sin Google (ruta solo de pruebas). La cookie queda en el contexto del navegador. */
export async function entrarComo(page: Page, email: string) {
  await page.context().clearCookies();
  const r = await page.request.post('/api/auth/test-login', { data: { email } });
  expect(r.ok(), await r.text()).toBeTruthy();
  return r.json();
}

export async function emails(request: APIRequestContext, para: string): Promise<string[]> {
  const r = await request.get(`/api/test/emails?para=${encodeURIComponent(para)}`);
  return (await r.json()).datos.map((e: { plantilla: string }) => e.plantilla);
}

/** Cliente con perfil y un vehículo, creado por la API (para los tests que no prueban ese flujo). */
export async function clienteListo(page: Page, email = 'ana@cliente.test', matricula = '1234ABC', empresa = false) {
  await entrarComo(page, email);
  await page.request.put('/api/perfil', { data: empresa ? { tipo: 'EMPRESA', telefono: '600111222', razonSocial: 'Flotas SL', nif: 'B12345678' } : { tipo: 'INDIVIDUAL', telefono: '600111222' } });
  const v = await page.request.post('/api/vehiculos', { data: { matricula, marca: 'Volkswagen', modelo: 'Golf', kilometros: 98000 } });
  return (await v.json()).id as string;
}

/** Instante ISO de una hora de Madrid en noviembre (UTC+1). */
export const madrid = (dia: string, hhmm: string) => new Date(`${dia}T${hhmm}:00+01:00`).toISOString();
