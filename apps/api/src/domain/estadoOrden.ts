import type { EstadoOrden, Rol } from '@prisma/client';

type Transicion = { a: EstadoOrden; roles: Rol[] };

const TALLER: Rol[] = ['MECANICO', 'JEFE', 'DUENO'];
const GESTION: Rol[] = ['JEFE', 'DUENO'];
const SISTEMA: Rol[] = []; // solo las dispara el sistema (p. ej. al responder partidas)

export const TRANSICIONES_ORDEN: Record<EstadoOrden, Transicion[]> = {
  EN_DIAGNOSTICO: [{ a: 'ESPERANDO_AUTORIZACION', roles: TALLER }],
  ESPERANDO_AUTORIZACION: [
    { a: 'EN_REPARACION', roles: SISTEMA },
    { a: 'RECHAZADA', roles: SISTEMA },
  ],
  EN_REPARACION: [
    { a: 'ESPERANDO_AUTORIZACION', roles: TALLER },
    { a: 'ESPERANDO_PIEZAS', roles: TALLER },
    { a: 'COMPLETADA', roles: TALLER },
  ],
  ESPERANDO_PIEZAS: [{ a: 'EN_REPARACION', roles: [...TALLER] }],
  COMPLETADA: [{ a: 'ENTREGADA', roles: GESTION }],
  RECHAZADA: [{ a: 'ENTREGADA', roles: GESTION }],
  ENTREGADA: [],
};

export class TransicionInvalida extends Error {
  constructor(de: EstadoOrden, a: EstadoOrden) {
    super(`Transición no permitida: ${de} → ${a}`);
  }
}

/** `rol = null` indica una transición disparada por el sistema. */
export function puedeTransicionar(de: EstadoOrden, a: EstadoOrden, rol: Rol | null): boolean {
  const t = TRANSICIONES_ORDEN[de].find((x) => x.a === a);
  if (!t) return false;
  return rol === null ? true : t.roles.includes(rol);
}

export function assertTransicion(de: EstadoOrden, a: EstadoOrden, rol: Rol | null): void {
  if (!puedeTransicionar(de, a, rol)) throw new TransicionInvalida(de, a);
}

/**
 * Estado de la orden tras responder todas las partidas de una solicitud.
 * Rechazar todo en la primera solicitud cierra la orden; en las siguientes, se sigue con lo aprobado.
 */
export function estadoTrasResponder(
  aceptadas: number,
  esPrimeraSolicitud: boolean,
): Extract<EstadoOrden, 'EN_REPARACION' | 'RECHAZADA'> {
  if (aceptadas > 0) return 'EN_REPARACION';
  return esPrimeraSolicitud ? 'RECHAZADA' : 'EN_REPARACION';
}
