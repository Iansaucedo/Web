import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../db';
import { reloj } from '../lib/reloj';
import { emailsA, entrar, reiniciarBd } from './ayudas';

beforeEach(reiniciarBd);

const a = (hhmm: string, dia = '2026-11-09') => reloj.fijar(new Date(`${dia}T${hhmm}:00+01:00`));
const fichar = (ag: Awaited<ReturnType<typeof entrar>>, tipo: string) => ag.post('/api/fichajes').send({ tipo });

describe('fichar', () => {
  it('entrada, pausa, vuelta y salida: calcula horas trabajadas sin pausas', async () => {
    const mec = await entrar('mec1@taller.test', 'MECANICO');
    a('07:58');
    expect((await fichar(mec, 'ENTRADA')).status).toBe(201);
    a('10:30');
    await fichar(mec, 'INICIO_PAUSA');
    a('10:45');
    await fichar(mec, 'FIN_PAUSA');
    a('16:05');
    await fichar(mec, 'SALIDA');
    const hoy = (await mec.get('/api/fichajes/hoy')).body;
    expect(hoy.resumen).toEqual({ minutosTrabajados: 472, minutosPausa: 15, completa: true });
    expect(hoy.permitidos).toEqual(['ENTRADA']);
  });

  it('QA: fichajes fuera de orden: 409 con lo que sí se puede hacer', async () => {
    const mec = await entrar('mec1@taller.test', 'MECANICO');
    a('08:00');
    const r = await fichar(mec, 'SALIDA');
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ codigo: 'FICHAJE_FUERA_DE_ORDEN', detalles: { permitidos: ['ENTRADA'] } });
    await fichar(mec, 'ENTRADA');
    expect((await fichar(mec, 'FIN_PAUSA')).status).toBe(409);
    expect((await fichar(mec, 'ENTRADA')).status).toBe(409);
  });

  it('QA: doble clic en «Entrada» registra una sola', async () => {
    const mec = await entrar('mec1@taller.test', 'MECANICO');
    a('08:00');
    const [x, y] = await Promise.all([fichar(mec, 'ENTRADA'), fichar(mec, 'ENTRADA')]);
    expect([x.status, y.status].sort()).toEqual([201, 409]);
    expect(await prisma.fichaje.count()).toBe(1);
  });

  it('cada día empieza de cero aunque ayer olvidara la salida', async () => {
    const mec = await entrar('mec1@taller.test', 'MECANICO');
    a('08:00', '2026-11-09');
    await fichar(mec, 'ENTRADA');
    a('08:00', '2026-11-10');
    expect((await mec.get('/api/fichajes/hoy')).body.permitidos).toEqual(['ENTRADA']);
    expect((await fichar(mec, 'ENTRADA')).status).toBe(201);
  });

  it('el cliente no ficha', async () => {
    const ana = await entrar('ana@cliente.test');
    expect((await fichar(ana, 'ENTRADA')).status).toBe(403);
  });
});

describe('jornadas', () => {
  async function semana() {
    const mec = await entrar('mec1@taller.test', 'MECANICO');
    const jefe = await entrar('jefe@taller.test', 'JEFE');
    for (const [dia, entrada, salida] of [['2026-11-09', '08:00', '16:00'], ['2026-11-10', '08:30', '17:00']]) {
      a(entrada, dia);
      await fichar(mec, 'ENTRADA');
      a(salida, dia);
      await fichar(mec, 'SALIDA');
    }
    return { mec, jefe };
  }

  it('el jefe ve las jornadas de todos; el mecánico solo la suya', async () => {
    const { mec, jefe } = await semana();
    const r = (await jefe.get('/api/jornadas?desde=2026-11-09&hasta=2026-11-10')).body.datos;
    expect(r.map((j: { minutosTrabajados: number }) => j.minutosTrabajados)).toEqual([480, 510]);
    expect(r[0]).toMatchObject({ entrada: '08:00', salida: '16:00', completa: true, corregida: false });
    const otro = await entrar('mec2@taller.test', 'MECANICO');
    expect((await mec.get(`/api/jornadas?desde=2026-11-09&hasta=2026-11-10&empleadoId=${otro.empleadoId}`)).status).toBe(403);
    expect((await otro.get('/api/jornadas?desde=2026-11-09&hasta=2026-11-10')).body.datos).toHaveLength(0);
  });

  it('exporta CSV para Excel, protegido contra fórmulas', async () => {
    const { jefe } = await semana();
    await prisma.usuario.updateMany({ where: { email: 'mec1@taller.test' }, data: { nombre: '=HYPERLINK("http://x")' } });
    const r = await jefe.get('/api/jornadas.csv?desde=2026-11-09&hasta=2026-11-10');
    expect(r.headers['content-type']).toMatch(/text\/csv/);
    expect(r.text.charCodeAt(0)).toBe(0xfeff);
    expect(r.text).toContain('Empleado;Día;Entrada;Salida;Pausas (min);Trabajado (h);Completa');
    expect(r.text).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(r.text).toContain('8,00');
  });

  it('rango demasiado largo: 400', async () => {
    const jefe = await entrar('jefe@taller.test', 'JEFE');
    expect((await jefe.get('/api/jornadas?desde=2026-01-01&hasta=2026-12-31')).status).toBe(400);
  });
});

