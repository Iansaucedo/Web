import { estadoTrasResponder } from './estadoOrden';

export type Decision = 'ACEPTADA' | 'RECHAZADA';

export class RespuestaIncompleta extends Error {}

/**
 * El cliente responde una solicitud de una sola vez: debe decidir todas sus partidas.
 * Devuelve el estado al que pasa la orden.
 */
export function validarRespuesta(
  partidasSolicitud: string[],
  decisiones: Record<string, Decision>,
  esPrimeraSolicitud: boolean,
) {
  const faltan = partidasSolicitud.filter((id) => !decisiones[id]);
  if (faltan.length) throw new RespuestaIncompleta(`Faltan ${faltan.length} trabajos por decidir`);
  const sobran = Object.keys(decisiones).filter((id) => !partidasSolicitud.includes(id));
  if (sobran.length) throw new RespuestaIncompleta('Hay decisiones de trabajos que no son de esta solicitud');
  const aceptadas = partidasSolicitud.filter((id) => decisiones[id] === 'ACEPTADA').length;
  return estadoTrasResponder(aceptadas, esPrimeraSolicitud);
}

export interface PartidaParaCompletar {
  estado: 'PENDIENTE' | 'ACEPTADA' | 'RECHAZADA';
  terminadaEn: Date | null;
}

/** «Marcar completada» solo se habilita cuando todas las partidas aceptadas están terminadas. */
export function motivoNoCompletable(partidas: PartidaParaCompletar[]): string | null {
  if (partidas.some((p) => p.estado === 'PENDIENTE')) return 'Hay trabajos esperando la respuesta del cliente';
  const aceptadas = partidas.filter((p) => p.estado === 'ACEPTADA');
  if (!aceptadas.length) return 'No hay trabajos aceptados';
  const abiertas = aceptadas.filter((p) => !p.terminadaEn).length;
  return abiertas ? `Termina ${abiertas === 1 ? 'el trabajo en curso' : `los ${abiertas} trabajos en curso`}` : null;
}
