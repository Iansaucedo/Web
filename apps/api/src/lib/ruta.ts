import express, { type NextFunction, type Request, type Response, type Router } from 'express';
import type { Rol, Usuario } from '@prisma/client';
import type { RouteConfig } from '@asteasolutions/zod-to-openapi';
import { z } from '../openapi/zod';
import { registro, ErrorSchema } from '../openapi/registro';
import { autenticar, enPlazoDeRecuperacion } from '../middleware/auth';
import { prohibido, ErrorApp } from './errores';
import { conIdempotencia } from '../middleware/idempotencia';

type Metodo = 'get' | 'post' | 'put' | 'patch' | 'delete';
type Acceso = 'publico' | 'autenticado' | Rol[];

export interface Contexto<P, Q, B> {
  req: Request;
  res: Response;
  params: P;
  query: Q;
  cuerpo: B;
  /** Usuario que llama, leído de la base de datos en cada petición (no del token). */
  usuario: Usuario;
}

export interface DefRuta<P extends z.ZodType, Q extends z.ZodType, B extends z.ZodType> {
  metodo: Metodo;
  /** Ruta con estilo Express, sin /api: "/citas/:id". */
  ruta: string;
  etiqueta: string;
  resumen: string;
  descripcion?: string;
  /** Por defecto, cualquier usuario autenticado. El dueño pasa cualquier lista de roles. */
  acceso?: Acceso;
  params?: P;
  query?: Q;
  cuerpo?: B;
  respuesta?: z.ZodType;
  /** 200 por defecto. Con 204 no se envía cuerpo. */
  codigo?: 200 | 201 | 204;
  /** Tipo de contenido si no es JSON (PDF, CSV, imagen, redirección). El manejador escribe la respuesta. */
  produce?: 'application/pdf' | 'text/csv' | 'imagen' | 'redireccion';
  /**
   * El cuerpo es un archivo binario (una foto), no JSON. Llega como Buffer en `cuerpo` y solo se aceptan
   * estos tipos y este tamaño. Es la única excepción a «toda petición con cuerpo es JSON».
   */
  binario?: { tipos: readonly string[]; maxBytes: number };
  /** Códigos de error que puede devolver la ruta, además de los genéricos. */
  errores?: Partial<Record<400 | 401 | 403 | 404 | 409 | 413 | 415 | 422 | 429 | 503, string>>;
  /** Disponible también para una cuenta en autobaja (solo «me», salir y recuperar la cuenta). */
  permiteEnBaja?: boolean;
  /** Acepta la cabecera Idempotency-Key (todas las POST que crean algo). */
  idempotente?: boolean;
  manejador: (ctx: Contexto<z.infer<P>, z.infer<Q>, z.infer<B>>) => Promise<unknown>;
}

const TIPOS_IMAGEN = ['image/jpeg', 'image/png', 'image/webp'];
const patron = (ruta: string) => new RegExp(`^${ruta.replace(/:[A-Za-z]+/g, '[^/]+')}/?$`);

