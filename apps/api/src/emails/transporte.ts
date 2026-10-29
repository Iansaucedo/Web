import nodemailer from 'nodemailer';
import { log } from '../lib/log';

export interface Mensaje {
  para: string;
  asunto: string;
  html: string;
  texto: string;
  adjuntos?: { nombre: string; contenido: Buffer }[];
}

export interface Transporte {
  enviar(m: Mensaje): Promise<void>;
}

/** En tests: guarda los mensajes en memoria y permite simular caídas de SMTP. */
export class TransporteMemoria implements Transporte {
  enviados: Mensaje[] = [];
  fallosPendientes = 0;
  async enviar(m: Mensaje) {
    if (this.fallosPendientes > 0) {
      this.fallosPendientes--;
      throw new Error('SMTP no disponible (simulado)');
    }
    this.enviados.push(m);
  }
}

export function crearTransporterNodemailer() {
  const port = Number(process.env.SMTP_PORT ?? 587);
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    tls: {
      rejectUnauthorized: process.env.SMTP_IGNORE_TLS !== 'true',
    },
    connectionTimeout: 15_000,
    socketTimeout: 30_000,
  });
}

export async function verificarConexionSmtp(): Promise<{ ok: boolean; mensaje: string }> {
  if (!process.env.SMTP_HOST) {
    return { ok: false, mensaje: 'SMTP_HOST no está definido en las variables de entorno.' };
  }
  try {
    const t = crearTransporterNodemailer();
    await t.verify();
    return { ok: true, mensaje: `Conexión SMTP exitosa con ${process.env.SMTP_HOST}:${process.env.SMTP_PORT ?? 587}` };
  } catch (error) {
    const err = error as Error;
    return { ok: false, mensaje: `Error conectando con el servidor SMTP: ${err.message}` };
  }
}

export function transporteSmtp(): Transporte {
  const t = crearTransporterNodemailer();
  return {
    async enviar(m) {
      try {
        await t.sendMail({
          from: process.env.SMTP_FROM ?? 'TallerPro <no-responder@taller.local>',
          to: m.para,
          subject: m.asunto,
          html: m.html,
          text: m.texto,
          attachments: m.adjuntos?.map((a) => ({ filename: a.nombre, content: a.contenido, contentType: 'application/pdf' })),
        });
      } catch (error) {
        log('error', 'Error al enviar email vía SMTP', {
          para: m.para,
          asunto: m.asunto,
          error: (error as Error).message,
        });
        throw error;
      }
    },
  };
}
