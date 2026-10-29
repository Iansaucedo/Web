export interface DatosCapacidad {
  puestosActivos: number;
  mecanicosPresentes: number;
  vehiculosPorMecanico: number;
  ordenesArrastradas: number; // órdenes abiertas que siguen ocupando puesto ese día
}

export function capacidadDia(d: DatosCapacidad): number {
  const bruta = Math.min(d.puestosActivos, d.mecanicosPresentes * d.vehiculosPorMecanico);
  return Math.max(0, bruta - d.ordenesArrastradas);
}

export function diaLleno(citasActivas: number, capacidad: number): boolean {
  return citasActivas >= capacidad;
}

/** El cliente puede modificar o cancelar hasta `horasMinimas` antes del inicio de la franja. */
export function clientePuedeCancelar(inicioCita: Date, ahora: Date, horasMinimas: number): boolean {
  return inicioCita.getTime() - ahora.getTime() >= horasMinimas * 3_600_000;
}
