import nodemailer from 'nodemailer';

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

export function transporteSmtp(): Transporte {
  const t = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    connectionTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return {
    async enviar(m) {
      await t.sendMail({
        from: process.env.SMTP_FROM ?? 'TallerPro <no-responder@taller.local>',
        to: m.para,
        subject: m.asunto,
        html: m.html,
        text: m.texto,
        attachments: m.adjuntos?.map((a) => ({ filename: a.nombre, content: a.contenido, contentType: 'application/pdf' })),
      });
    },
  };
}
