import { describe, expect, it } from 'vitest';
import { fichajesPermitidos, resumirJornada } from './jornada';

const h = (hhmm: string) => new Date(`2026-11-10T${hhmm}:00Z`);

describe('registro de jornada', () => {
  it('solo permite fichajes en orden', () => {
    expect(fichajesPermitidos(null)).toEqual(['ENTRADA']);
    expect(fichajesPermitidos('ENTRADA')).toEqual(['INICIO_PAUSA', 'SALIDA']);
    expect(fichajesPermitidos('INICIO_PAUSA')).toEqual(['FIN_PAUSA']);
  });

  it('descuenta las pausas de una jornada completa', () => {
    const r = resumirJornada(
      [
        { tipo: 'ENTRADA', momento: h('07:58') },
        { tipo: 'INICIO_PAUSA', momento: h('10:30') },
        { tipo: 'FIN_PAUSA', momento: h('10:45') },
        { tipo: 'SALIDA', momento: h('16:05') },
      ],
      h('18:00'),
    );
    expect(r).toEqual({ minutosTrabajados: 472, minutosPausa: 15, completa: true });
  });

  it('cuenta hasta ahora si la jornada sigue abierta', () => {
    const r = resumirJornada(
      [
        { tipo: 'ENTRADA', momento: h('08:00') },
        { tipo: 'INICIO_PAUSA', momento: h('10:00') },
        { tipo: 'FIN_PAUSA', momento: h('10:15') },
      ],
      h('12:00'),
    );
    expect(r.minutosTrabajados).toBe(225);
    expect(r.completa).toBe(false);
  });

  it('marca incompleta una jornada sin salida', () => {
    expect(resumirJornada([{ tipo: 'ENTRADA', momento: h('07:59') }], h('07:59')).completa).toBe(false);
  });
});

describe('secuencia de fichajes', () => {
  it('valida el orden del día', async () => {
    const { secuenciaValida } = await import('./jornada');
    expect(secuenciaValida(['ENTRADA', 'INICIO_PAUSA', 'FIN_PAUSA', 'SALIDA', 'ENTRADA', 'SALIDA'])).toBe(true);
    expect(secuenciaValida(['ENTRADA'])).toBe(true);
    expect(secuenciaValida([])).toBe(true);
    expect(secuenciaValida(['SALIDA', 'ENTRADA'])).toBe(false);
    expect(secuenciaValida(['ENTRADA', 'FIN_PAUSA'])).toBe(false);
    expect(secuenciaValida(['ENTRADA', 'ENTRADA'])).toBe(false);
  });
});
