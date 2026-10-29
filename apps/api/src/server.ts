import { crearApp } from './app';
import { arrancarCorreo } from './emails/cola';
import { arrancarDesvinculacion } from './servicios/bajas';
import { arrancarLimpiezaFotos } from './servicios/fotos';
import { arrancarRecordatorios } from './servicios/recordatorios';
import { log } from './lib/log';

try {
  process.loadEnvFile();
} catch {
  try {
    process.loadEnvFile('../../.env');
  } catch {}
}

const puerto = Number(process.env.PORT ?? 4000);
const servidor = crearApp().listen(puerto, () => log('info', `API escuchando en :${puerto}`));
const pararCorreo = arrancarCorreo();
const pararBajas = arrancarDesvinculacion();
const pararFotos = arrancarLimpiezaFotos();
const pararRecordatorios = arrancarRecordatorios();

// Cierre ordenado: deja terminar las peticiones en curso antes de salir.
for (const senal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(senal, () => {
    pararCorreo();
    pararBajas();
    pararFotos();
    pararRecordatorios();
    servidor.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
