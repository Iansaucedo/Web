import { expect, test, type Page } from '@playwright/test';
import { LUNES_7, clienteListo, emails, entrarComo, fijarHora, madrid, reiniciar } from './ayudas';

test.beforeEach(async ({ page, request }) => {
  await reiniciar(request);
  await fijarHora(page, LUNES_7);
});

/** Orden en reparación con un trabajo aceptado, montada por la API. */
async function ordenEnReparacion(page: Page) {
  const vehiculoId = await clienteListo(page);
  const cita = await (await page.request.post('/api/citas', { data: { vehiculoId, inicio: madrid('2026-11-09', '09:00'), descripcionProblema: 'Ruido' } })).json();
  await entrarComo(page, 'jefe@taller.test');
  const orden = await (await page.request.post(`/api/citas/${cita.id}/recibir`, { data: { kmEntrada: 98500 } })).json();
  await entrarComo(page, 'mecanico@taller.test');
  const s = await (await page.request.post(`/api/ordenes/${orden.id}/solicitudes`, { data: { partidas: [{ descripcion: 'Sustituir sensor ABS', horasEstimadas: 1, piezasEstimadasCentimos: 9000 }] } })).json();
  await entrarComo(page, 'ana@cliente.test');
  await page.request.post(`/api/solicitudes/${s.id}/responder`, { data: { decisiones: { [s.partidas[0].id]: 'ACEPTADA' } } });
  return orden.id as string;
}

test('Cancelar una cita: el cliente la cancela con más de 24 h y la franja queda libre', async ({ page, request }) => {
  const vehiculoId = await clienteListo(page);
  await page.request.post('/api/citas', { data: { vehiculoId, inicio: madrid('2026-11-11', '10:00'), descripcionProblema: 'Revisión' } });
  await page.goto('/ordenes');
  await page.getByRole('button', { name: 'Cancelar la cita' }).click();
  await page.getByRole('dialog').getByLabel('Motivo (opcional)').fill('Me viene mal');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar cita' }).click();
  await expect(page.getByText('No tienes citas pendientes.')).toBeVisible();
  expect(await emails(request, 'ana@cliente.test')).toContain('CITA_CANCELADA');
  const disp = await (await page.request.get('/api/disponibilidad?desde=2026-11-11&hasta=2026-11-11')).json();
  expect(disp.dias[0].ocupadas).toBe(0);
});

