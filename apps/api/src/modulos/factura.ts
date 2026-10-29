import PDFDocument from 'pdfkit';
import { prisma } from '../db';
import { conIva } from '../domain/importes';
import { obtenerConfig } from '../servicios/config';
import { euros, fechaLarga, numeroOrden } from '../emails/formato';

export interface LineaFactura {
  concepto: string;
  cantidad: number;
  precioUnitarioCentimos: number;
  importeCentimos: number;
}

/**
 * Factura de una orden: solo los trabajos aceptados, con las piezas realmente usadas
 * (al precio del momento de usarlas) y las horas registradas a la tarifa actual.
 */
export async function calcularFactura(ordenId: string) {
  const [orden, config] = await Promise.all([
    prisma.orden.findUniqueOrThrow({
      where: { id: ordenId },
      include: {
        vehiculo: { include: { cliente: { include: { usuario: true } } } },
        solicitudes: { orderBy: { creadaEn: 'asc' }, include: { partidas: { where: { estado: 'ACEPTADA' }, include: { piezasUsadas: { include: { pieza: true } }, trabajos: true } } } },
      },
    }),
    obtenerConfig(prisma),
  ]);
  const lineas: LineaFactura[] = [];
  for (const p of orden.solicitudes.flatMap((s) => s.partidas)) {
    for (const u of p.piezasUsadas) {
      lineas.push({ concepto: `${u.pieza.nombre} (${p.descripcion})`, cantidad: u.cantidad, precioUnitarioCentimos: u.precioUnitarioCentimos, importeCentimos: u.cantidad * u.precioUnitarioCentimos });
    }
    const minutos = p.trabajos.reduce((s, t) => s + t.minutos, 0);
    if (minutos > 0) {
      const horas = Math.round((minutos / 60) * 100) / 100;
      lineas.push({ concepto: `Mano de obra: ${p.descripcion}`, cantidad: horas, precioUnitarioCentimos: config.tarifaHoraCentimos, importeCentimos: Math.round((minutos / 60) * config.tarifaHoraCentimos) });
    }
  }
  const base = lineas.reduce((s, l) => s + l.importeCentimos, 0);
  return { orden, lineas, ivaPorcentaje: config.ivaPorcentaje, ...conIva(base, config.ivaPorcentaje) };
}

type OrdenFactura = Awaited<ReturnType<typeof calcularFactura>>['orden'];

const km = (n: number) => `${n.toLocaleString('es-ES')} km`;

/** Vehículo y kilómetros tal como salen en el PDF. */
export function lineaVehiculo(o: OrdenFactura) {
  const v = o.vehiculo;
  const kms = o.kmSalida === null ? km(o.kmEntrada) : `${km(o.kmEntrada)} a la entrada · ${km(o.kmSalida)} a la salida`;
  return `Vehículo: ${v.marca} ${v.modelo} · ${v.matricula} · ${kms}`;
}

export async function facturaPdf(ordenId: string): Promise<Buffer> {
  const f = await calcularFactura(ordenId);
  const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `Factura ${numeroOrden(f.orden.numero)}`, Author: 'TallerPro' } });
  const trozos: Buffer[] = [];
  doc.on('data', (b: Buffer) => trozos.push(b));
  const fin = new Promise<Buffer>((ok) => doc.on('end', () => ok(Buffer.concat(trozos))));

  const v = f.orden.vehiculo;
  const c = v.cliente;
  doc.fillColor('#01687D').fontSize(22).text('TallerPro', { continued: true }).fillColor('#171C1F').fontSize(12).text(`   Factura ${numeroOrden(f.orden.numero)}`);
  doc.moveDown(0.5).fontSize(10).fillColor('#40484B').text(`Fecha: ${fechaLarga(f.orden.completadaEn ?? new Date())}`);
  doc.moveDown().fillColor('#171C1F').fontSize(11).text(c.razonSocial ?? c.usuario.nombre);
  if (c.nif) doc.text(`NIF: ${c.nif}`);
  doc.text(c.usuario.email).text(lineaVehiculo(f.orden));
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
  return fin;
}
