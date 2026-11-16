import PDFDocument from 'pdfkit';
import type { ConfigTaller, Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../db';
import type { Tx } from '../lib/transaccion';
import { conIva } from '../domain/importes';
import { obtenerConfig } from '../servicios/config';
import { euros, fechaLarga, numeroOrden } from '../emails/formato';
import { diaLocal } from '../lib/fechas';

export interface LineaFactura {
  concepto: string;
  cantidad: number;
  precioUnitarioCentimos: number;
  importeCentimos: number;
}

const incluirFactura = {
  vehiculo: { include: { cliente: { include: { usuario: true } } } },
  solicitudes: { orderBy: { creadaEn: 'asc' }, include: { partidas: { where: { estado: 'ACEPTADA' }, include: { piezasUsadas: { include: { pieza: true } }, trabajos: true } } } },
} satisfies Prisma.OrdenInclude;
type OrdenFactura = Prisma.OrdenGetPayload<{ include: typeof incluirFactura }>;

/**
 * Todo lo que aparece en la factura. Al emitirla (al completar la orden) se guarda tal cual en la orden
 * (`facturaDatos`): así el PDF, el email y las estadísticas no cambian aunque luego se edite el perfil del cliente,
 * el vehículo, el nombre o el precio de una pieza, la tarifa o el IVA.
 */
export interface Factura {
  /** F-2026-0001; null solo en una orden aún sin completar (vista previa). */
  codigo: string | null;
  ordenId: string;
  ordenNumero: number;
  emitidaEn: string | null;
  cliente: { nombre: string; nif: string | null; email: string };
  vehiculo: { marca: string; modelo: string; matricula: string; kmEntrada: number; kmSalida: number | null };
  lineas: LineaFactura[];
  ivaPorcentaje: number;
  base: number;
  iva: number;
  total: number;
}

/**
 * Factura calculada con los datos actuales: solo los trabajos aceptados, con las piezas realmente usadas (al precio
 * del momento de usarlas) y las horas registradas. Tarifa e IVA son los fijados en la orden al completarla.
 */
function componerFactura(orden: OrdenFactura, config: ConfigTaller): Factura {
  const tarifa = orden.tarifaHoraCentimos ?? config.tarifaHoraCentimos;
  const ivaPorcentaje = orden.ivaPorcentaje ?? config.ivaPorcentaje;
  const lineas: LineaFactura[] = [];
  for (const p of orden.solicitudes.flatMap((s) => s.partidas)) {
    for (const u of p.piezasUsadas) {
      lineas.push({ concepto: `${u.pieza.nombre} (${p.descripcion})`, cantidad: u.cantidad, precioUnitarioCentimos: u.precioUnitarioCentimos, importeCentimos: u.cantidad * u.precioUnitarioCentimos });
    }
    const minutos = p.trabajos.reduce((s, t) => s + t.minutos, 0);
    if (minutos > 0) {
      const horas = Math.round((minutos / 60) * 100) / 100;
      lineas.push({ concepto: `Mano de obra: ${p.descripcion}`, cantidad: horas, precioUnitarioCentimos: tarifa, importeCentimos: Math.round((minutos / 60) * tarifa) });
    }
  }
  const base = lineas.reduce((s, l) => s + l.importeCentimos, 0);
  const c = orden.vehiculo.cliente;
  return {
    codigo: orden.facturaCodigo,
    ordenId: orden.id,
    ordenNumero: orden.numero,
    emitidaEn: (orden.facturaEmitidaEn ?? orden.completadaEn)?.toISOString() ?? null,
    cliente: { nombre: c.razonSocial ?? c.usuario.nombre, nif: c.nif, email: c.usuario.email },
    vehiculo: { marca: orden.vehiculo.marca, modelo: orden.vehiculo.modelo, matricula: orden.vehiculo.matricula, kmEntrada: orden.kmEntrada, kmSalida: orden.kmSalida },
    lineas,
    ivaPorcentaje,
    ...conIva(base, ivaPorcentaje),
  };
}

/** La copia congelada si la factura ya se emitió; si no (vista previa u orden anterior a la numeración), calculada. */
const facturaDe = (orden: OrdenFactura, config: ConfigTaller): Factura =>
  orden.facturaDatos ? (orden.facturaDatos as unknown as Factura) : componerFactura(orden, config);

/** `db` puede ser una transacción: así la factura ve lo que se acaba de guardar en ella. */
export async function calcularFactura(ordenId: string, db: Tx | PrismaClient = prisma): Promise<Factura> {
  const [orden, config] = await Promise.all([db.orden.findUniqueOrThrow({ where: { id: ordenId }, include: incluirFactura }), obtenerConfig(db)]);
  return facturaDe(orden, config);
}

/** Varias facturas con dos consultas en total (para las estadísticas). */
export async function calcularFacturas(ordenIds: string[], db: Tx | PrismaClient = prisma): Promise<Factura[]> {
  if (!ordenIds.length) return [];
  const [ordenes, config] = await Promise.all([db.orden.findMany({ where: { id: { in: ordenIds } }, include: incluirFactura }), obtenerConfig(db)]);
  return ordenes.map((o) => facturaDe(o, config));
}

/** «F-2026-0001»: serie por año (del día del taller) y número correlativo sin huecos dentro del año. */
export const codigoFactura = (anio: number, n: number) => `F-${anio}-${String(n).padStart(4, '0')}`;

/**
 * Emite la factura dentro de la transacción que completa la orden: le da el siguiente número del año y guarda
 * la copia congelada. El contador se incrementa con un UPDATE de fila (bloqueada hasta el final de la transacción):
 * dos órdenes completadas a la vez reciben números distintos y, si la transacción se deshace, el número no se pierde.
 */
export async function emitirFactura(tx: Tx, ordenId: string, ahora: Date): Promise<Factura> {
  const config = await obtenerConfig(tx);
  const anio = Number(diaLocal(ahora, config.zonaHoraria).slice(0, 4));
  const [{ ultimo }] = await tx.$queryRaw<{ ultimo: number }[]>`
    INSERT INTO "ContadorFactura" ("anio", "ultimo") VALUES (${anio}, 1)
    ON CONFLICT ("anio") DO UPDATE SET "ultimo" = "ContadorFactura"."ultimo" + 1
    RETURNING "ultimo"`;
  const codigo = codigoFactura(anio, ultimo);
  await tx.orden.update({ where: { id: ordenId }, data: { facturaCodigo: codigo, facturaEmitidaEn: ahora } });
  const factura = componerFactura(await tx.orden.findUniqueOrThrow({ where: { id: ordenId }, include: incluirFactura }), config);
  await tx.orden.update({ where: { id: ordenId }, data: { facturaDatos: factura as unknown as Prisma.InputJsonValue } });
  return factura;
}

const km = (n: number) => `${n.toLocaleString('es-ES')} km`;

/** Vehículo y kilómetros tal como salen en el PDF. */
export function lineaVehiculo(f: Pick<Factura, 'vehiculo'>) {
  const v = f.vehiculo;
  const kms = v.kmSalida === null ? km(v.kmEntrada) : `${km(v.kmEntrada)} a la entrada · ${km(v.kmSalida)} a la salida`;
  return `Vehículo: ${v.marca} ${v.modelo} · ${v.matricula} · ${kms}`;
}

/** Nombre del PDF: el número de factura (o el de la orden si aún no tiene). */
export const nombrePdf = (f: Pick<Factura, 'codigo' | 'ordenNumero'>) => `Factura-${f.codigo ?? numeroOrden(f.ordenNumero)}.pdf`;

export async function facturaPdf(ordenId: string): Promise<{ pdf: Buffer; nombre: string }> {
  const f = await calcularFactura(ordenId);
  const titulo = f.codigo ? `Factura ${f.codigo}` : `Resumen ${numeroOrden(f.ordenNumero)}`;
  const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: titulo, Author: 'TallerPro' } });
  const trozos: Buffer[] = [];
  doc.on('data', (b: Buffer) => trozos.push(b));
  const fin = new Promise<Buffer>((ok) => doc.on('end', () => ok(Buffer.concat(trozos))));

  doc.fillColor('#01687D').fontSize(22).text('TallerPro', { continued: true }).fillColor('#171C1F').fontSize(12).text(`   ${titulo}`);
  doc.moveDown(0.5).fontSize(10).fillColor('#40484B').text(`Fecha: ${fechaLarga(f.emitidaEn ? new Date(f.emitidaEn) : new Date())} · Orden ${numeroOrden(f.ordenNumero)}`);
  doc.moveDown().fillColor('#171C1F').fontSize(11).text(f.cliente.nombre);
  if (f.cliente.nif) doc.text(`NIF: ${f.cliente.nif}`);
  doc.text(f.cliente.email).text(lineaVehiculo(f));
  doc.moveDown();

  const x = { concepto: 50, cant: 330, precio: 390, importe: 470 };
  const cabecera = (y: number) => {
    doc.fontSize(9).fillColor('#40484B');
    doc.text('CONCEPTO', x.concepto, y).text('CANT.', x.cant, y).text('PRECIO', x.precio, y).text('IMPORTE', x.importe, y, { width: 75, align: 'right' });
    doc.moveTo(50, y + 14).lineTo(545, y + 14).strokeColor('#BFC8CC').stroke();
  };
  let y = doc.y;
  cabecera(y);
  y += 22;
  doc.fontSize(10).fillColor('#171C1F');
  for (const l of f.lineas) {
    if (y > 740) {
      doc.addPage();
      y = 50;
      cabecera(y);
      y += 22;
      doc.fontSize(10).fillColor('#171C1F');
    }
    const alto = doc.heightOfString(l.concepto, { width: 270 });
    doc.text(l.concepto, x.concepto, y, { width: 270 });
    doc.text(String(l.cantidad).replace('.', ','), x.cant, y).text(euros(l.precioUnitarioCentimos), x.precio, y).text(euros(l.importeCentimos), x.importe, y, { width: 75, align: 'right' });
    y += Math.max(alto, 12) + 8;
  }
  if (!f.lineas.length) {
    doc.fillColor('#40484B').text('Sin trabajos facturables.', x.concepto, y);
    y += 20;
  }
  doc.moveTo(330, y).lineTo(545, y).strokeColor('#BFC8CC').stroke();
  y += 8;
  const total = (t: string, v: number, negrita = false) => {
    doc.font(negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(negrita ? 12 : 10).fillColor('#171C1F');
    doc.text(t, 330, y).text(euros(v), x.importe, y, { width: 75, align: 'right' });
    y += negrita ? 18 : 15;
  };
  total('Base imponible', f.base);
  total(`IVA (${f.ivaPorcentaje} %)`, f.iva);
  total('Total', f.total, true);
  doc.end();
  return { pdf: await fin, nombre: nombrePdf(f) };
}
