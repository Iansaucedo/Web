/**
 * Errores de la aplicación. Cada uno lleva su código HTTP y un código estable en mayúsculas
 * que el frontend usa para decidir qué mostrar (el texto puede cambiar, el código no).
 */
export class ErrorApp extends Error {
  constructor(
    public readonly estado: number,
    public readonly codigo: string,
    mensaje: string,
    public readonly detalles?: unknown,
  ) {
    super(mensaje);
  }
}

export const noAutenticado = (m = 'Inicia sesión para continuar') => new ErrorApp(401, 'NO_AUTENTICADO', m);
export const prohibido = (m = 'No tienes permiso para hacer esto') => new ErrorApp(403, 'PROHIBIDO', m);
/** También se usa cuando el recurso existe pero no es del usuario: así no se filtra su existencia. */
export const noEncontrado = (que = 'El recurso') => new ErrorApp(404, 'NO_ENCONTRADO', `${que} no existe`);
export const conflicto = (codigo: string, m: string) => new ErrorApp(409, codigo, m);
export const reglaNegocio = (codigo: string, m: string, detalles?: unknown) => new ErrorApp(422, codigo, m, detalles);
