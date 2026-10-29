import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { z } from './zod';

export const registro = new OpenAPIRegistry();

registro.registerComponent('securitySchemes', 'cookieSesion', {
  type: 'apiKey',
  in: 'cookie',
  name: 'taller_sesion',
  description: 'JWT httpOnly que se fija al entrar con Google (o con /api/auth/test-login en tests).',
});

export const ErrorSchema = z
  .object({
    error: z.string().openapi({ example: 'La franja elegida ya está completa' }),
    codigo: z.string().openapi({ example: 'FRANJA_LLENA' }),
    detalles: z.unknown().optional(),
    requestId: z.string().optional().openapi({ example: 'b2f4c1d0-…' }),
  })
  .openapi('Error');

export function documentoOpenApi() {
  return new OpenApiGeneratorV3(registro.definitions).generateDocument({
    openapi: '3.0.3',
    info: {
      title: 'API de TallerPro',
      version: '1.0.0',
      description: [
        'API del sistema de gestión del taller de coches. Todas las rutas están bajo `/api`.',
        '',
        '- **Sesión:** cookie `taller_sesion` (httpOnly). Se obtiene entrando con Google.',
        '- **Peticiones con cuerpo:** deben enviar `Content-Type: application/json` (protección CSRF). Si no, 415.',
        '- **Idempotencia:** las POST que crean algo aceptan `Idempotency-Key`; repetirla devuelve la misma respuesta.',
        '- **Importes:** siempre en céntimos (enteros), sin IVA salvo que el campo diga lo contrario.',
        '- **Fechas:** instantes en ISO 8601 UTC; días en `yyyy-MM-dd` en la zona del taller (Europe/Madrid).',
        '- **Errores:** `{ error, codigo, detalles?, requestId }`. `codigo` es estable; `error` es el texto para mostrar.',
      ].join('\n'),
    },
    servers: [{ url: '/' }],
  });
}