test('No presentado: el jefe lo marca después de la hora y avisa al cliente', async ({ page, request }) => {
  const vehiculoId = await clienteListo(page);
  await page.request.post('/api/citas', { data: { vehiculoId, inicio: madrid('2026-11-09', '08:00'), descripcionProblema: 'Revisión' } });
  await fijarHora(page, '2026-11-09T08:30:00.000Z'); // 09:30
  await entrarComo(page, 'jefe@taller.test');
  await page.goto('/jefe/citas');
  await page.getByRole('button', { name: 'No vino' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Marcar no presentado' }).click();
  await expect(page.getByTestId('cita')).toContainText('No presentado');
  expect(await emails(request, 'ana@cliente.test')).toContain('CITA_NO_PRESENTADO');
});

test('Pedidos de piezas: el mecánico pide, el jefe aprueba y recibe, sube el stock', async ({ page, request }) => {
  const ordenId = await ordenEnReparacion(page);
  await entrarComo(page, 'mecanico@taller.test');
  await page.goto(`/mecanico/ordenes/${ordenId}`);
  await page.getByRole('button', { name: 'Registrar pieza' }).click();
  const d = page.getByRole('dialog');
  await d.getByRole('tab', { name: 'Pedir' }).click();
  await d.getByLabel('Pieza del catálogo (opcional)').click();
  await page.getByRole('option', { name: /Aceite 5W30/ }).click();
  await d.getByLabel('Cantidad').fill('4');
  await d.getByRole('button', { name: 'Pedir' }).click();
  await expect(page.getByText('Pedido: 4 × Aceite 5W30 (litro)')).toBeVisible();
  await page.getByRole('button', { name: 'Esperando piezas' }).click();
  await expect(page.getByRole('button', { name: 'Reanudar reparación' })).toBeVisible();

  await entrarComo(page, 'jefe@taller.test');
  await page.goto('/jefe/pedidos');
  await page.getByRole('button', { name: 'Aprobar' }).click();
  await page.getByRole('tab', { name: 'Aprobados' }).click();
  await page.getByRole('button', { name: 'Recibido' }).click();
  await page.getByRole('tab', { name: 'Recibidos' }).click();
  await expect(page.getByTestId('pedido')).toContainText('Recibido');
  await page.goto('/jefe/piezas');
  await expect(page.getByRole('row', { name: /AC-5W30/ })).toContainText('5');
  expect(await emails(request, 'mecanico@taller.test')).toEqual(expect.arrayContaining(['PEDIDO_APROBADO', 'PIEZA_RECIBIDA']));
  expect(await emails(request, 'ana@cliente.test')).toContain('ESPERANDO_PIEZAS');
});

test('Rechazar un pedido exige motivo', async ({ page }) => {
  const ordenId = await ordenEnReparacion(page);
  await entrarComo(page, 'mecanico@taller.test');
  const orden = await (await page.request.get(`/api/ordenes/${ordenId}`)).json();
  await page.request.post(`/api/partidas/${orden.solicitudes[0].partidas[0].id}/pedidos`, { data: { descripcionLibre: 'Sensor ABS Bosch', cantidad: 1 } });
  await entrarComo(page, 'jefe@taller.test');
  await page.goto('/jefe/pedidos');
  await page.getByRole('button', { name: 'Rechazar' }).click();
  const d = page.getByRole('dialog');
  await expect(d.getByRole('button', { name: 'Rechazar' })).toBeDisabled();
  await d.getByLabel(/Motivo/).fill('Hay uno compatible');
  await d.getByRole('button', { name: 'Rechazar' }).click();
  await expect(page.getByText('No hay pedidos aquí')).toBeVisible();
});

test('Observaciones: la interna no la ve el cliente; la visible sí', async ({ page }) => {
  const ordenId = await ordenEnReparacion(page);
  await entrarComo(page, 'mecanico@taller.test');
  await page.goto(`/mecanico/ordenes/${ordenId}`);
  for (const [texto, interna] of [['Cliente muy amable', true], ['Discos al 40 %', false]] as const) {
    await page.getByRole('button', { name: 'Añadir observación' }).click();
    const d = page.getByRole('dialog');
    await d.getByLabel('Observación').fill(texto);
    if (interna) await d.getByRole('checkbox').check();
    await d.getByRole('button', { name: 'Añadir' }).click();
    await expect(page.getByText(texto).first()).toBeVisible();
  }
  await entrarComo(page, 'ana@cliente.test');
  await page.goto(`/ordenes/${ordenId}`);
  await expect(page.getByText('Discos al 40 %').first()).toBeVisible();
  await expect(page.getByText('Cliente muy amable')).toHaveCount(0);
});

test('Jornada: entrada, pausa, salida y corrección aceptada por el jefe', async ({ page, request }) => {
  await entrarComo(page, 'mecanico@taller.test');
  await fijarHora(page, '2026-11-09T07:00:00.000Z'); // 08:00
  await page.goto('/mecanico');
  const tarjeta = page.getByTestId('fichaje');
  await expect(tarjeta.getByRole('button')).toHaveText(['Fichar entrada']);
  await tarjeta.getByRole('button', { name: 'Fichar entrada' }).click();
  await expect(tarjeta).toContainText('Trabajando desde las 08:00');
  await fijarHora(page, '2026-11-09T09:30:00.000Z');
  await page.reload();
  await tarjeta.getByRole('button', { name: 'Empezar pausa' }).click();
  await expect(tarjeta.getByRole('button')).toHaveText(['Volver de la pausa']);
  await fijarHora(page, '2026-11-09T09:45:00.000Z');
  await page.reload();
  await tarjeta.getByRole('button', { name: 'Volver de la pausa' }).click();
  await fijarHora(page, '2026-11-09T15:00:00.000Z');
  await page.reload();
  await tarjeta.getByRole('button', { name: 'Fichar salida' }).click();
  await expect(page.getByRole('dialog')).toContainText('7 h 45 min');
  await page.getByRole('dialog').getByRole('button', { name: 'Fichar salida' }).click();
  await expect(tarjeta).toContainText('Fuera de jornada');

  await page.goto('/mecanico/jornada');
  await page.getByRole('button', { name: 'Solicitar corrección' }).click();
  const d = page.getByRole('dialog');
  await d.getByLabel('Fichaje').click();
  await page.getByRole('option', { name: 'Entrada' }).click();
  await d.getByLabel('Hora correcta').fill('07:55');
  await d.getByLabel('Motivo').fill('Fiché tarde al llegar');
  await d.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.getByText('Fiché tarde al llegar')).toBeVisible();

  await entrarComo(page, 'jefe@taller.test');
  await page.goto('/jefe/jornadas');
  await page.getByTestId('correccion').getByRole('button', { name: 'Aceptar' }).click();
  await expect(page.getByTestId('correccion')).toHaveCount(0);
  const fila = page.getByRole('row', { name: /Luis Pérez/ });
  await expect(fila).toContainText('Entrada 07:55 ✎');
  await expect(fila).toContainText('Corregida');
  expect(await emails(request, 'mecanico@taller.test')).toContain('CORRECCION_RESUELTA');
  const csv = await page.request.get('/api/jornadas.csv?desde=2026-11-09&hasta=2026-11-09');
  expect(await csv.text()).toContain('Luis Pérez');
});

test('Personal y capacidad: una ausencia baja la capacidad y se reasignan puestos', async ({ page, request }) => {
  await entrarComo(page, 'jefe@taller.test');
  await page.goto('/jefe/personal');
  await expect(page.getByText('Capacidad: 3 vehículos')).toBeVisible();
  await page.getByRole('row', { name: /Luis Pérez/ }).getByRole('button', { name: 'Ausencia' }).click();
  const d = page.getByRole('dialog');
  await d.getByLabel('Tipo').click();
  await page.getByRole('option', { name: 'Baja médica' }).click();
  await d.getByRole('button', { name: 'Guardar ausencia' }).click();
  await expect(page.getByText('Capacidad: 2 vehículos')).toBeVisible();
  await expect(page.getByRole('row', { name: /Luis Pérez/ })).toContainText('Ausente hoy');
  const puesto1 = page.getByText('Puesto 1', { exact: true }).locator('..');
  await puesto1.getByLabel('Mecánico').click();
  await expect(page.getByRole('option', { name: 'Luis Pérez (ausente)' })).toBeDisabled();
  await page.getByRole('option', { name: 'Sara Gómez' }).click();
  await expect(page.getByRole('row', { name: /Sara Gómez/ })).toContainText('Puesto 1');
  expect(await emails(request, 'jefe@taller.test')).toContain('MECANICO_AUSENTE');
});

test('Alta de un mecánico: invitación y primer acceso con el rol', async ({ page, request }) => {
  await entrarComo(page, 'jefe@taller.test');
  await page.goto('/jefe/personal');
  await page.getByRole('button', { name: 'Dar de alta' }).click();
  await page.getByRole('dialog').getByLabel('Email de Google').fill('nuevo@taller.test');
  await page.getByRole('dialog').getByRole('button', { name: 'Enviar invitación' }).click();
  await expect(page.getByRole('row', { name: /nuevo@taller.test/ })).toContainText('Pendiente');
  expect(await emails(request, 'nuevo@taller.test')).toEqual(['INVITACION']);
  await entrarComo(page, 'nuevo@taller.test');
  await page.goto('/');
  await expect(page).toHaveURL(/\/mecanico$/);
});

test('Reserva múltiple: la empresa pide, el jefe ofrece hueco y la empresa acepta', async ({ page, request }) => {
  await clienteListo(page, 'flota@empresa.test', '1111AAA', true);
  await page.request.post('/api/vehiculos', { data: { matricula: '2222BBB', marca: 'Ford', modelo: 'Transit' } });
  await page.goto('/reservas');
  await page.getByLabel(/1111AAA/).check();
  await page.getByLabel(/2222BBB/).check();
  await page.getByRole('button', { name: /mié, 11 nov/ }).click();
  await page.getByRole('button', { name: 'Enviar solicitud (2 vehículos)' }).click();
  await expect(page.getByTestId('reserva')).toContainText('En espera');

  await entrarComo(page, 'jefe@taller.test');
  await page.goto('/jefe/empresas');
  await expect(page.getByTestId('reserva')).toContainText('RM-01');
  await expect(page.getByTestId('reserva')).toContainText('mié, 11 nov · ');
  await page.getByRole('button', { name: 'Ofrecer hueco' }).click();
  const d = page.getByRole('dialog', { name: /Ofrecer hueco a/ });
  // Propone las dos primeras franjas libres del día preferido; el jefe cambia una
  const franjas = d.getByRole('group', { name: 'Franjas de entrega' });
  await expect(franjas.getByRole('button', { name: '08:00' })).toHaveAttribute('aria-pressed', 'true');
  await expect(franjas.getByRole('button', { name: '08:30' })).toHaveAttribute('aria-pressed', 'true');
  await expect(franjas.getByRole('button', { name: '10:00' })).toBeDisabled(); // ya hay 2 de 2
  await franjas.getByRole('button', { name: '08:00' }).click();
  await expect(d.getByRole('button', { name: 'Enviar oferta' })).toBeDisabled();
  await franjas.getByRole('button', { name: '10:00' }).click();
  await d.getByRole('button', { name: 'Enviar oferta' }).click();
  await expect(page.getByTestId('reserva-ofrecida')).toContainText('mié, 11 nov · 08:30 y 10:00');

  await entrarComo(page, 'flota@empresa.test');
  await page.goto('/reservas');
  await expect(page.getByTestId('reserva')).toContainText('llegadas a las 08:30, 10:00');
  await page.getByRole('button', { name: 'Aceptar el día' }).click();
  await expect(page.getByTestId('reserva')).toContainText('Citas creadas');
  await page.goto('/ordenes');
  await expect(page.getByTestId('cita')).toHaveCount(2);
  expect(await emails(request, 'flota@empresa.test')).toEqual(expect.arrayContaining(['RESERVA_MULTIPLE_RECIBIDA', 'HUECO_OFRECIDO', 'RESERVA_MULTIPLE_CONFIRMADA']));
});

test('Reserva múltiple: la empresa acepta por teléfono y el jefe pulsa «Confirmar ya»', async ({ page, request }) => {
  await clienteListo(page, 'flota@empresa.test', '1111AAA', true);
  const otro = await (await page.request.post('/api/vehiculos', { data: { matricula: '2222BBB', marca: 'Ford', modelo: 'Transit' } })).json();
  const primero = (await (await page.request.get('/api/vehiculos')).json()).datos.find((v: { matricula: string }) => v.matricula === '1111AAA');
  const r = await (await page.request.post('/api/reservas-multiples', { data: { vehiculoIds: [primero.id, otro.id], fechasPreferidas: ['2026-11-11'] } })).json();

  await entrarComo(page, 'jefe@taller.test');
  await page.request.post(`/api/reservas-multiples/${r.id}/ofrecer`, { data: { fecha: '2026-11-11', franjas: ['09:00', '09:30'] } });
  await page.goto('/jefe/empresas');
  await page.getByTestId('reserva-ofrecida').getByRole('button', { name: 'Confirmar ya' }).click();
  const d = page.getByRole('dialog', { name: '¿La empresa ha aceptado por teléfono?' });
  await expect(d).toContainText('a las 09:00 y 09:30');
  await d.getByRole('button', { name: 'Confirmar ya' }).click();
  await expect(page.getByTestId('reserva-ofrecida')).toHaveCount(0);
  await expect(page.getByText('Convertidas este mes')).toBeVisible();
  expect(await emails(request, 'flota@empresa.test')).toContain('RESERVA_MULTIPLE_CONFIRMADA');
});

test('Supervisión: el dueño cambia el IVA, ve estadísticas y la trazabilidad', async ({ page }) => {
  await entrarComo(page, 'dueno@taller.test');
  await page.goto('/dueno/configuracion');
  await page.getByLabel('IVA (%)').fill('10');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Configuración guardada')).toBeVisible();
  expect((await (await page.request.get('/api/config')).json()).ivaPorcentaje).toBe(10);
  await page.goto('/dueno');
  await expect(page.getByText('Facturado (IVA incl.)')).toBeVisible();
  await page.getByRole('button', { name: 'Tabla' }).click();
  await expect(page.getByRole('cell', { name: /lun, 9 nov/ })).toBeVisible();
  await page.goto('/dueno/trazabilidad');
  await page.getByLabel('Matrícula, marca o cliente').fill('9999');
  await expect(page.getByText('Ningún vehículo coincide.')).toBeVisible();
});

test('Usuarios: el dueño da de baja a alguien y pierde el acceso al momento', async ({ page, browser }) => {
  const otro = await browser.newContext({ baseURL: 'http://localhost:3100' });
  const pagina = await otro.newPage();
  await entrarComo(pagina, 'mecanico2@taller.test');
  await pagina.goto('/mecanico');
  await expect(pagina.getByRole('heading', { name: 'Mis órdenes de hoy' })).toBeVisible();

  await entrarComo(page, 'dueno@taller.test');
  await page.goto('/dueno/usuarios');
  await page.getByRole('row', { name: /mecanico2@taller.test/ }).getByRole('button', { name: 'Dar de baja' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Dar de baja' }).click();
  await expect(page.getByRole('row', { name: /mecanico2@taller.test/ })).toContainText('De baja');

  await pagina.reload();
  await expect(pagina).toHaveURL(/\/login/);
  await otro.close();
});

test('Autobaja del cliente: cancela sus citas, entra a una página especial y recupera la cuenta', async ({ page, request }) => {
  const vehiculoId = await clienteListo(page);
  await page.request.post('/api/citas', { data: { vehiculoId, inicio: madrid('2026-11-11', '10:00'), descripcionProblema: 'Revisión' } });
  await page.goto('/perfil');
  await page.getByRole('button', { name: 'Darme de baja' }).click();
  const d = page.getByRole('dialog');
  await expect(d.getByRole('button', { name: 'Darme de baja' })).toBeDisabled();
  await d.getByLabel('Escribe DAR DE BAJA para confirmar').fill('dar de baja');
  await d.getByRole('button', { name: 'Darme de baja' }).click();
  await expect(page).toHaveURL(/\/login\?baja=1/);
  await expect(page.getByText('Has dado de baja tu cuenta')).toBeVisible();
  expect(await emails(request, 'ana@cliente.test')).toContain('BAJA_CUENTA');

  await entrarComo(page, 'ana@cliente.test');
  await page.goto('/vehiculos');
  await expect(page.getByRole('heading', { name: 'Tu cuenta está dada de baja' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Menú principal' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Recuperar mi cuenta' }).click();
  await expect(page.getByRole('heading', { name: 'Mis vehículos' })).toBeVisible();
  await page.goto('/ordenes');
  await expect(page.getByText('No tienes citas pendientes.')).toBeVisible();
});

test('Autobaja bloqueada con un vehículo en el taller', async ({ page }) => {
  const vehiculoId = await clienteListo(page);
  const cita = await (await page.request.post('/api/citas', { data: { vehiculoId, inicio: madrid('2026-11-09', '09:00'), descripcionProblema: 'x' } })).json();
  await entrarComo(page, 'jefe@taller.test');
  await page.request.post(`/api/citas/${cita.id}/recibir`, { data: { kmEntrada: 98500 } });
  await entrarComo(page, 'ana@cliente.test');
  await page.goto('/perfil');
  await expect(page.getByText(/Tienes un vehículo en el taller/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Darme de baja' })).toBeDisabled();
});

test('Baja de un mecánico por el jefe y reactivación', async ({ page }) => {
  await entrarComo(page, 'jefe@taller.test');
  await page.goto('/jefe/personal');
  await page.getByRole('row', { name: /Sara Gómez/ }).getByRole('button', { name: 'Dar de baja' }).click();
  const d = page.getByRole('dialog');
  await d.getByLabel('Motivo (obligatorio)').fill('Fin de contrato');
  await d.getByRole('button', { name: 'Dar de baja' }).click();
  await expect(page.getByRole('row', { name: /Sara Gómez/ })).toHaveCount(0);
  await expect(page.getByText('Capacidad: 2 vehículos')).toBeVisible();
  await page.getByLabel('Ver bajas').check();
  await page.getByRole('row', { name: /Sara Gómez/ }).getByRole('button', { name: 'Reactivar' }).click();
  await expect(page.getByRole('row', { name: /Sara Gómez/ })).not.toContainText('De baja');
});

test('Vacaciones de varios días y eliminar un vehículo deja constancia para el dueño', async ({ page }) => {
  await entrarComo(page, 'jefe@taller.test');
  await page.goto('/jefe/personal');
  await page.getByRole('row', { name: /Luis Pérez/ }).getByRole('button', { name: 'Ausencia' }).click();
  const d = page.getByRole('dialog');
  await d.getByLabel('Hasta (incluido)').fill('2026-11-11');
  await d.getByRole('button', { name: 'Guardar ausencia' }).click();
  await expect(page.getByText(/Luis Pérez · mié, 11 nov/)).toBeVisible();

  await clienteListo(page);
  await page.goto('/vehiculos');
  await page.getByRole('button', { name: 'Eliminar 1234ABC' }).click();
  await page.getByRole('dialog').getByLabel('Motivo (opcional)').fill('Vendido');
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar' }).click();
  await expect(page.getByText('Aún no tienes vehículos')).toBeVisible();
  await entrarComo(page, 'dueno@taller.test');
  await page.goto('/dueno/constancias');
  await expect(page.getByRole('row', { name: /1234ABC/ })).toContainText('Vendido');
});

test('Stock: el jefe cuadra el inventario y queda en el historial; el mecánico no puede', async ({ page }) => {
  await entrarComo(page, 'jefe@taller.test');
  await page.goto('/jefe/piezas');
  const fila = page.getByRole('row', { name: /FA-010/ });
  await fila.getByRole('button', { name: 'Acciones de FA-010' }).click();
  await page.getByRole('menuitem', { name: 'Cuadrar con el inventario' }).click();
  const d = page.getByRole('dialog');
  await d.getByLabel('Unidades contadas').fill('7');
  await expect(d).toContainText('Diferencia: -3');
  await d.getByLabel('Motivo (obligatorio)').fill('Inventario de noviembre');
  await d.getByRole('button', { name: 'Cuadrar' }).click();
  await expect(fila).toContainText('7');
  await expect(page.getByText('-3 Filtro de aceite')).toBeVisible(); // panel «Movimientos de hoy»
  await fila.getByRole('button', { name: 'Acciones de FA-010' }).click();
  await page.getByRole('menuitem', { name: 'Historial de stock' }).click();
  const h = page.getByRole('dialog');
  await expect(h.getByRole('row').nth(1)).toContainText('Cuadre de inventario');
  await expect(h.getByRole('row').nth(1)).toContainText('10 → 7');
  await expect(h.getByRole('row').nth(1)).toContainText('Inventario de noviembre');
  await page.keyboard.press('Escape');

  await entrarComo(page, 'mecanico@taller.test');
  const piezas = (await (await page.request.get('/api/piezas?q=FA-010')).json()).datos;
  expect((await page.request.post(`/api/piezas/${piezas[0].id}/cuadre`, { data: { stockReal: 99, motivo: 'x' } })).status()).toBe(403);
  await page.goto('/jefe/piezas');
  await expect(page.getByRole('heading', { name: 'No tienes acceso' })).toBeVisible();
});

test('Recordatorio 24 h antes: email y aviso en Notificaciones', async ({ page, request }) => {
  await clienteListo(page);
  const vehiculo = (await (await page.request.get('/api/vehiculos')).json()).datos[0];
  const r = await page.request.post('/api/citas', { data: { vehiculoId: vehiculo.id, inicio: madrid('2026-11-11', '10:00'), descripcionProblema: 'Ruido al frenar' } });
  expect(r.status()).toBe(201);
  await fijarHora(page, '2026-11-10T10:00:00.000Z'); // martes 11:00: faltan 23 h
  expect((await (await page.request.post('/api/test/recordatorios', { data: {} })).json()).enviados).toBe(1);
  expect((await (await page.request.post('/api/test/recordatorios', { data: {} })).json()).enviados).toBe(0);
  expect(await emails(request, 'ana@cliente.test')).toContain('RECORDATORIO_CITA');

  await page.goto('/ordenes');
  await page.getByRole('navigation', { name: 'Menú principal' }).getByRole('link', { name: 'Notificaciones' }).click();
  await expect(page.getByTestId('titulo-barra')).toHaveText('Notificaciones');
  await expect(page.getByTestId('aviso').first()).toContainText('Mañana te esperamos a las 10:00');
  await page.getByTestId('aviso').first().click();
  await expect(page).toHaveURL(/\/ordenes$/);
});

test('Menú como en Figma: el mecánico consulta su historial y el catálogo sin poder tocar el stock', async ({ page }) => {
  await entrarComo(page, 'mecanico@taller.test');
  await page.goto('/mecanico');
  const nav = page.getByRole('navigation', { name: 'Menú principal' });
  await expect(page.getByTestId('titulo-barra')).toHaveText('Mis órdenes de hoy');
  await nav.getByRole('link', { name: 'Historial' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Historial' })).toBeVisible();
  await expect(page.getByText('Aún no has registrado trabajo en ninguna orden.')).toBeVisible();
  await nav.getByRole('link', { name: 'Catálogo de piezas' }).click();
  await expect(page.getByTestId('pieza').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Ajustar|Cuadrar|Nueva pieza/ })).toHaveCount(0);
  // «Cerrar sesión» está abajo del menú lateral, como en Figma
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(/\/login/);
});
