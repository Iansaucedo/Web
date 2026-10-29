import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { conflicto, ErrorApp } from '../lib/errores';

/**
 * Ejecuta `fn` como mucho una vez por (usuario, Idempotency-Key).
 * - Primera vez: reserva la clave, ejecuta y guarda la respuesta.
 * - Repetida con la misma petición: devuelve la respuesta guardada (cabecera Idempotent-Replayed).
 * - Repetida mientras la primera sigue en curso: 409, el cliente puede reintentar.
 * - Misma clave con otra petición: 422, es un error del cliente.
 * Si `fn` falla, la clave se libera para poder reintentar.
 */
export async function conIdempotencia(req: Request, res: Response, usuarioId: string, codigo: number, fn: () => Promise<unknown>) {
  const clave = req.get('Idempotency-Key');
  if (!clave) return fn();
  if (clave.length < 8 || clave.length > 100) throw new ErrorApp(400, 'VALIDACION', 'Idempotency-Key debe tener entre 8 y 100 caracteres');

  const hashCuerpo = createHash('sha256').update(JSON.stringify(req.body ?? {})).digest('hex');
  const ruta = req.originalUrl.split('?')[0];
  let id: string;
  try {
    ({ id } = await prisma.claveIdempotencia.create({ data: { usuarioId, clave, metodo: req.method, ruta, hashCuerpo } }));
  } catch (e) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
    const previa = await prisma.claveIdempotencia.findUnique({ where: { usuarioId_clave: { usuarioId, clave } } });
    if (!previa || previa.ruta !== ruta || previa.metodo !== req.method || previa.hashCuerpo !== hashCuerpo) {
      throw new ErrorApp(422, 'IDEMPOTENCIA_REUTILIZADA', 'Esa Idempotency-Key ya se usó con otra petición');
    }
    if (previa.codigo === null) throw conflicto('PETICION_EN_CURSO', 'La misma petición se está procesando. Reinténtalo en un momento');
    res.setHeader('Idempotent-Replayed', 'true');
    res.status(previa.codigo).json(previa.respuesta);
    return undefined;
  }

  try {
    const resultado = await fn();
    await prisma.claveIdempotencia.update({ where: { id }, data: { codigo, respuesta: (resultado ?? {}) as Prisma.InputJsonValue } });
    return resultado;
  } catch (e) {
    await prisma.claveIdempotencia.delete({ where: { id } }).catch(() => undefined);
    throw e;
  }
}
