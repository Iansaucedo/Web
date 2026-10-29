// Cada módulo define sus rutas al importarse.
import './salud';
import './auth';
import './cuenta';
import './vehiculos';
import './citas';
import './reservas';
import './ordenes';
import './piezas';
import './fotos';
import './personal';
import './fichajes';
import './estadisticas';
import './pruebas';

export function cargarModulos() {
  // Las importaciones de arriba ya han registrado las rutas; esta función hace explícita la dependencia.
}
