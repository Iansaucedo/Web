// Genera docs/emails/: un HTML por plantilla (con sus datos de ejemplo) y un índice para revisarlos.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NOMBRES_PLANTILLAS } from '../src/emails/plantillas';
import { datosEjemplo } from '../src/emails/ejemplos';
import { renderizarEmail } from '../src/emails/cola';

const dir = join(__dirname, '../../../docs/emails');
mkdirSync(dir, { recursive: true });
const filas: string[] = [];
for (const n of NOMBRES_PLANTILLAS) {
  const { asunto, html } = renderizarEmail(n, datosEjemplo[n]);
  writeFileSync(join(dir, `${n}.html`), html);
  filas.push(`<li><a href="${n}.html" target="vista">${n}</a><br><small>${asunto.replace(/</g, '&lt;')}</small></li>`);
}
writeFileSync(
  join(dir, 'index.html'),
  `<!doctype html><html lang="es"><meta charset="utf-8"><title>Emails del Taller</title>
<style>body{margin:0;display:flex;height:100vh;font-family:Roboto,Arial,sans-serif}nav{width:340px;overflow:auto;border-right:1px solid #BFC8CC;padding:16px}li{margin:0 0 10px}iframe{flex:1;border:0}</style>
<nav><h1 style="font-size:18px">Emails (${NOMBRES_PLANTILLAS.length})</h1><ol>${filas.join('')}</ol></nav><iframe name="vista" src="${NOMBRES_PLANTILLAS[0]}.html"></iframe></html>`,
);
console.log(`${NOMBRES_PLANTILLAS.length} emails en ${dir}`);
