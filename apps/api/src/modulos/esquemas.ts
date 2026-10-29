import type { Cliente, Empleado, Usuario } from '@prisma/client';
import { z } from '../openapi/zod';
import { RE_FECHA } from '../lib/fechas';
import { DIAS_RECUPERACION } from '../servicios/bajas';

// Esquemas compartidos de entrada y salida. Los de salida solo documentan; los de entrada validan.

export const Id = z.string().min(1).max(40).openapi({ example: 'cm3x8k2p40000abcd1234efgh' });
export const ParamId = z.object({ id: Id });
export const Dia = z.string().regex(RE_FECHA, 'Usa el formato yyyy-MM-dd').openapi({ example: '2026-11-10' });
export const Instante = z.iso.datetime({ offset: true }).openapi({ example: '2026-11-10T08:30:00.000Z' });
export const Centimos = z.number().int().openapi({ description: 'Importe en céntimos', example: 12100 });
export const TextoCorto = z.string().trim().min(1).max(200);
export const TextoLargo = z.string().trim().min(1).max(2000);
export const Rol = z.enum(['CLIENTE', 'MECANICO', 'JEFE', 'DUENO']);
export const Ok = z.object({ ok: z.literal(true) });

export const ClienteSchema = z
  .object({
    id: Id,
    tipo: z.enum(['INDIVIDUAL', 'EMPRESA']),
    telefono: z.string(),
    razonSocial: z.string().nullable(),
    nif: z.string().nullable(),
  })
  .openapi('Cliente');

export const UsuarioSchema = z
  .object({
    id: Id,
    email: z.email(),
    nombre: z.string(),
    rol: Rol,
    activo: z.boolean(),
    cliente: ClienteSchema.nullable(),
    empleadoId: Id.nullable(),
    enBaja: z
      .object({ desde: z.string(), hasta: z.string() })
      .nullable()
      .openapi({ description: 'Si el cliente se dio de baja: hasta cuándo puede recuperar la cuenta' }),
  })
  .openapi('Usuario');

export function aUsuario(u: Usuario & { cliente?: Cliente | null; empleado?: Empleado | null }) {
  return {
    id: u.id,
    email: u.email,
    nombre: u.nombre,
    rol: u.rol,
    activo: u.activo,
    cliente: u.cliente ? { id: u.cliente.id, tipo: u.cliente.tipo, telefono: u.cliente.telefono, razonSocial: u.cliente.razonSocial, nif: u.cliente.nif } : null,
    empleadoId: u.empleado?.id ?? null,
    enBaja:
      !u.activo && u.bajaSolicitadaEn && !u.desvinculadoEn
        ? { desde: u.bajaSolicitadaEn.toISOString(), hasta: new Date(u.bajaSolicitadaEn.getTime() + DIAS_RECUPERACION * 86_400_000).toISOString() }
        : null,
  };
}

export const lista = <T extends z.ZodType>(item: T) => z.object({ datos: z.array(item) });
