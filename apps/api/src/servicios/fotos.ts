import type { Prisma, Usuario } from '@prisma/client';
import { prisma } from '../db';
import { reloj } from '../lib/reloj';
import { log } from '../lib/log';
import { noEncontrado, reglaNegocio } from '../lib/errores';
import { esPersonal } from './acceso';

export const TIPOS_FOTO = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type TipoFoto = (typeof TIPOS_FOTO)[number];
export const MAX_BYTES_FOTO = 5 * 1024 * 1024;
export const MAX_FOTOS_POR_TRABAJO = 6;
const HORAS_HUERFANA = 24;

/** Formato real según los primeros bytes. No se confía en el nombre ni en la cabecera del navegador. */
export function formatoReal(b: Buffer): TipoFoto | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length >= 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

export const urlFoto = (f: { id: string; url: string | null }) => f.url ?? `/api/fotos/${f.id}`;

/**
 * Adjunta fotos sueltas a un trabajo dentro de la transacción. Solo valen las que subió el mismo usuario
 * y aún no están adjuntas; si alguna falla, se lanza y la transacción entera se deshace.
 */
export async function adjuntarFotos(tx: Prisma.TransactionClient, partidaId: string, fotoIds: string[], usuarioId: string) {
  if (!fotoIds.length) return;
  const ya = await tx.fotoTrabajo.count({ where: { partidaId } });
  if (ya + fotoIds.length > MAX_FOTOS_POR_TRABAJO) throw reglaNegocio('DEMASIADAS_FOTOS', `Como mucho ${MAX_FOTOS_POR_TRABAJO} fotos por trabajo`);
  const n = await tx.fotoTrabajo.updateMany({ where: { id: { in: fotoIds }, partidaId: null, subidaPorId: usuarioId }, data: { partidaId } });
  if (n.count !== new Set(fotoIds).size || n.count !== fotoIds.length) {
    throw reglaNegocio('FOTO_NO_VALIDA', 'Alguna foto no existe, ya está en otro trabajo o la subió otra persona. Vuelve a subirla');
  }
}

/** Foto que el usuario puede ver: el personal, las de cualquier trabajo; el cliente, las de sus órdenes; nadie, las sueltas de otro. */
export async function fotoVisible(u: Usuario, id: string) {
  const f = await prisma.fotoTrabajo.findUnique({
    where: { id },
    include: { partida: { include: { solicitud: { include: { orden: { include: { cita: { include: { cliente: true } } } } } } } } },
  });
  if (!f || !f.datos || !f.tipoContenido) throw noEncontrado('La foto');
  const visible = f.partida ? esPersonal(u) || f.partida.solicitud.orden.cita.cliente.usuarioId === u.id : f.subidaPorId === u.id;
  if (!visible) throw noEncontrado('La foto');
  return { datos: f.datos, tipo: f.tipoContenido };
}

/** Borra las fotos subidas que nadie adjuntó en 24 h (el mecánico cerró el diálogo sin enviar). */
export async function limpiarFotosHuerfanas(): Promise<number> {
  const limite = new Date(reloj.ahora().getTime() - HORAS_HUERFANA * 3_600_000);
  const { count } = await prisma.fotoTrabajo.deleteMany({ where: { partidaId: null, subidaEn: { lt: limite } } });
  if (count) log('info', 'fotos sin adjuntar borradas', { n: count });
  return count;
}

export function arrancarLimpiezaFotos(cadaMs = 3_600_000) {
  const t = setInterval(() => void limpiarFotosHuerfanas().catch((e) => log('error', 'fallo limpiando fotos', { error: String(e) })), cadaMs);
  return () => clearInterval(t);
}
