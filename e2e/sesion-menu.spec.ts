import { expect, test } from '@playwright/test';
import { LUNES_7, entrarComo, fijarHora, reiniciar } from './ayudas';

test.beforeEach(async ({ page, request }) => {
  await reiniciar(request);
  await fijarHora(page, LUNES_7);
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