/** ¿La petición va a una ruta que recibe un archivo binario? (`exigirJson` la deja pasar y la ruta valida el tipo). */
export function esRutaBinaria(req: Request) {
  return definidas.some((d) => d.binario && d.metodo === req.method.toLowerCase() && patron(d.ruta).test(req.path));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const definidas: DefRuta<any, any, any>[] = [];

/**
 * Define una ruta una sola vez: valida la entrada con zod, aplica acceso e idempotencia,
 * la monta en Express y la documenta en OpenAPI. Así no puede existir una ruta sin documentar.
 */
export function definir<
  P extends z.ZodType = z.ZodObject<{}>,
  Q extends z.ZodType = z.ZodObject<{}>,
  B extends z.ZodType = z.ZodObject<{}>,
>(def: DefRuta<P, Q, B>): void {
  definidas.push(def);
}

export function rutasDefinidas() {
  return definidas.map((d) => ({ metodo: d.metodo, ruta: d.ruta }));
}

const aOpenApi = (ruta: string) => ruta.replace(/:([A-Za-z]+)/g, '{$1}');

const DESCRIPCION_ERROR: Record<number, string> = {
  400: 'Datos no válidos (ver `detalles`)',
  401: 'Sin sesión, sesión caducada o usuario dado de baja',
  403: 'El rol del usuario no permite esta operación',
  404: 'No existe o no pertenece al usuario',
  409: 'Conflicto con el estado actual (p. ej. ya respondida, franja llena)',
  413: 'Cuerpo demasiado grande',
  415: 'Las peticiones con cuerpo deben ser application/json',
  429: 'Demasiadas peticiones seguidas (ver cabecera Retry-After)',
  422: 'Incumple una regla de negocio',
};

function documentar(def: DefRuta<z.ZodType, z.ZodType, z.ZodType>) {
  const acceso = def.acceso ?? 'autenticado';
  const roles = Array.isArray(acceso) ? acceso : null;
  const respuestas: RouteConfig['responses'] = {};
  const codigo = def.codigo ?? 200;
  if (def.produce === 'redireccion') respuestas[302] = { description: 'Redirección' };
  else if (def.produce === 'imagen') respuestas[codigo] = { description: 'Imagen', content: Object.fromEntries(TIPOS_IMAGEN.map((t) => [t, { schema: z.string().openapi({ format: 'binary' }) }])) };
  else if (def.produce) respuestas[codigo] = { description: 'Archivo', content: { [def.produce]: { schema: z.string() } } };
  else if (codigo === 204) respuestas[204] = { description: 'Hecho, sin contenido' };
  else respuestas[codigo] = { description: 'Correcto', content: { 'application/json': { schema: def.respuesta ?? z.object({}) } } };

  const errores = { 400: DESCRIPCION_ERROR[400], ...def.errores } as Record<number, string>;
  if (acceso !== 'publico') errores[401] ??= DESCRIPCION_ERROR[401];
  if (roles) errores[403] ??= `Solo ${roles.join(', ')} (y el dueño)`;
  if (def.cuerpo) errores[415] ??= DESCRIPCION_ERROR[415];
  if (def.binario) {
    errores[413] ??= `El archivo pasa de ${def.binario.maxBytes / 1024 / 1024} MB`;
    errores[415] ??= `Solo ${def.binario.tipos.join(', ')}`;
  }
  errores[429] ??= DESCRIPCION_ERROR[429];
  for (const [c, texto] of Object.entries(errores)) {
    respuestas[Number(c)] = { description: texto ?? DESCRIPCION_ERROR[Number(c)], content: { 'application/json': { schema: ErrorSchema } } };
  }

  const cabeceras = def.idempotente
    ? z.object({
        'idempotency-key': z.string().min(8).max(100).optional().openapi({
          description: 'Clave única por intento. Repetir la petición con la misma clave devuelve la respuesta original.',
          example: '7b1f8a2e-3c4d-4e5f-9a6b-1c2d3e4f5a6b',
        }),
      })
    : undefined;

  registro.registerPath({
    method: def.metodo,
    path: `/api${aOpenApi(def.ruta)}`,
    tags: [def.etiqueta],
    summary: def.resumen,
    description: [def.descripcion, roles ? `**Acceso:** ${roles.join(', ')} y dueño.` : acceso === 'publico' ? '**Acceso:** público.' : '**Acceso:** cualquier usuario con sesión.'].filter(Boolean).join('\n\n'),
    security: acceso === 'publico' ? [] : [{ cookieSesion: [] }],
    request: {
      params: def.params as z.ZodObject | undefined,
      query: def.query as z.ZodObject | undefined,
      headers: cabeceras,
      body: def.binario
        ? { required: true, content: Object.fromEntries(def.binario.tipos.map((t) => [t, { schema: z.string().openapi({ format: 'binary' }) }])) }
        : def.cuerpo
          ? { required: true, content: { 'application/json': { schema: def.cuerpo } } }
          : undefined,
    },
    responses: respuestas,
  });
}

function validar<T>(esquema: z.ZodType<T> | undefined, valor: unknown, donde: string): T {
  if (!esquema) return {} as T;
  const r = esquema.safeParse(valor ?? {});
  if (r.success) return r.data;
  throw new ErrorApp(
    400,
    'VALIDACION',
    'Revisa los datos enviados',
    r.error.issues.map((i) => ({ campo: [donde, ...i.path].join('.'), mensaje: i.message })),
  );
}

let documentadas = false;

export function montarRutas(router: Router) {
  if (!documentadas) definidas.forEach(documentar);
  documentadas = true;
  for (const def of definidas) {
    const acceso = def.acceso ?? 'autenticado';
    const previos = def.binario ? [express.raw({ type: [...def.binario.tipos], limit: def.binario.maxBytes })] : [];
    router[def.metodo](def.ruta, ...previos, async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (def.binario && !req.is([...def.binario.tipos])) {
          throw new ErrorApp(415, 'TIPO_NO_SOPORTADO', 'Sube la foto en JPEG, PNG o WebP');
        }
        const usuario = await autenticar(req, acceso !== 'publico');
        if (usuario && enPlazoDeRecuperacion(usuario) && !def.permiteEnBaja) {
          throw new ErrorApp(403, 'CUENTA_EN_BAJA', 'Tu cuenta está dada de baja. Recupérala para seguir usándola');
        }
        if (Array.isArray(acceso) && usuario!.rol !== 'DUENO' && !acceso.includes(usuario!.rol)) throw prohibido();
        const ctx = {
          req,
          res,
          params: validar(def.params, req.params, 'params'),
          // Query estricta: un parámetro desconocido o anidado (?estado[$ne]=x) es un error, no se ignora en silencio.
          query: validar(def.query instanceof z.ZodObject ? def.query.strict() : def.query, req.query, 'query'),
          cuerpo: def.binario ? req.body : validar(def.cuerpo, req.body, 'cuerpo'),
          usuario: usuario!,
        };
        const ejecutar = () => def.manejador(ctx);
        const resultado = def.idempotente && usuario ? await conIdempotencia(req, res, usuario.id, def.codigo ?? 200, ejecutar) : await ejecutar();
        if (res.headersSent || def.produce) return;
        if (def.codigo === 204) res.status(204).end();
        else res.status(def.codigo ?? 200).json(resultado ?? {});
      } catch (e) {
        next(e);
      }
    });
  }
}
