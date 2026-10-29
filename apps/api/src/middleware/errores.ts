import { randomUUID } from 'node:crypto';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { ErrorApp } from '../lib/errores';
import { esRutaBinaria } from '../lib/ruta';
import { log } from '../lib/log';
import { TransicionInvalida } from '../domain/estadoOrden';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

export const idPeticion: RequestHandler = (req, res, next) => {
  const entrante = req.get('X-Request-Id');
  req.id = entrante && /^[\w-]{8,64}$/.test(entrante) ? entrante : randomUUID();
  res.setHeader('X-Request-Id', req.id);
  const inicio = process.hrtime.bigint();
  res.on('finish', () => {
    log('info', 'peticion', {
      requestId: req.id,
      metodo: req.method,
      ruta: req.originalUrl.split('?')[0],
      estado: res.statusCode,
      ms: Number((process.hrtime.bigint() - inicio) / 1_000_000n),
    });
  });
  next();
};

/** Protección CSRF: un formulario de otro sitio no puede enviar application/json sin CORS. */
export const exigirJson: RequestHandler = (req, _res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !req.is('application/json') && !esRutaBinaria(req)) {
    return next(new ErrorApp(415, 'TIPO_NO_SOPORTADO', 'Envía los datos como application/json'));
  }
  next();
};

export const rutaNoEncontrada: RequestHandler = (_req, _res, next) => next(new ErrorApp(404, 'RUTA_NO_ENCONTRADA', 'Esa ruta no existe'));

/** Traduce cualquier error a { error, codigo, detalles?, requestId }. Nunca devuelve la traza. */
export const manejarErrores: ErrorRequestHandler = (e, req, res, _next) => {
  let error: ErrorApp;
  if (e instanceof ErrorApp) error = e;
  else if (e instanceof TransicionInvalida) error = new ErrorApp(409, 'TRANSICION_NO_PERMITIDA', e.message);
  else if (e?.type === 'entity.too.large') error = new ErrorApp(413, 'DEMASIADO_GRANDE', 'Los datos enviados son demasiado grandes');
  else if (e?.type === 'entity.parse.failed') error = new ErrorApp(400, 'JSON_INVALIDO', 'El cuerpo no es JSON válido');
  else if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    error = new ErrorApp(409, 'DUPLICADO', `Ya existe un registro con ese valor (${(e.meta?.target as string[] | undefined)?.join(', ') ?? 'campo único'})`);
  } else if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') error = new ErrorApp(404, 'NO_ENCONTRADO', 'El recurso no existe');
  else if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2034') {
    error = new ErrorApp(409, 'CONFLICTO_CONCURRENCIA', 'Otra operación ha cambiado estos datos a la vez. Vuelve a intentarlo');
  } else {
    log('error', 'error no controlado', { requestId: req.id, error: String(e?.stack ?? e) });
    error = new ErrorApp(500, 'ERROR_INTERNO', 'Algo ha fallado. Inténtalo de nuevo en unos minutos');
  }
  if (res.headersSent) return;
  res.status(error.estado).json({ error: error.message, codigo: error.codigo, detalles: error.detalles, requestId: req.id });
};
