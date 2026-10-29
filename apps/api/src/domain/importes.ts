// Todos los importes en céntimos (enteros).

export interface LineaPieza {
  precioUnitarioCentimos: number;
  cantidad: number;
}

export function importePartida(piezas: LineaPieza[], minutos: number, tarifaHoraCentimos: number): number {
  const totalPiezas = piezas.reduce((s, p) => s + p.precioUnitarioCentimos * p.cantidad, 0);
  const manoObra = Math.round((minutos / 60) * tarifaHoraCentimos);
  return totalPiezas + manoObra;
}

export function conIva(baseCentimos: number, ivaPorcentaje: number) {
  const iva = Math.round((baseCentimos * ivaPorcentaje) / 100);
  return { base: baseCentimos, iva, total: baseCentimos + iva };
}
