import { describe, expect, it } from 'vitest';
import { assertTransicion, estadoTrasResponder, puedeTransicionar } from './estadoOrden';
import { capacidadDia, clientePuedeCancelar, diaLleno } from './capacidad';
import { conIva, importePartida } from './importes';

describe('estados de la orden', () => {
  it('permite volver a pedir autorización desde reparación varias veces', () => {
    expect(puedeTransicionar('EN_REPARACION', 'ESPERANDO_AUTORIZACION', 'MECANICO')).toBe(true);
  });

  it('el mecánico no puede entregar el vehículo', () => {
    expect(puedeTransicionar('COMPLETADA', 'ENTREGADA', 'MECANICO')).toBe(false);
    expect(puedeTransicionar('COMPLETADA', 'ENTREGADA', 'JEFE')).toBe(true);
  });

  it('solo el sistema sale de ESPERANDO_AUTORIZACION', () => {
    expect(puedeTransicionar('ESPERANDO_AUTORIZACION', 'EN_REPARACION', 'MECANICO')).toBe(false);
    expect(puedeTransicionar('ESPERANDO_AUTORIZACION', 'EN_REPARACION', null)).toBe(true);
  });

  it('rechaza transiciones inexistentes', () => {
    expect(() => assertTransicion('EN_DIAGNOSTICO', 'COMPLETADA', 'JEFE')).toThrow(/no permitida/);
  });

  it('rechazar todo solo cierra la orden en la primera solicitud', () => {
    expect(estadoTrasResponder(0, true)).toBe('RECHAZADA');
    expect(estadoTrasResponder(0, false)).toBe('EN_REPARACION');
    expect(estadoTrasResponder(1, true)).toBe('EN_REPARACION');
  });
});

describe('capacidad', () => {
  it('limita por puestos o por mecánicos y descuenta arrastradas', () => {
    expect(capacidadDia({ puestosActivos: 5, mecanicosPresentes: 2, vehiculosPorMecanico: 2, ordenesArrastradas: 1 })).toBe(3);
    expect(capacidadDia({ puestosActivos: 3, mecanicosPresentes: 4, vehiculosPorMecanico: 2, ordenesArrastradas: 0 })).toBe(3);
    expect(capacidadDia({ puestosActivos: 3, mecanicosPresentes: 1, vehiculosPorMecanico: 2, ordenesArrastradas: 5 })).toBe(0);
  });

  it('marca el día lleno', () => {
    expect(diaLleno(3, 3)).toBe(true);
    expect(diaLleno(2, 3)).toBe(false);
  });

  it('cancelación con 24 h de antelación', () => {
    const cita = new Date('2026-11-10T09:00:00Z');
    expect(clientePuedeCancelar(cita, new Date('2026-11-09T09:00:00Z'), 24)).toBe(true);
    expect(clientePuedeCancelar(cita, new Date('2026-11-09T10:00:00Z'), 24)).toBe(false);
  });
});

describe('importes', () => {
  it('suma piezas y mano de obra en céntimos', () => {
    expect(importePartida([{ precioUnitarioCentimos: 1250, cantidad: 2 }], 90, 4000)).toBe(2500 + 6000);
  });

  it('aplica IVA', () => {
    expect(conIva(10000, 21)).toEqual({ base: 10000, iva: 2100, total: 12100 });
  });
});
