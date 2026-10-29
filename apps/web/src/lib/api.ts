// Cliente de la API. Todas las llamadas pasan por aquí: JSON, cookie de sesión,
// errores con el código estable del backend y clave de idempotencia en las POST.

export class ErrorApi extends Error {
  constructor(
    public estado: number,
    public codigo: string,
    mensaje: string,
    public detalles?: { campo: string; mensaje: string }[] | Record<string, unknown>,
  ) {
    super(mensaje);
  }
}

type Metodo = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface OpcionesLlamada {
  /** Misma clave en los reintentos de una misma acción: el servidor no la repite. */
  claveIdempotencia?: string;
}

export const nuevaClave = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function llamar<T>(metodo: Metodo, ruta: string, cuerpo?: unknown, op: OpcionesLlamada = {}): Promise<T> {
  const cabeceras: Record<string, string> = { Accept: 'application/json' };
  // Un archivo (una foto) va tal cual con su tipo; todo lo demás, en JSON.
  const archivo = typeof Blob !== 'undefined' && cuerpo instanceof Blob ? cuerpo : null;
  if (metodo !== 'GET') cabeceras['Content-Type'] = archivo ? archivo.type : 'application/json';
  if (op.claveIdempotencia) cabeceras['Idempotency-Key'] = op.claveIdempotencia;
  let r: Response;
  try {
    r = await fetch(`/api${ruta}`, {
      method: metodo,
      headers: cabeceras,
      credentials: 'same-origin',
      body: metodo === 'GET' ? undefined : (archivo ?? JSON.stringify(cuerpo ?? {})),
    });
  } catch {
    throw new ErrorApi(0, 'SIN_CONEXION', 'No hay conexión con el servidor. Revisa tu conexión y vuelve a intentarlo');
  }
  if (r.status === 204) return undefined as T;
  const datos = await r.json().catch(() => null);
  if (!r.ok) {
    if (r.status === 401 && typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = `/login?volver=${encodeURIComponent(window.location.pathname)}`;
    }
    throw new ErrorApi(r.status, datos?.codigo ?? 'ERROR', datos?.error ?? 'Algo ha fallado. Inténtalo de nuevo', datos?.detalles);
  }
  return datos as T;
}

export const api = {
  get: <T>(ruta: string) => llamar<T>('GET', ruta),
  post: <T>(ruta: string, cuerpo?: unknown, op?: OpcionesLlamada) => llamar<T>('POST', ruta, cuerpo, op),
  put: <T>(ruta: string, cuerpo?: unknown) => llamar<T>('PUT', ruta, cuerpo),
  patch: <T>(ruta: string, cuerpo?: unknown) => llamar<T>('PATCH', ruta, cuerpo),
  delete: <T>(ruta: string, cuerpo: unknown = {}) => llamar<T>('DELETE', ruta, cuerpo),
  /** Sube un archivo binario (una foto) con su Content-Type. */
  subir: <T>(ruta: string, archivo: Blob) => llamar<T>('POST', ruta, archivo),
};

/** Mensaje para el usuario, con el primer campo que falla si es un error de validación. */
export function mensajeError(e: unknown): string {
  if (e instanceof ErrorApi) {
    if (Array.isArray(e.detalles) && e.detalles[0]) return `${e.message}: ${e.detalles[0].mensaje}`;
    return e.message;
  }
  return 'Algo ha fallado. Inténtalo de nuevo';
}
