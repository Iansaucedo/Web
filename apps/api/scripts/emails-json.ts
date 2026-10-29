// Vuelca el contenido de cada email (con sus datos de ejemplo) en JSON, para el diseño de Figma.
import { PLANTILLAS, NOMBRES_PLANTILLAS } from '../src/emails/plantillas';
import { datosEjemplo } from '../src/emails/ejemplos';

const salida = NOMBRES_PLANTILLAS.map((n) => ({ plantilla: n, ...PLANTILLAS[n](datosEjemplo[n]) }));
process.stdout.write(JSON.stringify(salida));
