import { crearApp } from './app';
import { arrancarCorreo } from './emails/cola';
import { arrancarDesvinculacion } from './servicios/bajas';
import { arrancarLimpiezaFotos } from './servicios/fotos';
import { arrancarRecordatorios } from './servicios/recordatorios';
import { arrancarLimpiezaIdempotencia } from './middleware/idempotencia';
import { log } from './lib/log';

process.on('uncaughtException', (error) => {
  log('error', 'excepción no controlada; cerrando API', { error: String(error?.stack ?? error) });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  const error = reason instanceof Error ? String(reason.stack ?? reason.message) : String(reason);
  log('error', 'promesa rechazada sin controlar; cerrando API', { error });
  process.exit(1);
});

try {
  process.loadEnvFile();
} catch {
  try {
    process.loadEnvFile('../../.env');
  } catch {}
}

const puerto = Number(process.env.API_PORT ?? process.env.PORT ?? 4000);
const servidor = crearApp().listen(puerto, () => log('info', `API escuchando en :${puerto}`));
const pararCorreo = arrancarCorreo();
const pararBajas = arrancarDesvinculacion();
const pararFotos = arrancarLimpiezaFotos();
const pararRecordatorios = arrancarRecordatorios();
const pararIdempotencia = arrancarLimpiezaIdempotencia();

// Cierre ordenado: deja terminar las peticiones en curso antes de salir.
for (const senal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(senal, () => {
    pararCorreo();
    pararBajas();
    pararFotos();
    pararRecordatorios();
    pararIdempotencia();
    servidor.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
