import { expect, test } from '@playwright/test';
import { LUNES_7, entrarComo, fijarHora, reiniciar } from './ayudas';

// Listados paginados: tamaño de página, navegación, orden y estado en la URL (se puede recargar y compartir).
test.beforeEach(async ({ page, request }) => {
  await reiniciar(request);
  await fijarHora(page, LUNES_7);
});

test('el dueño recorre los usuarios por páginas, cambia el tamaño y el orden, y la URL lo recuerda', async ({ page }) => {
  // 16 clientes + los 4 usuarios del taller de pruebas = 20 (el acceso admite 20 entradas por minuto).
  for (let i = 1; i <= 16; i++) await entrarComo(page, `cliente${String(i).padStart(2, '0')}@x.test`);
  await entrarComo(page, 'dueno@taller.test');
  // El tamaño de página llega en la URL.
  await page.goto('/dueno/usuarios?porPagina=10');
  const filas = page.getByRole('table').getByRole('row');
  const paginacion = page.getByRole('navigation', { name: 'Paginación de usuarios' });
  await expect(paginacion.getByText('1–10 de 20 usuarios')).toBeVisible();
  await expect(filas).toHaveCount(11); // cabecera + 10

  await paginacion.getByRole('button', { name: 'Ir a la página 2' }).click();
  await expect(paginacion.getByText('11–20 de 20 usuarios')).toBeVisible();
  await expect(page).toHaveURL(/[?&]pagina=2/);

  // Tras recargar sigue en la página 2.
  await page.reload();
  await expect(paginacion.getByText('11–20 de 20 usuarios')).toBeVisible();

  // Ordenar por email desde la cabecera de la tabla vuelve a la página 1; pulsar otra vez invierte el orden.
  await page.getByRole('button', { name: 'Email' }).click();
  await expect(paginacion.getByText('1–10 de 20 usuarios')).toBeVisible();
  await expect(filas.nth(1)).toContainText('cliente01@x.test');
  await page.getByRole('button', { name: 'Email' }).click();
  await expect(filas.nth(1)).not.toContainText('cliente01@x.test');
  await paginacion.getByRole('button', { name: 'Última página' }).click();
  await expect(filas.last()).toContainText('cliente01@x.test');

  // 25 por página: caben todos.
  await paginacion.getByLabel('Por página').click();
  await page.getByRole('option', { name: '25', exact: true }).click();
  await expect(paginacion.getByText('20 usuarios', { exact: true })).toBeVisible();
  await expect(filas).toHaveCount(21);

  // Un filtro cuenta en el total.
  await page.getByLabel('Buscar').fill('cliente0');
  await expect(paginacion.getByText('9 usuarios', { exact: true })).toBeVisible();
});
