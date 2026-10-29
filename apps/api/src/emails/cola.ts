import { prisma } from '../db';
import { reloj } from '../lib/reloj';
import { log } from '../lib/log';
import { PLANTILLAS, type NombrePlantilla } from './plantillas';
import { maquetar } from './maqueta';
import { TransporteMemoria, transporteSmtp, type Transporte } from './transporte';
import { facturaPdf } from '../modulos/factura';
import { numeroOrden } from './formato';

export const MAX_INTENTOS = 6;
/** Espera tras el intento n (1, 2, 4, 8, 16 minutos…), con un máximo de una hora. */
export const esperaTrasIntento = (n: number) => Math.min(60, 2 ** (n - 1)) * 60_000;

export function renderizarEmail(plantilla: string, datos: Record<string, unknown>) {
  const fn = PLANTILLAS[plantilla as NombrePlantilla];
  if (!fn) throw new Error(`Plantilla desconocida: ${plantilla}`);
  const contenido = fn(datos);
  return { asunto: contenido.asunto, ...maquetar(contenido) };
}

/**
 * Envía un lote de la bandeja de salida. Seguro con varias instancias a la vez:
 * cada una reserva sus filas con FOR UPDATE SKIP LOCKED y las aparta 5 minutos.
 * Si el proceso muere a mitad, las filas vuelven a estar disponibles al vencer ese plazo.
 */
export async function procesarCola(transporte: Transporte, lote = 20) {
  const ahora = reloj.ahora();
  const ids = await prisma.$transaction(async (tx) => {
    const filas = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "EmailSaliente"
      WHERE estado = 'PENDIENTE' AND "proximoIntento" <= ${ahora}
      ORDER BY "creadoEn" LIMIT ${lote} FOR UPDATE SKIP LOCKED`;
    if (filas.length) {
      await tx.emailSaliente.updateMany({
        where: { id: { in: filas.map((f) => f.id) } },
        data: { proximoIntento: new Date(ahora.getTime() + 5 * 60_000) },
      });
    }
    return filas.map((f) => f.id);
  });

  let enviados = 0;
  let fallidos = 0;
  for (const id of ids) {
    const email = await prisma.emailSaliente.findUniqueOrThrow({ where: { id } });
    try {
      const { asunto, html, texto } = renderizarEmail(email.plantilla, email.datos as Record<string, unknown>);
      let adjuntos;
      if (email.adjuntoFacturaOrdenId) {
        const orden = await prisma.orden.findUniqueOrThrow({ where: { id: email.adjuntoFacturaOrdenId } });
        adjuntos = [{ nombre: `Factura-${numeroOrden(orden.numero)}.pdf`, contenido: await facturaPdf(orden.id) }];
      }
      await transporte.enviar({ para: email.para, asunto, html, texto, adjuntos });
      await prisma.emailSaliente.update({ where: { id }, data: { estado: 'ENVIADO', enviadoEn: reloj.ahora(), intentos: { increment: 1 } } });
      enviados++;
    } catch (e) {
      const intentos = email.intentos + 1;
      const definitivo = intentos >= MAX_INTENTOS || String(e).includes('Plantilla desconocida');
      await prisma.emailSaliente.update({
        where: { id },
        data: {
          intentos,
          ultimoError: String((e as Error)?.message ?? e).slice(0, 500),
          estado: definitivo ? 'FALLIDO' : 'PENDIENTE',
          proximoIntento: new Date(reloj.ahora().getTime() + esperaTrasIntento(intentos)),
        },
      });
      log(definitivo ? 'error' : 'warn', 'email no enviado', { id, intentos, error: String(e) });
      fallidos++;
    }
  }
  return { enviados, fallidos };
}

export const transporteMemoria = new TransporteMemoria();

function transporteSegunEntorno(): Transporte {
  if (process.env.CORREO_TRANSPORTE === 'memoria' || process.env.NODE_ENV === 'test') return transporteMemoria;
  if (!process.env.SMTP_HOST) {
    log('warn', 'SMTP_HOST no configurado: los emails se escriben en el log');
    return { enviar: async (m) => log('info', 'email (sin SMTP)', { para: m.para, asunto: m.asunto }) };
  }
  return transporteSmtp();
}

/** Arranca el envío periódico. Devuelve una función para pararlo. */
export function arrancarCorreo(cadaMs = 10_000) {
  const transporte = transporteSegunEntorno();
  let ocupado = false;
  const t = setInterval(async () => {
    if (ocupado) return;
    ocupado = true;
    try {
      await procesarCola(transporte);
    } catch (e) {
      log('error', 'fallo procesando la cola de emails', { error: String(e) });
    } finally {
      ocupado = false;
    }
  }, cadaMs);
  return () => clearInterval(t);
}
