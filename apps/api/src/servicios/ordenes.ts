import type { EstadoOrden, Prisma, Usuario } from '@prisma/client';
import { prisma } from '../db';
import type { Tx } from '../lib/transaccion';
import { bloquear } from '../lib/transaccion';
import { conflicto, noEncontrado, reglaNegocio } from '../lib/errores';
import { esPersonal } from './acceso';
import { numeroOrden } from '../emails/formato';

/** Orden accesible: el personal ve todas; el cliente solo las de sus vehículos (404 si no). */
export async function ordenAccesible(u: Usuario, id: string) {
  const o = await prisma.orden.findUnique({ where: { id }, include: { vehiculo: true, cita: { include: { cliente: { include: { usuario: true } } } } } });
  if (!o || (!esPersonal(u) && o.cita.cliente.usuarioId !== u.id)) throw noEncontrado('La orden');
  return o;
}

/**
 * Bloquea la orden para el resto de la transacción y comprueba su estado.
 * Todas las escrituras sobre una orden pasan por aquí: así dos acciones simultáneas
 * (completar mientras se registra una pieza, por ejemplo) se ejecutan una detrás de otra.
 */
export async function bloquearOrden(tx: Tx, ordenId: string, permitidos: EstadoOrden[], accion: string) {
  await bloquear(tx, `orden:${ordenId}`);
  const o = await tx.orden.findUnique({ where: { id: ordenId }, include: { vehiculo: true, cita: { include: { cliente: { include: { usuario: true } } } } } });
  if (!o) throw noEncontrado('La orden');
  if (!permitidos.includes(o.estado)) throw conflicto('ESTADO_NO_PERMITE', `No se puede ${accion} con la orden en estado ${o.estado.replace(/_/g, ' ').toLowerCase()}`);
  return o;
}

/** Partida con su orden, bloqueando la orden. Exige que el trabajo esté aceptado y sin terminar. */
export async function partidaParaTrabajar(tx: Tx, partidaId: string, accion: string, opciones: { permitirTerminada?: boolean } = {}) {
  const p = await tx.partida.findUnique({ where: { id: partidaId }, include: { solicitud: true } });
  if (!p) throw noEncontrado('El trabajo');
  const orden = await bloquearOrden(tx, p.solicitud.ordenId, ['EN_REPARACION', 'ESPERANDO_PIEZAS'], accion);
  const actual = await tx.partida.findUniqueOrThrow({ where: { id: partidaId } });
  if (actual.estado !== 'ACEPTADA') throw reglaNegocio('TRABAJO_NO_ACEPTADO', 'Ese trabajo no está aceptado por el cliente');
  if (actual.terminadaEn && !opciones.permitirTerminada) throw conflicto('TRABAJO_TERMINADO', 'Ese trabajo ya está marcado como terminado');
  return { partida: actual, orden };
}

export const datosVehiculo = (o: { numero: number; vehiculo: { marca: string; modelo: string; matricula: string } }) => ({
  orden: numeroOrden(o.numero),
  marca: o.vehiculo.marca,
  modelo: o.vehiculo.modelo,
  matricula: o.vehiculo.matricula,
});

export type OrdenConCliente = Prisma.OrdenGetPayload<{ include: { vehiculo: true; cita: { include: { cliente: { include: { usuario: true } } } } } }>;