describe('correcciones de fichaje', () => {
  it('el mecánico pide corregir la salida olvidada; el jefe acepta y la jornada cambia', async () => {
    const mec = await entrar('mec1@taller.test', 'MECANICO');
    const jefe = await entrar('jefe@taller.test', 'JEFE');
    a('08:00');
    await fichar(mec, 'ENTRADA');
    a('09:00', '2026-11-10');
    const s = await mec.post('/api/correcciones').send({ fecha: '2026-11-09', tipo: 'SALIDA', hora: '16:05', motivo: 'Olvidé fichar' });
    expect(s.status).toBe(201);
    expect((await emailsA('jefe@taller.test')).map((e) => e.plantilla)).toContain('CORRECCION_SOLICITADA');
    expect((await jefe.post(`/api/correcciones/${s.body.id}/aceptar`).send({})).body.estado).toBe('ACEPTADA');
    const j = (await jefe.get('/api/jornadas?desde=2026-11-09&hasta=2026-11-09')).body.datos[0];
    expect(j).toMatchObject({ salida: '16:05', minutosTrabajados: 485, completa: true, corregida: true });
    expect((await emailsA('mec1@taller.test')).map((e) => e.plantilla)).toContain('CORRECCION_RESUELTA');
    expect((await jefe.post(`/api/correcciones/${s.body.id}/aceptar`).send({})).status).toBe(409);
  });

  it('QA: no se piden correcciones de días futuros', async () => {
    const mec = await entrar('mec1@taller.test', 'MECANICO');
    a('08:00');
    expect((await mec.post('/api/correcciones').send({ fecha: '2026-11-12', tipo: 'ENTRADA', hora: '08:00', motivo: 'x' })).body.codigo).toBe('FECHA_FUTURA');
    expect((await mec.post('/api/correcciones').send({ fecha: '2026-11-09', tipo: 'ENTRADA', hora: '25:00', motivo: 'x' })).status).toBe(400);
  });

  it('QA: una corrección que deja la jornada imposible se rechaza', async () => {
    const mec = await entrar('mec1@taller.test', 'MECANICO');
    const jefe = await entrar('jefe@taller.test', 'JEFE');
    a('08:00');
    await fichar(mec, 'ENTRADA');
    a('16:00');
    await fichar(mec, 'SALIDA');
    const s = (await mec.post('/api/correcciones').send({ fecha: '2026-11-09', tipo: 'SALIDA', hora: '07:00', motivo: 'Salí antes de entrar' })).body;
    const r = await jefe.post(`/api/correcciones/${s.id}/aceptar`).send({});
    expect(r.status).toBe(422);
    expect(r.body.codigo).toBe('SECUENCIA_INVALIDA');
    expect((await prisma.solicitudCorreccionFichaje.findUniqueOrThrow({ where: { id: s.id } })).estado).toBe('PENDIENTE');
  });

  it('el jefe corrige directamente; el original queda en el historial', async () => {
    const mec = await entrar('mec1@taller.test', 'MECANICO');
    const jefe = await entrar('jefe@taller.test', 'JEFE');
    a('08:17');
    const f = (await fichar(mec, 'ENTRADA')).body;
    const r = await jefe.post(`/api/fichajes/${f.id}/corregir`).send({ hora: '07:58', motivo: 'Tablet sin conexión' });
    expect(r.status).toBe(201);
    expect(await prisma.fichaje.count()).toBe(2);
    const hoy = (await mec.get('/api/fichajes/hoy')).body;
    expect(hoy.fichajes).toHaveLength(1);
    expect(hoy.fichajes[0]).toMatchObject({ hora: '07:58', corregido: true });
    expect((await emailsA('mec1@taller.test')).map((e) => e.plantilla)).toContain('FICHAJE_CORREGIDO');
    expect((await jefe.post(`/api/fichajes/${f.id}/corregir`).send({ hora: '07:50', motivo: 'otra vez' })).status).toBe(409);
  });

  it('QA: nadie corrige sus propios fichajes (salvo el dueño)', async () => {
    const jefe = await entrar('jefe@taller.test', 'JEFE');
    a('08:17');
    const f = (await fichar(jefe, 'ENTRADA')).body;
    expect((await jefe.post(`/api/fichajes/${f.id}/corregir`).send({ hora: '07:00', motivo: 'yo' })).status).toBe(403);
    const s = (await jefe.post('/api/correcciones').send({ fecha: '2026-11-09', tipo: 'ENTRADA', hora: '07:00', motivo: 'yo' })).body;
    expect((await jefe.post(`/api/correcciones/${s.id}/aceptar`).send({})).status).toBe(403);
    const dueno = await entrar('dueno@taller.test', 'DUENO');
    expect((await dueno.post(`/api/correcciones/${s.id}/aceptar`).send({})).status).toBe(200);
  });

  it('rechazar una solicitud avisa y no cambia nada', async () => {
    const mec = await entrar('mec1@taller.test', 'MECANICO');
    const jefe = await entrar('jefe@taller.test', 'JEFE');
    a('08:00');
    await fichar(mec, 'ENTRADA');
    const s = (await mec.post('/api/correcciones').send({ fecha: '2026-11-09', tipo: 'ENTRADA', hora: '07:00', motivo: 'x' })).body;
    expect((await jefe.post(`/api/correcciones/${s.id}/rechazar`).send({})).body.estado).toBe('RECHAZADA');
    expect(await prisma.fichaje.count()).toBe(1);
    expect((await mec.get('/api/correcciones')).body.datos[0].estado).toBe('RECHAZADA');
  });
});
