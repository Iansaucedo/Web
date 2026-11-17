import { expect, test } from '@playwright/test';
import { LUNES_7, entrarComo, fijarHora, reiniciar } from './ayudas';

test.beforeEach(async ({ page, request }) => {
  await reiniciar(request);
  await fijarHora(page, LUNES_7);
});

test('escritorio estrecho (< 900 px): el menú plegable se cierra y no reaparece al ensanchar y volver a estrechar', async ({ page }) => {
  await page.setViewportSize({ width: 850, height: 800 });
  await entrarComo(page, 'jefe@taller.test');
  await page.goto('/jefe');
  const abrir = page.getByRole('button', { name: 'Abrir menú' });
  const menu = page.getByRole('navigation', { name: 'Menú principal' });
  await abrir.click();
  await expect(menu).toBeVisible();
  await page.mouse.click(700, 400);
  await expect(menu).toBeHidden();
  // Abierto y luego a escritorio: el menú fijo se ve y la hamburguesa desaparece.
  await abrir.click();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(abrir).toBeHidden();
  await expect(menu).toBeVisible();
  // De vuelta a estrecho: el menú no reaparece abierto solo.
  await page.setViewportSize({ width: 850, height: 800 });
  await expect(menu).toBeHidden();
  await expect(abrir).toBeVisible();
});

test('una cookie de sesión que ya no vale lleva al login una sola vez (antes, bucle /login ↔ /)', async ({ page, context }) => {
  await context.addCookies([{ name: 'taller_sesion', value: 'token.que-ya-no.vale', url: 'http://localhost:3100' }]);
  let peticiones = 0;
  page.on('request', (r) => { if (r.url().includes('/api/auth/me')) peticiones++; });
  await page.goto('/jefe');
  await expect(page).toHaveURL(/\/login/);
  await page.waitForTimeout(1500);
  await expect(page).toHaveURL(/\/login/);
  expect(peticiones).toBeLessThanOrEqual(2);
  expect((await context.cookies()).some((c) => c.name === 'taller_sesion')).toBe(false);
});

test('si la API no responde, se avisa y se reintenta sin salir de la página', async ({ page }) => {
  await entrarComo(page, 'jefe@taller.test');
  await page.route('**/api/auth/me', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"caída","codigo":"NO_DISPONIBLE"}' }));
  await page.goto('/jefe');
  await expect(page.getByRole('heading', { name: 'No podemos conectar con el taller' })).toBeVisible();
  await expect(page).toHaveURL(/\/jefe$/);
  await page.unroute('**/api/auth/me');
  await page.getByRole('button', { name: 'Reintentar ahora' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Panel del taller' })).toBeVisible();
});
