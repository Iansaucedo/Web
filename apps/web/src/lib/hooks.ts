'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ErrorApi, mensajeError, nuevaClave } from './api';
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
