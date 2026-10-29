import { expect, test } from '@playwright/test';
import { LUNES_7, clienteListo, entrarComo, fijarHora, madrid, reiniciar } from './ayudas';

// Batería de QA: intentar romper la aplicación como lo haría un usuario torpe o malintencionado.

test.beforeEach(async ({ page, request }) => {
  await reiniciar(request);
  await fijarHora(page, LUNES_7);
});

test.describe('Acceso y sesión', () => {
  test('sin sesión, cualquier página lleva al login y vuelve después', async ({ page }) => {
    await page.goto('/jefe/citas');
    await expect(page).toHaveURL(/\/login\?volver=%2Fjefe%2Fcitas/);
    await expect(page.getByRole('link', { name: 'Continuar con Google' })).toBeVisible();
  });

  test('una cookie falsificada no da acceso', async ({ page, context }) => {
    await context.addCookies([{ name: 'taller_sesion', value: 'eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4Iiwicm9sIjoiRFVFTk8ifQ.', url: 'http://localhost:3100' }]);
    await page.goto('/dueno');
    await expect(page).toHaveURL(/\/login/);
  });

  test('un cliente que escribe la URL del jefe ve «No tienes acceso» y la API responde 403', async ({ page }) => {
    await clienteListo(page);
    await page.goto('/jefe/citas');
    await expect(page.getByRole('heading', { name: 'No tienes acceso' })).toBeVisible();
    expect((await page.request.get('/api/citas?fecha=2026-11-09')).status()).toBe(200); // solo ve las suyas
    expect((await page.request.post('/api/pedidos/x/aprobar', { data: {} })).status()).toBe(403);
    expect((await page.request.get('/api/usuarios')).status()).toBe(403);
  });

  test('la orden de otro cliente no existe para él (no se filtra que existe)', async ({ page }) => {
    const vehiculoId = await clienteListo(page);
    const cita = await (await page.request.post('/api/citas', { data: { vehiculoId, inicio: madrid('2026-11-09', '09:00'), descripcionProblema: 'x' } })).json();
    await entrarComo(page, 'jefe@taller.test');
    const orden = await (await page.request.post(`/api/citas/${cita.id}/recibir`, { data: { kmEntrada: 98000 } })).json();
    await clienteListo(page, 'luis@cliente.test', '9999XYZ');
    await page.goto(`/ordenes/${orden.id}`);
    await expect(page.getByRole('alert').filter({ hasText: 'La orden no existe' })).toBeVisible();
    expect((await page.request.get(`/api/ordenes/${orden.id}/factura.pdf`)).status()).toBe(404);
  });

  test('cerrar sesión y volver atrás no muestra datos', async ({ page }) => {
    await clienteListo(page);
    await page.goto('/vehiculos');
    await expect(page.getByTestId('vehiculo')).toBeVisible();
    await page.getByRole('button', { name: /ana/ }).click();
    await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goBack();
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('Entradas hostiles a la API', () => {
  test('sin application/json: 415; JSON roto: 400; cuerpo enorme: 413', async ({ page }) => {
    await clienteListo(page);
    const texto = await page.request.post('/api/vehiculos', { headers: { 'Content-Type': 'text/plain' }, data: 'matricula=1' });
    expect(texto.status()).toBe(415);
    const roto = await page.request.post('/api/vehiculos', { headers: { 'Content-Type': 'application/json' }, data: '{"matricula":' });
    expect(roto.status()).toBe(400);
    const enorme = await page.request.post('/api/vehiculos', { data: { matricula: '1', marca: 'x'.repeat(300_000), modelo: 'y' } });
    expect(enorme.status()).toBe(413);
    for (const r of [texto, roto, enorme]) expect(await r.text()).not.toMatch(/at .+\.(ts|js):\d+/);
  });

  test('cantidades negativas, cero y decimales en piezas y horas', async ({ page }) => {
    const vehiculoId = await clienteListo(page);
    const cita = await (await page.request.post('/api/citas', { data: { vehiculoId, inicio: madrid('2026-11-09', '09:00'), descripcionProblema: 'x' } })).json();
    await entrarComo(page, 'jefe@taller.test');
    const orden = await (await page.request.post(`/api/citas/${cita.id}/recibir`, { data: { kmEntrada: 98000 } })).json();
    await entrarComo(page, 'mecanico@taller.test');
    for (const horas of [-1, 1000, 0.33]) {
      const r = await page.request.post(`/api/ordenes/${orden.id}/solicitudes`, { data: { partidas: [{ descripcion: 'Trabajo', horasEstimadas: horas, piezasEstimadasCentimos: 0 }] } });
      expect(r.status(), `horas ${horas}`).toBe(400);
    }
    const piezas = await (await page.request.get('/api/piezas')).json();
    for (const cantidad of [-3, 0, 1.5, '2']) {
      const r = await page.request.post('/api/partidas/cualquiera/piezas-usadas', { data: { piezaId: piezas.datos[0].id, cantidad } });
      expect(r.status(), `cantidad ${cantidad}`).toBe(400);
    }
  });

  test('búsquedas con inyección SQL o comodines no rompen nada', async ({ page }) => {
    await entrarComo(page, 'jefe@taller.test');
    for (const q of ["' OR 1=1 --", '%', '_', '\\', '"; DROP TABLE "Usuario"; --']) {
      expect((await page.request.get(`/api/vehiculos?q=${encodeURIComponent(q)}`)).status()).toBe(200);
      expect((await page.request.get(`/api/ordenes?q=${encodeURIComponent(q)}`)).status()).toBe(200);
    }
    expect((await page.request.get('/api/ready')).status()).toBe(200);
  });

  test('parámetros de query anidados (?estado[$ne]=x) se rechazan', async ({ page }) => {
    await entrarComo(page, 'jefe@taller.test');
    const r = await page.request.get('/api/ordenes?estado[$ne]=ENTREGADA');
    expect(r.status()).toBe(400);
    expect((await r.json()).codigo).toBe('VALIDACION');
  });
});

test.describe('XSS', () => {
  test('el texto del cliente se muestra como texto en la pantalla del jefe y en el email', async ({ page, request }) => {
    const vehiculoId = await clienteListo(page);
    const malicioso = '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>';
    await page.request.post('/api/citas', { data: { vehiculoId, inicio: madrid('2026-11-09', '09:00'), descripcionProblema: malicioso } });
    await entrarComo(page, 'jefe@taller.test');
    await page.goto('/jefe/citas');
    await expect(page.getByTestId('cita')).toContainText('<img src=x');
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    const e = await (await request.get('/api/test/emails?para=jefe@taller.test')).json();
    expect(e.datos[0].plantilla).toBe('CITA_NUEVA_TALLER');
  });
});

test.describe('Dobles clics y carreras', () => {
  test('doble clic en «Solicitar cita» crea una sola cita', async ({ page }) => {
    await clienteListo(page);
    await page.goto('/reservar');
    await page.getByLabel('Vehículo').click();
    await page.getByRole('option', { name: /1234ABC/ }).click();
    await page.getByRole('option', { name: /lun, 9 nov/ }).click();
    await page.getByRole('button', { name: '09:00' }).click();
    await page.getByLabel('Describe el problema').fill('Ruido');
    await page.getByRole('button', { name: 'Revisar y confirmar' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Solicitar cita' }).dblclick();
    await expect(page).toHaveURL(/\/ordenes$/);
    expect((await (await page.request.get('/api/citas')).json()).datos).toHaveLength(1);
  });

  test('cinco clientes a la vez por las dos últimas plazas: entran dos', async ({ browser, page }) => {
    await page.request.post('/api/test/reloj', { data: { ahora: LUNES_7 } });
    const contextos = await Promise.all(Array.from({ length: 5 }, () => browser.newContext({ baseURL: 'http://localhost:3100' })));
    const paginas = await Promise.all(contextos.map((c) => c.newPage()));
    // Un mecánico menos: capacidad del día = 2 (1 mecánico × 2 vehículos).
    await entrarComo(page, 'jefe@taller.test');
    const mecs = (await (await page.request.get('/api/mecanicos')).json()).datos;
    const aus = await page.request.post('/api/ausencias', { data: { empleadoId: mecs[1].empleadoId, desde: '2026-11-10', tipo: 'OTRA' } });
    expect(aus.status()).toBe(201);
    const ids = await Promise.all(paginas.map((p, i) => clienteListo(p, `c${i}@cliente.test`, `100${i}AAA`)));
    const r = await Promise.all(paginas.map((p, i) => p.request.post('/api/citas', { data: { vehiculoId: ids[i], inicio: madrid('2026-11-10', i % 2 ? '09:00' : '10:00'), descripcionProblema: 'x' } })));
    expect(r.filter((x) => x.status() === 201)).toHaveLength(2);
    expect(r.filter((x) => x.status() === 409)).toHaveLength(3);
    await Promise.all(contextos.map((c) => c.close()));
  });

  test('responder dos veces el mismo presupuesto desde dos pestañas: la segunda recibe un error claro', async ({ page, context }) => {
    const vehiculoId = await clienteListo(page);
    const cita = await (await page.request.post('/api/citas', { data: { vehiculoId, inicio: madrid('2026-11-09', '09:00'), descripcionProblema: 'x' } })).json();
    await entrarComo(page, 'jefe@taller.test');
    const orden = await (await page.request.post(`/api/citas/${cita.id}/recibir`, { data: { kmEntrada: 98000 } })).json();
    await entrarComo(page, 'mecanico@taller.test');
    await page.request.post(`/api/ordenes/${orden.id}/solicitudes`, { data: { partidas: [{ descripcion: 'Cambiar aceite', horasEstimadas: 0.5, piezasEstimadasCentimos: 3000 }] } });
    await entrarComo(page, 'ana@cliente.test');
    const otra = await context.newPage();
    await page.goto(`/ordenes/${orden.id}`);
    await otra.goto(`/ordenes/${orden.id}`);
    for (const p of [page, otra]) await p.getByTestId('responder').getByRole('button', { name: 'Aceptar' }).click();
    await page.getByRole('button', { name: 'Enviar respuesta' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Enviar' }).click();
    await expect(page.getByTestId('responder')).toHaveCount(0);
    await otra.getByRole('button', { name: 'Enviar respuesta' }).click();
    await otra.getByRole('dialog').getByRole('button', { name: 'Enviar' }).click();
    await expect(otra.getByRole('dialog').getByRole('alert')).toContainText('ya está respondida');
  });

  test('fichar entrada dos veces seguidas (doble toque en la tablet) registra una', async ({ page }) => {
    await entrarComo(page, 'mecanico@taller.test');
    await page.goto('/mecanico');
    await page.getByRole('button', { name: 'Fichar entrada' }).dblclick();
    await expect(page.getByTestId('fichaje')).toContainText('Trabajando');
    const hoy = await (await page.request.get('/api/fichajes/hoy')).json();
    expect(hoy.fichajes).toHaveLength(1);
    expect((await page.request.post('/api/fichajes', { data: { tipo: 'ENTRADA' } })).status()).toBe(409);
    expect((await page.request.post('/api/fichajes', { data: { tipo: 'FIN_PAUSA' } })).status()).toBe(409);
  });
});

test.describe('Reglas de negocio desde la interfaz', () => {
  test('con menos de 24 h el botón de cancelar está desactivado y la API lo rechaza', async ({ page }) => {
    const vehiculoId = await clienteListo(page);
    const cita = await (await page.request.post('/api/citas', { data: { vehiculoId, inicio: madrid('2026-11-09', '17:00'), descripcionProblema: 'x' } })).json();
    await page.goto('/ordenes');
    await expect(page.getByRole('button', { name: 'Cancelar la cita' })).toBeDisabled();
    const r = await page.request.post(`/api/citas/${cita.id}/cancelar`, { data: {} });
    expect((await r.json()).codigo).toBe('FUERA_DE_PLAZO');
  });

  test('no se puede completar con trabajos sin terminar; la interfaz dice por qué', async ({ page }) => {
    const vehiculoId = await clienteListo(page);
    const cita = await (await page.request.post('/api/citas', { data: { vehiculoId, inicio: madrid('2026-11-09', '09:00'), descripcionProblema: 'x' } })).json();
    await entrarComo(page, 'jefe@taller.test');
    const orden = await (await page.request.post(`/api/citas/${cita.id}/recibir`, { data: { kmEntrada: 98000 } })).json();
    await entrarComo(page, 'mecanico@taller.test');
    const s = await (await page.request.post(`/api/ordenes/${orden.id}/solicitudes`, { data: { partidas: [{ descripcion: 'Cambiar aceite', horasEstimadas: 0.5, piezasEstimadasCentimos: 0 }] } })).json();
    await entrarComo(page, 'ana@cliente.test');
    await page.request.post(`/api/solicitudes/${s.id}/responder`, { data: { decisiones: { [s.partidas[0].id]: 'ACEPTADA' } } });
    await entrarComo(page, 'mecanico@taller.test');
    await page.goto(`/mecanico/ordenes/${orden.id}`);
    await expect(page.getByRole('button', { name: 'Marcar completada' })).toBeDisabled();
    await expect(page.getByText('Para completar: termina el trabajo en curso.')).toBeVisible();
    expect((await (await page.request.post(`/api/ordenes/${orden.id}/completar`, { data: { kmSalida: 98100 } })).json()).codigo).toBe('NO_COMPLETABLE');
  });

  test('usar más piezas de las que hay: aviso en el formulario y 409 en la API', async ({ page }) => {
    const vehiculoId = await clienteListo(page);
    const cita = await (await page.request.post('/api/citas', { data: { vehiculoId, inicio: madrid('2026-11-09', '09:00'), descripcionProblema: 'x' } })).json();
    await entrarComo(page, 'jefe@taller.test');
    const orden = await (await page.request.post(`/api/citas/${cita.id}/recibir`, { data: { kmEntrada: 98000 } })).json();
    await entrarComo(page, 'mecanico@taller.test');
    const s = await (await page.request.post(`/api/ordenes/${orden.id}/solicitudes`, { data: { partidas: [{ descripcion: 'Cambiar aceite', horasEstimadas: 0.5, piezasEstimadasCentimos: 0 }] } })).json();
    await entrarComo(page, 'ana@cliente.test');
    await page.request.post(`/api/solicitudes/${s.id}/responder`, { data: { decisiones: { [s.partidas[0].id]: 'ACEPTADA' } } });
    await entrarComo(page, 'mecanico@taller.test');
    await page.goto(`/mecanico/ordenes/${orden.id}`);
    await page.getByRole('button', { name: 'Registrar pieza' }).click();
    const d = page.getByRole('dialog');
    await d.getByLabel('Pieza').click();
    await page.getByRole('option', { name: /Aceite 5W30/ }).click();
    await d.getByLabel('Cantidad').fill('3');
    await expect(d.getByText('Solo hay 1. Pídela en la pestaña «Pedir»')).toBeVisible();
    await expect(d.getByRole('button', { name: 'Registrar' })).toBeDisabled();
    const piezas = await (await page.request.get('/api/piezas?q=AC-5W30')).json();
    const r = await page.request.post(`/api/partidas/${s.partidas[0].id}/piezas-usadas`, { data: { piezaId: piezas.datos[0].id, cantidad: 3 } });
    expect((await r.json()).codigo).toBe('STOCK_INSUFICIENTE');
  });

  test('la reserva no ofrece días completos ni franjas pasadas', async ({ page }) => {
    await clienteListo(page);
    await fijarHora(page, '2026-11-09T11:10:00.000Z'); // 12:10
    await page.goto('/reservar');
    await page.getByRole('option', { name: /lun, 9 nov/ }).click();
    await expect(page.getByRole('button', { name: '12:00' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '12:30' })).toBeVisible();
    await expect(page.getByRole('option', { name: /sáb, 14 nov/ })).toHaveCount(0);
  });

  test('un jefe no se corrige sus propios fichajes', async ({ page }) => {
    await entrarComo(page, 'jefe@taller.test');
    const f = await (await page.request.post('/api/fichajes', { data: { tipo: 'ENTRADA' } })).json();
    const r = await page.request.post(`/api/fichajes/${f.id}/corregir`, { data: { hora: '06:00', motivo: 'yo' } });
    expect(r.status()).toBe(403);
  });
});
