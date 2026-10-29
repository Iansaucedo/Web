import { z } from '../openapi/zod';
import { definir } from '../lib/ruta';
import { prisma } from '../db';
import { ErrorApp } from '../lib/errores';

// /health: el proceso vive (para reiniciarlo si no). /ready: además llega a la base de datos (para enviarle tráfico).
definir({
  metodo: 'get',
  ruta: '/health',
  etiqueta: 'Sistema',
  resumen: 'El proceso está vivo',
  acceso: 'publico',
  respuesta: z.object({ ok: z.literal(true) }),
  manejador: async () => ({ ok: true as const }),
});

definir({
  metodo: 'get',
  ruta: '/ready',
  etiqueta: 'Sistema',
  resumen: 'Listo para atender (con base de datos)',
  acceso: 'publico',
  respuesta: z.object({ ok: z.literal(true) }),
  errores: { 503: 'Sin conexión con la base de datos' },
  manejador: async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ErrorApp(503, 'NO_DISPONIBLE', 'Sin conexión con la base de datos');
    }
    return { ok: true as const };
  },
});
