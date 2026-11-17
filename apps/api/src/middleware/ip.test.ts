import { describe, expect, it } from 'vitest';
import { ipSinPuerto } from './limite';

describe('IP del cliente para el límite de peticiones', () => {
  it('quita el puerto que añade el frontal de Azure', () => {
    expect(ipSinPuerto('81.40.12.7:51234')).toBe('81.40.12.7');
    expect(ipSinPuerto('[2001:db8::1]:443')).toBe('2001:db8::1');
  });

  it('deja igual las IP sin puerto', () => {
    expect(ipSinPuerto('81.40.12.7')).toBe('81.40.12.7');
    expect(ipSinPuerto('2001:db8::1')).toBe('2001:db8::1');
    expect(ipSinPuerto('::1')).toBe('::1');
  });

  it('una IPv4 mapeada en IPv6 cuenta como la misma IPv4', () => {
    expect(ipSinPuerto('::ffff:127.0.0.1')).toBe('127.0.0.1');
  });

  it('sin IP no falla', () => {
    expect(ipSinPuerto(undefined)).toBe('desconocida');
  });
});
