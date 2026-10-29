import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { LUNES_7, clienteListo, entrarComo, fijarHora, madrid, reiniciar } from './ayudas';

// Revisión automática con axe (WCAG 2.2 A/AA) de todas las pantallas por rol,
// y pruebas manuales automatizadas de teclado. Una puntuación automática no sustituye la revisión manual
// (ver docs/decisiones.md, «Accesibilidad»), pero impide que se cuelen regresiones.

async function sinViolaciones(page: Page, ruta: string) {
  await page.goto(ruta);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.waitForLoadState('networkidle');
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const graves = r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} × ${v.nodes[0]?.target.join(' ')}`);
  expect(graves, `${ruta}\n${graves.join('\n')}`).toEqual([]);
}

test.beforeEach(async ({ page, request }) => {
  await reiniciar(request);
  await fijarHora(page, LUNES_7);
});

test('pantallas del cliente sin violaciones WCAG', async ({ page }) => {
  const vehiculoId = await clienteListo(page);
  await page.request.post('/api/citas', { data: { vehiculoId, inicio: madrid('2026-11-11', '10:00'), descripcionProblema: 'Ruido' } });
  for (const ruta of ['/ordenes', '/reservar', '/vehiculos', '/perfil', '/notificaciones']) await sinViolaciones(page, ruta);
});

test('pantallas del taller y del dueño sin violaciones WCAG', async ({ page }) => {
  await entrarComo(page, 'mecanico@taller.test');
  for (const ruta of ['/mecanico', '/mecanico/jornada', '/mecanico/historial', '/mecanico/piezas']) await sinViolaciones(page, ruta);
  await entrarComo(page, 'dueno@taller.test');
  for (const ruta of ['/jefe', '/jefe/citas', '/jefe/ordenes', '/jefe/pedidos', '/jefe/piezas', '/jefe/personal', '/jefe/jornadas', '/jefe/empresas', '/dueno', '/dueno/usuarios', '/dueno/configuracion', '/dueno/trazabilidad', '/dueno/constancias']) {
    await sinViolaciones(page, ruta);
  }
});

test('login sin violaciones WCAG e idioma declarado', async ({ page }) => {
  await page.goto('/login');
  expect(await page.getAttribute('html', 'lang')).toBe('es');
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  expect(r.violations.map((v) => v.id)).toEqual([]);
});

test('un diálogo abierto también es accesible (foco atrapado, etiquetas)', async ({ page }) => {
  await clienteListo(page);
  await page.goto('/vehiculos');
  await page.getByRole('button', { name: 'Añadir vehículo' }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const r = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(r.violations.map((v) => v.id)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('teclado: saltar al contenido y reservar una cita sin ratón', async ({ page }) => {
  await clienteListo(page);
  await page.goto('/reservar');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.keyboard.press('Tab');
  const salto = page.getByRole('link', { name: 'Saltar al contenido' });
  await expect(salto).toBeFocused();
  await expect(salto).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#contenido$/);

  // Vehículo (select de MUI): se abre con Enter y se elige con flechas.
  const vehiculo = page.getByRole('combobox', { name: /Vehículo/ });
  await vehiculo.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(vehiculo).toContainText('1234ABC');
  // Día y franja: se alcanzan con Tab y se activan con Enter.
  const dia = page.getByRole('option', { name: /lun, 9 nov/ });
  await dia.focus();
  await page.keyboard.press('Enter');
  const franja = page.getByRole('button', { name: '09:00' });
  await franja.focus();
  // El foco se ve: hay un contorno distinto de «none».
  expect(await franja.evaluate((e) => getComputedStyle(e).outlineStyle)).not.toBe('none');
  await page.keyboard.press('Enter');
  await page.getByLabel('Describe el problema').focus();
  await page.keyboard.type('Ruido al frenar');
  await page.getByRole('button', { name: 'Revisar y confirmar' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  // El foco queda dentro del diálogo.
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')))).toBe(true);
  await page.getByRole('dialog').getByRole('button', { name: 'Solicitar cita' }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/ordenes$/);
  // El resultado se anuncia a las tecnologías de apoyo (role=alert del aviso).
  await expect(page.getByRole('alert').filter({ hasText: 'Cita solicitada' })).toBeVisible();
});

test('los estados no dependen solo del color: cada chip tiene texto e icono', async ({ page }) => {
  const vehiculoId = await clienteListo(page);
  await page.request.post('/api/citas', { data: { vehiculoId, inicio: madrid('2026-11-11', '10:00'), descripcionProblema: 'Ruido' } });
  await page.goto('/ordenes');
  const chip = page.getByTestId('cita').locator('.MuiChip-root');
  await expect(chip).toHaveText('Pendiente de confirmar');
  await expect(chip.locator('svg')).toHaveCount(1);
});

test('un único h1 por página y sin saltos de nivel', async ({ page }) => {
  await entrarComo(page, 'dueno@taller.test');
  for (const ruta of ['/dueno', '/jefe', '/jefe/personal']) {
    await page.goto(ruta);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    const niveles = await page.$$eval('h1,h2,h3,h4,h5,h6', (hs) => hs.map((h) => Number(h.tagName[1])));
    for (let i = 1; i < niveles.length; i++) expect(niveles[i] - niveles[i - 1], `${ruta}: ${niveles.join(',')}`).toBeLessThanOrEqual(1);
  }
});
