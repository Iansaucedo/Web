import { describe, expect, it } from 'vitest';
import { motivoNoCompletable, RespuestaIncompleta, validarRespuesta } from './respuesta';

describe('respuesta única del cliente', () => {
  it('exige decidir todas las partidas', () => {
    expect(() => validarRespuesta(['a', 'b'], { a: 'ACEPTADA' }, false)).toThrow(RespuestaIncompleta);
  });

  it('rechaza decisiones de otra solicitud', () => {
    expect(() => validarRespuesta(['a'], { a: 'ACEPTADA', z: 'RECHAZADA' }, false)).toThrow(RespuestaIncompleta);
  });

  it('una aceptada y una rechazada pasa a reparación', () => {
    expect(validarRespuesta(['a', 'b'], { a: 'ACEPTADA', b: 'RECHAZADA' }, true)).toBe('EN_REPARACION');
  });

  it('rechazar todo en la primera solicitud cierra la orden', () => {
    expect(validarRespuesta(['a'], { a: 'RECHAZADA' }, true)).toBe('RECHAZADA');
  });
});

describe('marcar completada', () => {
  const hecha = new Date();
  it('se bloquea con trabajos en curso y explica por qué', () => {
    expect(motivoNoCompletable([{ estado: 'ACEPTADA', terminadaEn: null }, { estado: 'ACEPTADA', terminadaEn: hecha }])).toBe(
      'Termina el trabajo en curso',
    );
  });

  it('se permite cuando todo lo aceptado está terminado', () => {
    expect(motivoNoCompletable([{ estado: 'ACEPTADA', terminadaEn: hecha }, { estado: 'RECHAZADA', terminadaEn: null }])).toBeNull();
  });

  it('se bloquea si el cliente no ha respondido', () => {
    expect(motivoNoCompletable([{ estado: 'PENDIENTE', terminadaEn: null }])).toMatch(/respuesta del cliente/);
  });
});
