import { z } from '../openapi/zod';

/**
 * Paginación común de los listados. Parámetros de query:
 * - `pagina`: desde 1 (por defecto 1). Una página más allá de la última devuelve `datos: []` con el total real.
 * - `porPagina`: 10, 25, 50 o 100 (por defecto 25).
 * - `orden`: campo por el que ordenar, de una lista cerrada por listado (por defecto, el natural de cada uno).
 * - `dir`: `asc` o `desc` (por defecto, el natural del campo).
 * La respuesta lleva `total`, `pagina`, `porPagina` y `paginas`: nunca se corta en silencio.
 */
export const TAMANOS_PAGINA = [10, 25, 50, 100] as const;
export const POR_PAGINA_DEFECTO = 25;

export type Dir = 'asc' | 'desc';
export interface Paginacion<C extends string = string> {
  pagina: number;
  porPagina: number;
  orden?: C;
  dir?: Dir;
}

/** Campos de query de la paginación, para añadir a la query de cada listado (`z.object({ ...filtros, ...consultaPaginada(...) })`). */
export function consultaPaginada<const C extends readonly [string, ...string[]]>(campos: C) {
  return {
    pagina: z.coerce.number().int().min(1).max(1_000_000).default(1).openapi({ description: 'Página, desde 1', example: 1 }),
    porPagina: z
      .enum(['10', '25', '50', '100'])
      .default(String(POR_PAGINA_DEFECTO) as '25')
      .transform(Number)
      .openapi({ description: 'Elementos por página: 10, 25, 50 o 100' }),
    orden: z.enum(campos).optional().openapi({ description: `Ordenar por: ${campos.join(', ')}` }),
    dir: z.enum(['asc', 'desc']).optional().openapi({ description: 'Sentido del orden' }),
  };
}

/** Esquema de respuesta de un listado paginado. */
export const listaPaginada = <T extends z.ZodType>(item: T) =>
  z.object({
    datos: z.array(item),
    total: z.number().int().openapi({ description: 'Elementos que cumplen los filtros, en todas las páginas' }),
    pagina: z.number().int(),
    porPagina: z.number().int(),
    paginas: z.number().int().openapi({ description: 'Número de páginas (al menos 1)' }),
  });

/** `skip` y `take` de Prisma para la página pedida. */
export const saltoYTope = (q: Paginacion) => ({ skip: (q.pagina - 1) * q.porPagina, take: q.porPagina });

/** Respuesta de una página. */
export function pagina<T>(datos: T[], total: number, q: Paginacion) {
  return { datos, total, pagina: q.pagina, porPagina: q.porPagina, paginas: Math.max(1, Math.ceil(total / q.porPagina)) };
}

/** Para listados que se calculan en memoria (p. ej. jornadas agrupadas por día). */
export function paginarEnMemoria<T>(todos: T[], q: Paginacion) {
  const { skip, take } = saltoYTope(q);
  return pagina(todos.slice(skip, skip + take), todos.length, q);
}

/**
 * `orderBy` de Prisma para el campo pedido, con el `id` como desempate: así una fila no puede salir en dos páginas
 * ni en ninguna cuando varias tienen el mismo valor.
 */
export function ordenar<O, C extends string = string>(q: Paginacion<C>, campos: Record<C, (dir: Dir) => NoInfer<O>>, porDefecto: { orden: NoInfer<C>; dir: Dir }): O[] {
  const campo = q.orden ?? porDefecto.orden;
  const dir = q.dir ?? (campo === porDefecto.orden ? porDefecto.dir : 'asc');
  return [campos[campo](dir), { id: dir } as O];
}
