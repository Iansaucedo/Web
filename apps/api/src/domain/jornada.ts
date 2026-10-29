import type { TipoFichaje } from '@prisma/client';

export interface FichajeDia {
  tipo: TipoFichaje;
  momento: Date;
}

export interface ResumenJornada {
  minutosTrabajados: number;
  minutosPausa: number;
  completa: boolean; // tiene entrada y salida y las pausas están cerradas
}

const SIGUIENTE: Record<TipoFichaje, TipoFichaje[]> = {
  ENTRADA: ['INICIO_PAUSA', 'SALIDA'],
  INICIO_PAUSA: ['FIN_PAUSA'],
  FIN_PAUSA: ['INICIO_PAUSA', 'SALIDA'],
  SALIDA: ['ENTRADA'],
};

/** Qué fichajes puede hacer el empleado ahora, según el último del día. */
export function fichajesPermitidos(ultimo: TipoFichaje | null): TipoFichaje[] {
  return ultimo === null ? ['ENTRADA'] : SIGUIENTE[ultimo];
}

/**
 * Minutos trabajados en un día a partir de sus fichajes (ya corregidos).
 * Si la jornada sigue abierta, cuenta hasta `ahora`.
 */
export function resumirJornada(fichajes: FichajeDia[], ahora: Date): ResumenJornada {
  const orden = [...fichajes].sort((a, b) => a.momento.getTime() - b.momento.getTime());
  let trabajados = 0;
  let pausa = 0;
  let desde: Date | null = null; // inicio del tramo actual
  let enPausa = false;

  for (const f of orden) {
    const min = desde ? (f.momento.getTime() - desde.getTime()) / 60_000 : 0;
    switch (f.tipo) {
      case 'ENTRADA':
        desde = f.momento;
        enPausa = false;
        break;
      case 'INICIO_PAUSA':
        trabajados += min;
        desde = f.momento;
        enPausa = true;
        break;
      case 'FIN_PAUSA':
        pausa += min;
        desde = f.momento;
        enPausa = false;
        break;
      case 'SALIDA':
        if (enPausa) pausa += min;
        else trabajados += min;
        desde = null;
        break;
    }
  }

  const abierta = desde !== null;
  if (abierta) {
    const min = (ahora.getTime() - desde!.getTime()) / 60_000;
    if (enPausa) pausa += min;
    else trabajados += min;
  }

  const ultimo = orden.at(-1)?.tipo;
  return {
    minutosTrabajados: Math.round(trabajados),
    minutosPausa: Math.round(pausa),
    completa: orden.length > 0 && orden[0].tipo === 'ENTRADA' && ultimo === 'SALIDA',
  };
}

/** ¿Es posible este orden de fichajes en un día? (ENTRADA, pausas cerradas, SALIDA, y vuelta a empezar). */
export function secuenciaValida(tipos: TipoFichaje[]): boolean {
  let ultimo: TipoFichaje | null = null;
  for (const t of tipos) {
    if (!fichajesPermitidos(ultimo).includes(t)) return false;
    ultimo = t;
  }
  return true;
}
