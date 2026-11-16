'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ErrorApi, mensajeError, nuevaClave } from './api';
import type { Paginada } from './tipos';
import { useAvisos } from '../components/Avisos';

/** Carga `ruta` (null = no cargar) y permite recargar. Ignora respuestas de cargas anteriores. */
export function useDatos<T>(ruta: string | null) {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<ErrorApi | null>(null);
  const [cargando, setCargando] = useState(Boolean(ruta));
  const turno = useRef(0);

  const recargar = useCallback(async () => {
    if (!ruta) return;
    const mio = ++turno.current;
    setCargando(true);
    try {
      const d = await api.get<T>(ruta);
      if (mio === turno.current) {
        setDatos(d);
        setError(null);
      }
    } catch (e) {
      if (mio === turno.current) setError(e instanceof ErrorApi ? e : new ErrorApi(0, 'ERROR', mensajeError(e)));
    } finally {
      if (mio === turno.current) setCargando(false);
    }
  }, [ruta]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  return { datos, error, cargando, recargar, setDatos };
}

/**
 * Ejecuta una acción del usuario: bloquea el botón mientras dura (no hay doble envío),
 * reutiliza la misma Idempotency-Key si hay que reintentar y muestra el resultado.
 */
export function useAccion() {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clave = useRef(nuevaClave());
  const { avisar } = useAvisos();

  const ejecutar = useCallback(
    async <R,>(fn: (clave: string) => Promise<R>, exito?: string): Promise<R | undefined> => {
      if (ocupado) return undefined;
      setOcupado(true);
      setError(null);
      try {
        const r = await fn(clave.current);
        clave.current = nuevaClave();
        if (exito) avisar(exito, 'success');
        // Una respuesta 204 no trae cuerpo: se devuelve `true` para distinguir el éxito del error.
        return (r === undefined ? true : r) as R;
      } catch (e) {
        // Si el servidor ya decidió (4xx), la próxima vez es otra petición; si fue la red, se reintenta con la misma clave.
        if (e instanceof ErrorApi && e.estado >= 400 && e.estado < 500) clave.current = nuevaClave();
        setError(mensajeError(e));
        return undefined;
      } finally {
        setOcupado(false);
      }
    },
    [ocupado, avisar],
  );

  return { ejecutar, ocupado, error, limpiarError: () => setError(null) };
}

// ─── Listados paginados ──────────────────────────────────────────────

export const TAMANOS_PAGINA = [10, 25, 50, 100] as const;
export type TamanoPagina = (typeof TAMANOS_PAGINA)[number];
export type Dir = 'asc' | 'desc';

export interface OpcionesListado {
  /** Tamaño de página inicial (25 si no se indica). */
  porPagina?: TamanoPagina;
  /** Orden inicial; sin él, el natural de la API para ese listado. */
  orden?: string;
  dir?: Dir;
  /** Prefijo de los parámetros en la URL, para dos listados en la misma pantalla (`c` → `cpagina`, `corden`…). */
  prefijo?: string;
  /** Reflejar página, tamaño y orden en la URL (por defecto sí): se pueden compartir, recargar y volver atrás. */
  enUrl?: boolean;
}

interface EstadoListado {
  pagina: number;
  porPagina: TamanoPagina;
  orden?: string;
  dir?: Dir;
}

function leerDeUrl(pre: string, op: OpcionesListado): EstadoListado {
  const base: EstadoListado = { pagina: 1, porPagina: op.porPagina ?? 25, orden: op.orden, dir: op.dir };
  if (op.enUrl === false || typeof window === 'undefined') return base;
  const u = new URLSearchParams(window.location.search);
  const pagina = Number(u.get(`${pre}pagina`));
  const porPagina = Number(u.get(`${pre}porPagina`)) as TamanoPagina;
  const dir = u.get(`${pre}dir`);
  return {
    pagina: Number.isInteger(pagina) && pagina >= 1 ? pagina : base.pagina,
    porPagina: TAMANOS_PAGINA.includes(porPagina) ? porPagina : base.porPagina,
    orden: u.get(`${pre}orden`) ?? base.orden,
    dir: dir === 'asc' || dir === 'desc' ? dir : base.dir,
  };
}

/**
 * Carga un listado paginado de la API (`pagina`, `porPagina`, `orden`, `dir`) con sus filtros.
 * - Cambiar un filtro vuelve a la página 1 (sin una petición intermedia con la página antigua).
 * - Si la página pedida ya no existe (se borró algo), va a la última.
 * - Página, tamaño y orden van en la URL, salvo los valores por defecto.
 */
export function useListado<T>(ruta: string | null, filtros: Record<string, string | number | boolean | null | undefined> = {}, op: OpcionesListado = {}) {
  const pre = op.prefijo ?? '';
  const [estado, setEstado] = useState<EstadoListado>(() => leerDeUrl(pre, op));
  // Filtros sin los vacíos, en un orden estable: su clave decide cuándo volver a la página 1.
  const limpios = Object.entries(filtros)
    .filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== false)
    .map(([k, v]) => [k, String(v)] as const)
    .sort(([a], [b]) => a.localeCompare(b));
  const claveFiltros = JSON.stringify(limpios);
  const [filtrosVistos, setFiltrosVistos] = useState(claveFiltros);
  if (filtrosVistos !== claveFiltros) {
    // Ajuste durante el render (patrón de React para estado derivado): la siguiente petición ya va a la página 1.
    setFiltrosVistos(claveFiltros);
    if (estado.pagina !== 1) setEstado((e) => ({ ...e, pagina: 1 }));
  }
  const pagina = filtrosVistos === claveFiltros ? estado.pagina : 1;

  const params = new URLSearchParams(limpios as [string, string][]);
  params.set('pagina', String(pagina));
  params.set('porPagina', String(estado.porPagina));
  if (estado.orden) params.set('orden', estado.orden);
  if (estado.dir) params.set('dir', estado.dir);
  const completa = ruta ? `${ruta}${ruta.includes('?') ? '&' : '?'}${params}` : null;
  const d = useDatos<Paginada<T>>(completa);

  // Reflejo en la URL (sin recargar ni añadir entradas al historial).
  const enUrl = op.enUrl !== false;
  const porDefecto = op.porPagina ?? 25;
  useEffect(() => {
    if (!enUrl) return;
    const u = new URLSearchParams(window.location.search);
    const fijar = (k: string, v: string | undefined, def?: string) => (v && v !== def ? u.set(`${pre}${k}`, v) : u.delete(`${pre}${k}`));
    fijar('pagina', String(pagina), '1');
    fijar('porPagina', String(estado.porPagina), String(porDefecto));
    fijar('orden', estado.orden, op.orden);
    fijar('dir', estado.dir, op.dir);
    const q = u.toString();
    const nueva = `${window.location.pathname}${q ? `?${q}` : ''}${window.location.hash}`;
    if (nueva !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.replaceState(window.history.state, '', nueva);
  }, [enUrl, pre, pagina, estado.porPagina, estado.orden, estado.dir, porDefecto, op.orden, op.dir]);

  // Página que ya no existe (p. ej. tras borrar el último elemento de la última página): a la última que hay.
  const paginasReales = d.datos?.paginas;
  useEffect(() => {
    if (paginasReales && pagina > paginasReales) setEstado((e) => ({ ...e, pagina: paginasReales }));
  }, [paginasReales, pagina]);

  const irA = useCallback((p: number) => setEstado((e) => ({ ...e, pagina: Math.max(1, Math.floor(p)) })), []);
  const cambiarPorPagina = useCallback(
    (n: TamanoPagina) =>
      // Se mantiene a la vista el primer elemento que se estaba viendo.
      setEstado((e) => ({ ...e, porPagina: n, pagina: Math.floor(((e.pagina - 1) * e.porPagina) / n) + 1 })),
    [],
  );
  /** Ordena por `campo`; si ya se ordenaba por él, invierte el sentido. `dir` fuerza el sentido. */
  const ordenar = useCallback(
    (campo: string, dir?: Dir) =>
      setEstado((e) => ({ ...e, pagina: 1, orden: campo, dir: dir ?? (e.orden === campo ? (e.dir === 'asc' ? 'desc' : 'asc') : 'asc') })),
    [],
  );

  return { ...d, pagina, porPagina: estado.porPagina, orden: estado.orden, dir: estado.dir, irA, cambiarPorPagina, ordenar };
}

export type Listado<T> = ReturnType<typeof useListado<T>>;
