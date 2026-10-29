import type { Rol, Usuario } from '@prisma/client';
import { prisma } from '../db';
import { noEncontrado, prohibido, reglaNegocio } from '../lib/errores';

export const PERSONAL: Rol[] = ['MECANICO', 'JEFE', 'DUENO'];
export const GESTION: Rol[] = ['JEFE', 'DUENO'];
export const esPersonal = (u: Usuario) => PERSONAL.includes(u.rol);
export const esGestion = (u: Usuario) => GESTION.includes(u.rol);

/** Cliente del usuario. Sin perfil completo no puede operar (registrar vehículos, reservar…). */
export async function clienteDe(u: Usuario) {
  const c = await prisma.cliente.findUnique({ where: { usuarioId: u.id } });
  if (!c) throw reglaNegocio('PERFIL_INCOMPLETO', 'Completa tu perfil antes de continuar');
  return c;
}

/** Empleado del usuario. El dueño puede no tenerlo: se le crea al primer uso. */
export async function empleadoDe(u: Usuario) {
  if (!esPersonal(u)) throw prohibido();
  return prisma.empleado.upsert({ where: { usuarioId: u.id }, create: { usuarioId: u.id }, update: {} });
}

/**
 * Vehículo accesible para el usuario: el personal ve todos; un cliente solo los suyos.
 * Si no es suyo responde 404 igual que si no existiera.
 */
export async function vehiculoAccesible(u: Usuario, id: string) {
  const v = await prisma.vehiculo.findUnique({ where: { id }, include: { cliente: { include: { usuario: true } }, ordenes: { where: { estado: { not: 'ENTREGADA' } }, select: { id: true } } } });
  // Un vehículo dado de baja ya no existe para su cliente; el personal lo sigue viendo (historial).
  if (!v || (!esPersonal(u) && (v.cliente.usuarioId !== u.id || v.eliminadoEn))) throw noEncontrado('El vehículo');
  return v;
}
