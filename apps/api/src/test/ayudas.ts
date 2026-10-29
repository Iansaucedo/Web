import request from 'supertest';
import type { Rol } from '@prisma/client';
import { prisma } from '../db';
import { crearApp } from '../app';
import { reloj } from '../lib/reloj';
import { reiniciarLimites } from '../middleware/limite';

export const app = crearApp();

/** Vacía todas las tablas (menos las migraciones) y deja la configuración y 3 puestos. */
export async function reiniciarBd() {
  const tablas = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tablas.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
  await prisma.configTaller.create({ data: { id: 1 } });
  await prisma.puesto.createMany({ data: [{ nombre: 'Puesto 1' }, { nombre: 'Puesto 2' }, { nombre: 'Puesto 3' }] });
  reloj.fijar(null);
  reiniciarLimites();
}

export type Agente = ReturnType<typeof request.agent> & { usuarioId: string; empleadoId: string | null; email: string };

/**
 * Entra como un usuario. Si se pide un rol de personal, se crea antes con ese rol
 * (como haría una invitación), y si es cliente se completa su perfil salvo `sinPerfil`.
 */
export async function entrar(email: string, rol: Rol = 'CLIENTE', opciones: { sinPerfil?: boolean; empresa?: boolean } = {}): Promise<Agente> {
  if (rol !== 'CLIENTE') {
    const existe = await prisma.usuario.findUnique({ where: { email } });
    if (!existe) {
      await prisma.usuario.create({
        data: { email, nombre: email.split('@')[0], rol, empleado: rol === 'MECANICO' || rol === 'JEFE' ? { create: {} } : undefined },
      });
    }
  }
  const agente = request.agent(app) as Agente;
  const r = await agente.post('/api/auth/test-login').send({ email });
  if (r.status !== 200) throw new Error(`test-login falló: ${r.status} ${JSON.stringify(r.body)}`);
  agente.usuarioId = r.body.id;
  agente.empleadoId = r.body.empleadoId;
  agente.email = email;
  if (rol === 'CLIENTE' && !opciones.sinPerfil) {
    const p = await agente
      .put('/api/perfil')
      .send(opciones.empresa ? { tipo: 'EMPRESA', telefono: '600111222', razonSocial: 'Flotas SL', nif: 'B12345678' } : { tipo: 'INDIVIDUAL', telefono: '600111222' });
    if (p.status !== 200) throw new Error(`perfil falló: ${p.status} ${JSON.stringify(p.body)}`);
  }
  return agente;
}

export const anonimo = () => request(app);

/** Lunes 9 de noviembre de 2026, 10:00 en Madrid: fecha de referencia de los tests. */
export const AHORA = new Date('2026-11-09T09:00:00.000Z');
export const MANANA = '2026-11-10';
export const PASADO = '2026-11-11';

/** Instante UTC de una hora de Madrid en noviembre (UTC+1). */
export const madrid = (dia: string, hhmm: string) => new Date(`${dia}T${hhmm}:00+01:00`).toISOString();

export async function emailsA(para: string) {
  return prisma.emailSaliente.findMany({ where: { para }, orderBy: { creadoEn: 'asc' } });
}

export const GOLF = { matricula: '1234ABC', marca: 'Volkswagen', modelo: 'Golf', anio: 2018, combustible: 'DIESEL', kilometros: 98000 };

/** Taller listo para reservar: reloj fijado en AHORA y `mecanicos` mecánicos de alta. */
export async function tallerAbierto(mecanicos = 1) {
  reloj.fijar(AHORA);
  const lista: Agente[] = [];
  for (let i = 1; i <= mecanicos; i++) lista.push(await entrar(`mec${i}@taller.test`, 'MECANICO'));
  return lista;
}

export async function clienteConCoche(email = 'ana@cliente.test', matricula = '1234ABC') {
  const c = await entrar(email);
  const v = await c.post('/api/vehiculos').send({ ...GOLF, matricula });
  if (v.status !== 201) throw new Error(`vehículo: ${v.status} ${JSON.stringify(v.body)}`);
  return Object.assign(c, { vehiculoId: v.body.id as string });
}

export async function reservar(c: Agente & { vehiculoId: string }, dia = MANANA, hhmm = '09:00') {
  return c.post('/api/citas').send({ vehiculoId: c.vehiculoId, inicio: madrid(dia, hhmm), descripcionProblema: 'Ruido al frenar' });
}

/** Vehículo de Ana recibido hoy y colocado en el Puesto 1. Devuelve los actores y la orden. */
export async function ordenEnDiagnostico() {
  reloj.fijar(new Date('2026-11-09T06:00:00Z')); // lunes 07:00 en Madrid
  const jefe = await entrar('jefe@taller.test', 'JEFE');
  const mec = await entrar('mec1@taller.test', 'MECANICO');
  const ana = await clienteConCoche();
  const cita = (await reservar(ana, '2026-11-09', '09:00')).body;
  reloj.fijar(new Date('2026-11-09T08:00:00Z')); // 09:00
  const puesto = await prisma.puesto.findFirstOrThrow({ where: { nombre: 'Puesto 1' } });
  const orden = (await jefe.post(`/api/citas/${cita.id}/recibir`).send({ kmEntrada: 98500, puestoId: puesto.id })).body;
  if (!orden.id) throw new Error(`recibir: ${JSON.stringify(orden)}`);
  return { jefe, mec, ana, orden, puesto };
}

export const PARTIDAS = [
  { descripcion: 'Cambiar pastillas de freno delanteras', horasEstimadas: 1, piezasEstimadasCentimos: 5600 },
  { descripcion: 'Sustituir sensor ABS', horasEstimadas: 0.5, piezasEstimadasCentimos: 10850 },
];

/** Orden con una solicitud enviada y respondida según `decisiones` (por índice). */
export async function ordenEnReparacion(decisiones: ('ACEPTADA' | 'RECHAZADA')[] = ['ACEPTADA', 'ACEPTADA']) {
  const e = await ordenEnDiagnostico();
  const s = (await e.mec.post(`/api/ordenes/${e.orden.id}/solicitudes`).send({ partidas: PARTIDAS.slice(0, decisiones.length) })).body;
  const resp = await e.ana
    .post(`/api/solicitudes/${s.id}/responder`)
    .send({ decisiones: Object.fromEntries(s.partidas.map((p: { id: string }, i: number) => [p.id, decisiones[i]])) });
  if (resp.status !== 200) throw new Error(`responder: ${resp.status} ${JSON.stringify(resp.body)}`);
  const pieza = await prisma.pieza.create({ data: { referencia: 'PF-001', nombre: 'Pastillas de freno', precioCentimos: 5600, stock: 3 } });
  return { ...e, solicitud: s, partidas: s.partidas as { id: string }[], pieza };
}
