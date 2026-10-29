import { expect, test } from '@playwright/test';
import { LUNES_7, emails, entrarComo, fijarHora, reiniciar } from './ayudas';

const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

// Recorrido completo de una reparación, tal como está en «Flujos» de Figma:
// primer acceso → reservar → recepción → presupuesto → respuesta → trabajo → completar → entrega.
test('flujo completo de una reparación', async ({ page, request }) => {
  await reiniciar(request);
  await fijarHora(page, LUNES_7);

  await test.step('Primer acceso: el cliente completa su perfil', async () => {
    await entrarComo(page, 'ana@cliente.test');
    await page.goto('/');
    await expect(page).toHaveURL(/\/perfil$/);
    await expect(page.getByRole('heading', { name: 'Completa tu perfil' })).toBeVisible();
    await page.getByLabel('Teléfono').fill('600 111 222');
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page).toHaveURL(/\/reservar$/);
  });

  await test.step('Sin vehículos, la reserva lleva a añadir uno', async () => {
    await page.getByRole('link', { name: 'Añadir vehículo' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Añadir vehículo' });
    await dialogo.getByLabel('Matrícula').fill('1234 abc');
    await dialogo.getByLabel('Marca').click();
    await page.getByRole('option', { name: 'Volkswagen' }).click();
    await dialogo.getByLabel('Modelo').fill('Golf');
    await dialogo.getByLabel('Kilómetros').fill('98000');
    await dialogo.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByTestId('vehiculo')).toContainText('1234ABC');
  });

  await test.step('Reservar cita: vehículo, día, franja y problema', async () => {
    await page.getByRole('link', { name: 'Reservar cita' }).click();
    await page.getByLabel('Vehículo').click();
    await page.getByRole('option', { name: /1234ABC/ }).click();
    await page.getByRole('option', { name: /lun, 9 nov/ }).click();
    await page.getByRole('button', { name: '09:00' }).click();
    await page.getByLabel('Describe el problema').fill('Ruido al frenar');
    await page.getByRole('button', { name: 'Revisar y confirmar' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Solicitar cita' }).click();
    await expect(page).toHaveURL(/\/ordenes$/);
    await expect(page.getByTestId('cita')).toContainText('Pendiente de confirmar');
  });

  await test.step('Jefe: confirma la cita y recibe el vehículo en un puesto', async () => {
    await entrarComo(page, 'jefe@taller.test');
    await page.goto('/jefe/citas');
    await page.getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.getByTestId('cita')).toContainText('Confirmada');
    await page.getByRole('button', { name: 'Recibir' }).click();
    const d = page.getByRole('dialog', { name: 'Recibir vehículo' });
    await d.getByLabel('Kilómetros').fill('98450');
    await d.getByLabel('Puesto').click();
    await page.getByRole('option', { name: /Puesto 1/ }).click();
    await d.getByRole('button', { name: 'Abrir orden' }).click();
    await expect(page.getByTestId('cita')).toContainText('Recibida');
    await page.goto('/jefe');
    await expect(page.getByTestId('puesto').first()).toContainText('OR-0001');
  });

  await test.step('Mecánico: pide autorización con dos trabajos', async () => {
    await entrarComo(page, 'mecanico@taller.test');
    await page.goto('/mecanico');
    await page.getByRole('button', { name: 'Todo el taller' }).click();
    await page.getByTestId('orden').first().click();
    await page.getByRole('button', { name: 'Pedir autorización' }).click();
    const d = page.getByRole('dialog', { name: 'Pedir autorización al cliente' });
    await d.getByLabel('Trabajo 1', { exact: true }).fill('Cambiar pastillas de freno');
    await d.getByLabel('Piezas (€)').fill('56');
    // Foto del disco: un PNG mínimo de verdad (el servidor comprueba los bytes)
    await d.getByLabel('Añadir foto al trabajo 1').setInputFiles({ name: 'disco.png', mimeType: 'image/png', buffer: PNG_1PX });
    await expect(d.getByRole('img', { name: 'Foto 1 del trabajo 1' })).toBeVisible();
    // QA: un archivo que no es imagen no se sube
    await d.getByLabel('Añadir foto al trabajo 1').setInputFiles({ name: 'virus.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });
    await expect(d.getByText('«virus.pdf» no es JPEG, PNG ni WebP')).toBeVisible();
    await d.getByRole('button', { name: 'Añadir otro trabajo' }).click();
    await d.getByLabel('Trabajo 2', { exact: true }).fill('Sustituir sensor ABS');
    await d.getByLabel('Piezas (€)').nth(1).fill('108,50');
    await expect(d).toContainText('96,00 €');
    await d.getByRole('button', { name: 'Enviar al cliente' }).click();
    await expect(page.getByText('Esperando la respuesta del cliente.')).toBeVisible();
  });

  await test.step('Cliente: acepta un trabajo y rechaza el otro en una sola respuesta', async () => {
    await entrarComo(page, 'ana@cliente.test');
    await page.goto('/ordenes');
    await page.getByRole('link', { name: 'Revisar' }).click();
    const r = page.getByTestId('responder');
    await expect(r.getByRole('button', { name: 'Enviar respuesta' })).toBeDisabled();
    await expect(r.getByRole('img', { name: 'Foto 1 de «Cambiar pastillas de freno»' })).toBeVisible();
    expect(await r.getByRole('img', { name: 'Foto 1 de «Cambiar pastillas de freno»' }).evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(1);
    await r.getByRole('group', { name: /Cambiar pastillas/ }).getByRole('button', { name: 'Aceptar' }).click();
    await r.getByRole('group', { name: /sensor ABS/ }).getByRole('button', { name: 'Rechazar' }).click();
    await expect(r).toContainText('Aceptas 1 de 2');
    await r.getByRole('button', { name: 'Enviar respuesta' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Enviar' }).click();
    await expect(page.getByText('En reparación').first()).toBeVisible();
    await expect(page.getByTestId('responder')).toHaveCount(0);
  });

  await test.step('Mecánico: registra horas y pieza, termina y completa', async () => {
    await entrarComo(page, 'mecanico@taller.test');
    await page.goto('/mecanico');
    await page.getByRole('button', { name: 'Todo el taller' }).click();
    await page.getByTestId('orden').first().click();
    const completar = page.getByRole('button', { name: 'Marcar completada' });
    await expect(completar).toBeDisabled();
    await page.getByRole('button', { name: 'Registrar horas' }).click();
    let d = page.getByRole('dialog', { name: 'Registrar horas' });
    await d.getByLabel('Tiempo').click();
    await page.getByRole('option', { name: '1 h 00 min' }).click();
    await d.getByLabel('¿Qué has hecho?').fill('Cambio de pastillas');
    await d.getByRole('button', { name: 'Registrar' }).click();
    await page.getByRole('button', { name: 'Registrar pieza' }).click();
    d = page.getByRole('dialog', { name: /Piezas/ });
    await d.getByLabel('Pieza').click();
    await page.getByRole('option', { name: /Pastillas de freno delanteras/ }).click();
    await d.getByRole('button', { name: 'Registrar' }).click();
    await expect(page.getByText('+ 1 × Pastillas de freno delanteras')).toBeVisible();
    await page.getByRole('button', { name: 'Marcar terminado' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Terminado' }).click();
    await expect(completar).toBeEnabled();
    await completar.click();
    const dc = page.getByRole('dialog', { name: '¿Marcar la orden como completada?' });
    await expect(dc).toContainText('1 de 1 aceptados');
    const confirmar = dc.getByRole('button', { name: 'Marcar completada' });
    await expect(confirmar).toBeDisabled();
    // QA: menos km que a la entrada no se aceptan
    await dc.getByLabel('Kilómetros a la salida').fill('98000');
    await expect(dc.getByText('No pueden ser menos que a la entrada (98.450 km)')).toBeVisible();
    await expect(confirmar).toBeDisabled();
    await dc.getByLabel('Kilómetros a la salida').fill('98462');
    await confirmar.click();
    await expect(page.getByText('Factura: 116,16 € IVA incluido')).toBeVisible();
  });

  await test.step('Jefe: entrega el vehículo y el puesto queda libre', async () => {
    await entrarComo(page, 'jefe@taller.test');
    await page.goto('/jefe/ordenes');
    await page.getByTestId('fila-orden').first().click();
    await page.getByRole('button', { name: 'Entregar vehículo' }).click();
    const de = page.getByRole('dialog', { name: 'Entregar vehículo' });
    await expect(de).toContainText('116,16 €');
    await expect(de.getByLabel('Kilómetros a la salida')).toHaveValue('98462');
    await expect(de.getByRole('link', { name: 'Ver PDF de resumen' })).toBeVisible();
    await de.getByLabel('Kilómetros a la salida').fill('98465');
    await de.getByRole('button', { name: 'Entregar' }).click();
    await expect(page.getByText('Entregada').first()).toBeVisible();
    await page.goto('/jefe');
    await expect(page.getByTestId('puesto').first()).toContainText('Libre');
  });

  await test.step('Cliente: ve la factura, la descarga en PDF y la línea de tiempo', async () => {
    await entrarComo(page, 'ana@cliente.test');
    await page.goto('/ordenes');
    await page.getByTestId('orden').first().click();
    await expect(page.getByTestId('total-factura')).toHaveText('116,16 €');
    const timeline = page.getByRole('list', { name: 'Línea de tiempo' });
    await expect(timeline).toContainText('Vehículo entregado');
    await expect(timeline).toContainText('Km de salida corregidos: 98.462 → 98.465 km');
    await expect(page.getByText(/98.450 km → 98.465 km/)).toBeVisible();
    await expect(timeline).toContainText('Rechazado: Sustituir sensor ABS');
    const pdf = await page.request.get(page.url().replace('/ordenes/', '/api/ordenes/') + '/factura.pdf');
    expect(pdf.headers()['content-type']).toBe('application/pdf');
    expect((await pdf.body()).subarray(0, 4).toString()).toBe('%PDF');
  });

  await test.step('Cada paso dejó su email en la bandeja de salida', async () => {
    expect(await emails(request, 'ana@cliente.test')).toEqual([
      'BIENVENIDA', 'CITA_SOLICITADA', 'CITA_CONFIRMADA', 'VEHICULO_RECIBIDO', 'SOLICITUD_AUTORIZACION', 'ORDEN_COMPLETADA', 'VEHICULO_ENTREGADO',
    ]);
    expect(await emails(request, 'mecanico@taller.test')).toEqual(['RESPUESTA_CLIENTE']);
    expect(await emails(request, 'jefe@taller.test')).toEqual(['CITA_NUEVA_TALLER']);
  });

  await test.step('La campana muestra los avisos y lleva a la orden', async () => {
    await page.goto('/ordenes');
    await page.getByRole('button', { name: /Avisos/ }).click();
    await page.getByRole('button', { name: /vehículo entregado/i }).click();
    await expect(page).toHaveURL(/\/ordenes\/c/);
  });
});
