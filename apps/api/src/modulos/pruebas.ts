import { z } from '../openapi/zod';
import { definir } from '../lib/ruta';
import { prisma } from '../db';
import { reloj } from '../lib/reloj';
import { procesarCola, renderizarEmail, transporteMemoria } from '../emails/cola';
import { Instante, Ok } from './esquemas';
import { reiniciarLimites } from '../middleware/limite';
import { desvincularCuentasCaducadas } from '../servicios/bajas';
import { enviarRecordatorios } from '../servicios/recordatorios';

/**
 * Rutas de apoyo para los E2E. Solo existen con NODE_ENV=test: en producción no se montan
 * ni aparecen en la documentación.
 */
if (process.env.NODE_ENV === 'test') {
  definir({
    metodo: 'post',
    ruta: '/test/reiniciar',
    etiqueta: 'Solo tests',
    resumen: 'Vaciar la base de datos y sembrar el taller de pruebas',
    descripcion: 'Configuración, 3 puestos, dueño, jefe, 2 mecánicos y piezas. El reloj vuelve a la hora real.',
    acceso: 'publico',
    cuerpo: z.object({}).strict(),
    respuesta: Ok,
    manejador: async () => {
      const tablas = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
      await prisma.$executeRawUnsafe(`TRUNCATE ${tablas.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
      reloj.fijar(null);
      reiniciarLimites();
      transporteMemoria.enviados = [];
      await prisma.configTaller.create({ data: { id: 1 } });
      await prisma.puesto.createMany({ data: [{ nombre: 'Puesto 1' }, { nombre: 'Puesto 2' }, { nombre: 'Puesto 3' }] });
      await prisma.usuario.create({ data: { email: 'dueno@taller.test', nombre: 'Carmen Dueña', rol: 'DUENO' } });
      await prisma.usuario.create({ data: { email: 'jefe@taller.test', nombre: 'Marta Ruiz', rol: 'JEFE', empleado: { create: {} } } });
      await prisma.usuario.create({ data: { email: 'mecanico@taller.test', nombre: 'Luis Pérez', rol: 'MECANICO', empleado: { create: {} } } });
      await prisma.usuario.create({ data: { email: 'mecanico2@taller.test', nombre: 'Sara Gómez', rol: 'MECANICO', empleado: { create: {} } } });
      const jefe = await prisma.usuario.findUniqueOrThrow({ where: { email: 'jefe@taller.test' } });
      for (const p of [
        { referencia: 'PF-001', nombre: 'Pastillas de freno delanteras', precioCentimos: 5600, stock: 4 },
        { referencia: 'FA-010', nombre: 'Filtro de aceite', precioCentimos: 1200, stock: 10 },
        { referencia: 'AC-5W30', nombre: 'Aceite 5W30 (litro)', precioCentimos: 950, stock: 1 },
      ]) {
        const pieza = await prisma.pieza.create({ data: p });
        await prisma.movimientoStock.create({ data: { piezaId: pieza.id, tipo: 'ALTA', delta: p.stock, stockAntes: 0, stockDespues: p.stock, usuarioId: jefe.id } });
      }
      return { ok: true as const };
    },
  });

  definir({
    metodo: 'post',
    ruta: '/test/reloj',
    etiqueta: 'Solo tests',
    resumen: 'Fijar la hora del servidor',
    descripcion: '`ahora: null` vuelve a la hora real.',
    acceso: 'publico',
    cuerpo: z.object({ ahora: Instante.nullable() }).strict(),
    respuesta: Ok,
    manejador: async ({ cuerpo }) => {
      reloj.fijar(cuerpo.ahora ? new Date(cuerpo.ahora) : null);
      return { ok: true as const };
    },
  });

  definir({
    metodo: 'get',
    ruta: '/test/emails',
    etiqueta: 'Solo tests',
    resumen: 'Emails en la bandeja de salida',
    acceso: 'publico',
    query: z.object({ para: z.string().optional() }),
    respuesta: z.object({ datos: z.array(z.object({ para: z.string(), plantilla: z.string(), asunto: z.string(), estado: z.string() })) }),
    manejador: async ({ query }) => {
      const e = await prisma.emailSaliente.findMany({ where: query.para ? { para: query.para } : {}, orderBy: { creadoEn: 'asc' } });
      return { datos: e.map((x) => ({ para: x.para, plantilla: x.plantilla, asunto: renderizarEmail(x.plantilla, x.datos as Record<string, unknown>).asunto, estado: x.estado })) };
    },
  });

  definir({
    metodo: 'post',
    ruta: '/test/desvincular-bajas',
    etiqueta: 'Solo tests',
    resumen: 'Ejecutar ya la desvinculación de autobajas caducadas',
    acceso: 'publico',
    cuerpo: z.object({}).strict(),
    respuesta: z.object({ desvinculadas: z.number().int() }),
    manejador: async () => ({ desvinculadas: await desvincularCuentasCaducadas() }),
  });

  definir({
    metodo: 'post',
    ruta: '/test/recordatorios',
    etiqueta: 'Solo tests',
    resumen: 'Ejecutar ya el envío de recordatorios de 24 h',
    acceso: 'publico',
    cuerpo: z.object({}).strict(),
    respuesta: z.object({ enviados: z.number().int() }),
    manejador: async () => ({ enviados: await enviarRecordatorios() }),
  });

  definir({
    metodo: 'post',
    ruta: '/test/procesar-correo',
    etiqueta: 'Solo tests',
    resumen: 'Enviar ya la bandeja de salida (transporte en memoria)',
    acceso: 'publico',
    cuerpo: z.object({}).strict(),
    respuesta: z.object({ enviados: z.number().int(), fallidos: z.number().int() }),
    manejador: async () => procesarCola(transporteMemoria, 200),
  });
}
