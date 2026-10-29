import type { ContenidoEmail } from './plantillas';

/**
 * Maqueta común de todos los emails: tablas y CSS en línea (lo único que respetan Outlook y Gmail),
 * 600 px de ancho, colores del tema. Todo texto se escapa aquí; las plantillas nunca generan HTML.
 */

export type Tono = 'exito' | 'aviso' | 'error' | 'info';

const C = {
  primario: '#01687D',
  sobrePrimario: '#FFFFFF',
  fondo: '#EFF4F7',
  tarjeta: '#FFFFFF',
  texto: '#171C1F',
  textoSuave: '#40484B',
  borde: '#BFC8CC',
  fila: '#F5FAFD',
};
const TONOS: Record<Tono, { fondo: string; texto: string }> = {
  exito: { fondo: '#D7F2DE', texto: '#0E4F22' },
  aviso: { fondo: '#FFE8BF', texto: '#6A3D00' },
  error: { fondo: '#FFDAD6', texto: '#8C1D18' },
  info: { fondo: '#D4EBFA', texto: '#0B4A72' },
};
const FUENTE = "font-family:Roboto,'Segoe UI',Helvetica,Arial,sans-serif;";

export function escapar(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Solo enlaces http(s) a la web del taller: un `javascript:` o un dominio ajeno no llega al botón. */
function urlSegura(url: string): string {
  const base = process.env.PUBLIC_WEB_URL ?? 'http://localhost:3000';
  try {
    const u = new URL(url, base);
    if (!/^https?:$/.test(u.protocol) || u.origin !== new URL(base).origin) return base;
    return u.toString();
  } catch {
    return base;
  }
}

const filaDato = ([k, v]: [string, string], i: number) => `
  <tr>
    <td style="${FUENTE}padding:10px 12px;font-size:13px;color:${C.textoSuave};width:38%;vertical-align:top;${i ? `border-top:1px solid ${C.borde};` : ''}">${escapar(k)}</td>
    <td style="${FUENTE}padding:10px 12px;font-size:14px;color:${C.texto};font-weight:500;vertical-align:top;${i ? `border-top:1px solid ${C.borde};` : ''}">${escapar(v)}</td>
  </tr>`;

function tabla(t: NonNullable<ContenidoEmail['tabla']>) {
  const cab = t.columnas
    .map((c, i) => `<th align="${i ? 'right' : 'left'}" style="${FUENTE}padding:10px 12px;font-size:12px;font-weight:500;color:${C.textoSuave};text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid ${C.borde};">${escapar(c)}</th>`)
    .join('');
  const filas = t.filas
    .map(([a, b]) => `<tr><td style="${FUENTE}padding:10px 12px;font-size:14px;color:${C.texto};border-bottom:1px solid ${C.borde};">${escapar(a)}</td><td align="right" style="${FUENTE}padding:10px 12px;font-size:14px;color:${C.texto};white-space:nowrap;border-bottom:1px solid ${C.borde};">${escapar(b)}</td></tr>`)
    .join('');
  const pie = t.pie
    .map(([a, b], i) => {
      const fuerte = i === t.pie.length - 1;
      return `<tr><td align="right" style="${FUENTE}padding:6px 12px;font-size:${fuerte ? 16 : 13}px;color:${fuerte ? C.texto : C.textoSuave};font-weight:${fuerte ? 700 : 400};">${escapar(a)}</td><td align="right" style="${FUENTE}padding:6px 12px;font-size:${fuerte ? 16 : 14}px;color:${C.texto};font-weight:${fuerte ? 700 : 500};white-space:nowrap;">${escapar(b)}</td></tr>`;
    })
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.borde};border-radius:12px;border-collapse:separate;margin:0 0 20px;"><thead><tr>${cab}</tr></thead><tbody>${filas}${pie}</tbody></table>`;
}

export function maquetar(c: ContenidoEmail): { html: string; texto: string } {
  const tono = TONOS[c.tono];
  const url = c.boton ? urlSegura(c.boton.url) : null;
  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapar(c.asunto)}</title>
</head>
<body style="margin:0;padding:0;background:${C.fondo};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapar(c.previo)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.fondo};">
<tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;">
    <tr><td style="background:${C.primario};border-radius:16px 16px 0 0;padding:18px 28px;">
      <span style="${FUENTE}font-size:20px;font-weight:500;color:${C.sobrePrimario};letter-spacing:.2px;">&#128295;&nbsp;TallerPro</span>
    </td></tr>
    <tr><td style="background:${C.tarjeta};padding:28px;border-radius:0 0 16px 16px;">
      <span style="${FUENTE}display:inline-block;background:${tono.fondo};color:${tono.texto};font-size:12px;font-weight:500;padding:4px 12px;border-radius:8px;">${escapar(c.etiqueta)}</span>
      <h1 style="${FUENTE}font-size:24px;line-height:32px;font-weight:400;color:${C.texto};margin:14px 0 12px;">${escapar(c.titulo)}</h1>
      ${c.parrafos.map((p) => `<p style="${FUENTE}font-size:15px;line-height:22px;color:${C.textoSuave};margin:0 0 16px;">${escapar(p)}</p>`).join('')}
      ${c.filas?.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.fila};border:1px solid ${C.borde};border-radius:12px;border-collapse:separate;margin:0 0 20px;">${c.filas.map(filaDato).join('')}</table>` : ''}
      ${c.tabla ? tabla(c.tabla) : ''}
      ${c.aviso ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;"><tr><td style="${FUENTE}background:${tono.fondo};color:${tono.texto};font-size:14px;line-height:20px;padding:12px 16px;border-radius:12px;">${escapar(c.aviso)}</td></tr></table>` : ''}
      ${c.adjunto ? `<p style="${FUENTE}font-size:14px;color:${C.textoSuave};margin:0 0 20px;">&#128206; Adjunto: <strong style="color:${C.texto};">${escapar(c.adjunto)}</strong></p>` : ''}
      ${url ? `<table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr><td style="background:${C.primario};border-radius:20px;"><a href="${escapar(url)}" style="${FUENTE}display:inline-block;padding:10px 24px;font-size:14px;font-weight:500;color:${C.sobrePrimario};text-decoration:none;">${escapar(c.boton!.texto)}</a></td></tr></table>` : ''}
    </td></tr>
    <tr><td style="${FUENTE}padding:18px 28px;font-size:12px;line-height:18px;color:${C.textoSuave};text-align:center;">
      Recibes este email porque tienes una cuenta en TallerPro.<br>Puedes ver todos tus avisos en la web, en el icono de la campana.
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;

  const texto = [
    c.titulo,
    '',
    ...c.parrafos,
    '',
    ...(c.filas ?? []).map(([k, v]) => `${k}: ${v}`),
    ...(c.tabla ? [...c.tabla.filas, ...c.tabla.pie].map(([a, b]) => `${a}: ${b}`) : []),
    ...(c.aviso ? ['', c.aviso] : []),
    ...(c.adjunto ? ['', `Adjunto: ${c.adjunto}`] : []),
    ...(url ? ['', `${c.boton!.texto}: ${url}`] : []),
  ].join('\n');

  return { html, texto };
}
