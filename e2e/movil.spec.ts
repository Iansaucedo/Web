import { expect, test } from '@playwright/test';
import { LUNES_7, clienteListo, entrarComo, fijarHora, reiniciar } from './ayudas';

// Versión móvil (Pixel 7): menú lateral plegable, sin scroll horizontal y fichaje usable con el pulgar.
test.beforeEach(async ({ page, request }) => {
  await reiniciar(request);
  await fijarHora(page, LUNES_7);
});

const sinScrollHorizontal = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

test('el cliente navega con el menú plegable y reserva sin scroll horizontal', async ({ page }) => {
  await clienteListo(page);
  await page.goto('/ordenes');
  await expect(page.getByRole('navigation', { name: 'Menú principal' })).toBeHidden();
  await page.getByRole('button', { name: 'Abrir menú' }).click();
  await page.getByRole('link', { name: 'Reservar cita' }).click();
  await expect(page).toHaveURL(/\/reservar$/);
  await page.getByRole('option', { name: /lun, 9 nov/ }).click();
  await expect(page.getByRole('button', { name: '09:00' })).toBeVisible();
  expect(await sinScrollHorizontal(page)).toBe(true);
});

test('el mecánico ficha desde el móvil con botones grandes', async ({ page }) => {
  await entrarComo(page, 'mecanico@taller.test');
  await page.goto('/mecanico');
  const boton = page.getByRole('button', { name: 'Fichar entrada' });
  const caja = await boton.boundingBox();
  expect(caja!.height).toBeGreaterThanOrEqual(48);
  await boton.tap();
  await expect(page.getByTestId('fichaje')).toContainText('Trabajando');
  expect(await sinScrollHorizontal(page)).toBe(true);
});

test('las tablas del jefe no rompen el ancho de la pantalla', async ({ page }) => {
  await entrarComo(page, 'jefe@taller.test');
  for (const ruta of ['/jefe', '/jefe/citas', '/jefe/personal', '/jefe/jornadas', '/jefe/piezas']) {
    await page.goto(ruta);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await sinScrollHorizontal(page), ruta).toBe(true);
  }
});

test('con una empresa en espera, /jefe/empresas no ensancha la página (texto oculto de la cabecera de la tabla)', async ({ page }) => {
  await entrarComo(page, 'flota@empresa.test');
  await page.request.put('/api/perfil', { data: { tipo: 'EMPRESA', telefono: '942000000', razonSocial: 'Transportes Cantábricos del Norte SL', nif: 'B12345678' } });
  const ids: string[] = [];
  for (const m of ['1111AAA', '2222BBB']) ids.push((await (await page.request.post('/api/vehiculos', { data: { matricula: m, marca: 'Ford', modelo: 'Transit' } })).json()).id);
  expect((await page.request.post('/api/reservas-multiples', { data: { vehiculoIds: ids, fechasPreferidas: ['2026-11-11'] } })).ok()).toBeTruthy();
  await entrarComo(page, 'jefe@taller.test');
  await page.goto('/jefe/empresas');
  await expect(page.getByTestId('reserva')).toBeVisible();
  expect(await sinScrollHorizontal(page)).toBe(true);
});

test('el menú plegable se cierra al tocar fuera y al elegir una página', async ({ page }) => {
  await entrarComo(page, 'jefe@taller.test');
  await page.goto('/jefe');
  const menu = page.getByRole('navigation', { name: 'Menú principal' });
  await page.getByRole('button', { name: 'Abrir menú' }).click();
  await expect(menu).toBeVisible();
  await page.touchscreen.tap(380, 400); // fuera del panel de 280 px
  await expect(menu).toBeHidden();
  await page.getByRole('button', { name: 'Abrir menú' }).click();
  await page.getByRole('link', { name: 'Órdenes' }).click();
  await expect(page).toHaveURL(/\/jefe\/ordenes$/);
  await expect(menu).toBeHidden();
});
