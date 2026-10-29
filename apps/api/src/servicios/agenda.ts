import type { ConfigTaller } from '@prisma/client';
import type { Tx } from '../lib/transaccion';
import { capacidadDia } from '../domain/capacidad';
import { diaLocal, diaSemana, fechaDb, inicioDia, instanteLocal, sumarDias } from '../lib/fechas';
import { reglaNegocio } from '../lib/errores';
import { reloj } from '../lib/reloj';

export const ESTADOS_CITA_ACTIVA = ['PENDIENTE', 'CONFIRMADA', 'RECIBIDA'] as const;
export const DIAS_MAX_ANTELACION = 60;

export interface Franja {
  inicio: Date;
  fin: Date;
  hora: string;
}

export function esLaborable(dia: string, c: ConfigTaller) {
  return c.diasLaborables.includes(diaSemana(dia));
}

export function franjasDelDia(dia: string, c: ConfigTaller): Franja[] {
  if (!esLaborable(dia, c)) return [];
  const franjas: Franja[] = [];
  for (let m = c.aperturaMinutos; m + c.minutosFranja <= c.cierreMinutos; m += c.minutosFranja) {
    const inicio = instanteLocal(dia, m, c.zonaHoraria);
    franjas.push({ inicio, fin: instanteLocal(dia, m + c.minutosFranja, c.zonaHoraria), hora: `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` });
  }
  return franjas;
}

/** Comprueba que `inicio` es el comienzo exacto de una franja futura dentro del plazo. Devuelve la franja y su día. */
export function validarFranja(inicio: Date, c: ConfigTaller) {
  const ahora = reloj.ahora();
  const dia = diaLocal(inicio, c.zonaHoraria);
  const franja = franjasDelDia(dia, c).find((f) => f.inicio.getTime() === inicio.getTime());
  if (!franja || inicio <= ahora) throw reglaNegocio('FRANJA_NO_VALIDA', 'Esa hora no es una franja disponible del taller');
  if (dia > sumarDias(diaLocal(ahora, c.zonaHoraria), DIAS_MAX_ANTELACION)) {
    throw reglaNegocio('FUERA_DE_PLAZO', `Solo se puede reservar con ${DIAS_MAX_ANTELACION} días de antelación como máximo`);
  }
  return { dia, franja };
}

/** Mecánicos de alta que no tienen ausencia ese día. */
export async function mecanicosPresentes(tx: Tx, dia: string) {
  return tx.empleado.count({
    where: { activo: true, usuario: { rol: 'MECANICO', activo: true }, ausencias: { none: { fecha: fechaDb(dia) } } },
  });
}

/** Ocupación de un día: capacidad, citas activas y citas por franja (clave: instante ISO). */
export async function ocupacionDia(tx: Tx, dia: string, c: ConfigTaller) {
  const desde = inicioDia(dia, c.zonaHoraria);
  const hasta = inicioDia(sumarDias(dia, 1), c.zonaHoraria);
  const [puestosActivos, presentes, ordenesArrastradas, citas] = await Promise.all([
    tx.puesto.count({ where: { activo: true } }),
    mecanicosPresentes(tx, dia),
    // Vehículos que siguen en el taller desde días anteriores ocupan sitio.
    tx.orden.count({ where: { estado: { not: 'ENTREGADA' }, cita: { inicio: { lt: desde } } } }),
    tx.cita.findMany({ where: { inicio: { gte: desde, lt: hasta }, estado: { in: [...ESTADOS_CITA_ACTIVA] } }, select: { inicio: true } }),
  ]);
  const capacidad = capacidadDia({ puestosActivos, mecanicosPresentes: presentes, vehiculosPorMecanico: c.vehiculosPorMecanico, ordenesArrastradas });
  const porFranja = new Map<string, number>();
  for (const x of citas) porFranja.set(x.inicio.toISOString(), (porFranja.get(x.inicio.toISOString()) ?? 0) + 1);
  return { capacidad, ocupadas: citas.length, porFranja };
}

/** Plazas libres en una franja concreta, teniendo en cuenta el día y la franja. */
export function libresEnFranja(o: Awaited<ReturnType<typeof ocupacionDia>>, inicio: Date, c: ConfigTaller) {
  const libresDia = Math.max(0, o.capacidad - o.ocupadas);
  const libresFranja = Math.max(0, c.recepcionesPorFranja - (o.porFranja.get(inicio.toISOString()) ?? 0));
  return Math.min(libresDia, libresFranja);
}
