/**
 * Reloj inyectable. Todo el código de negocio pide la hora aquí y nunca a `new Date()`,
 * para que los tests (y los E2E, vía /api/test/reloj) puedan fijar «ahora».
 */
let fijado: Date | null = null;

export const reloj = {
  ahora(): Date {
    return fijado ? new Date(fijado) : new Date();
  },
  fijar(momento: Date | null): void {
    fijado = momento ? new Date(momento) : null;
  },
};
