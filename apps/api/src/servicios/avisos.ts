import type { Prisma, Rol } from '@prisma/client';
import type { Tx } from '../lib/transaccion';
import type { NombrePlantilla } from '../emails/plantillas';

export interface Aviso {
  tipo: NombrePlantilla;
  /** Texto corto del aviso en la web (campana). */
  mensaje: string;
  /** Ruta de la web, p. ej. /ordenes/abc. */
  enlace: string;
  /** Datos de la plantilla del email. Sin email si es `null`. */
  datos: Record<string, unknown> | null;
  adjuntoFacturaOrdenId?: string;
}

const web = () => process.env.PUBLIC_WEB_URL ?? 'http://localhost:3000';

/**
 * Crea el aviso en la web y deja el email en la bandeja de salida, dentro de la misma transacción
 * que el cambio que lo provoca: o se guardan los tres, o ninguno.
 */
export async function avisar(tx: Tx, usuarioId: string, aviso: Aviso) {
  const usuario = await tx.usuario.findUniqueOrThrow({ where: { id: usuarioId } });
  if (!usuario.activo) return;
  await tx.notificacion.create({ data: { usuarioId, tipo: aviso.tipo, mensaje: aviso.mensaje.slice(0, 300), enlace: aviso.enlace } });
  if (aviso.datos) {
    await tx.emailSaliente.create({
      data: {
        para: usuario.email,
        plantilla: aviso.tipo,
        datos: { nombre: usuario.nombre, ...aviso.datos, enlace: `${web()}${aviso.enlace}` } as Prisma.InputJsonValue,
        adjuntoFacturaOrdenId: aviso.adjuntoFacturaOrdenId,
      },
    });
  }
}

/** Avisa a todos los usuarios activos con alguno de esos roles (p. ej. a los jefes de taller). */
export async function avisarRoles(tx: Tx, roles: Rol[], aviso: Aviso) {
  const destinatarios = await tx.usuario.findMany({ where: { rol: { in: roles }, activo: true }, select: { id: true } });
  for (const d of destinatarios) await avisar(tx, d.id, aviso);
}

/** Email a alguien que aún no tiene cuenta (invitaciones). */
export async function emailSinCuenta(tx: Tx, para: string, tipo: NombrePlantilla, datos: Record<string, unknown>, enlace: string) {
  await tx.emailSaliente.create({ data: { para, plantilla: tipo, datos: { ...datos, enlace: `${web()}${enlace}` } as Prisma.InputJsonValue } });
}
