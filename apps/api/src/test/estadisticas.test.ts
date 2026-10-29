import { beforeEach, describe, expect, it } from 'vitest';
import { reloj } from '../lib/reloj';
import { entrar, ordenEnReparacion, reiniciarBd } from './ayudas';

beforeEach(reiniciarBd);

describe('estadísticas del dueño', () => {
  it('suma la facturación de lo completado y cuenta órdenes y citas', async () => {
    const e = await ordenEnReparacion(['ACEPTADA']);
    await e.mec.post(`/api/ordenes/${e.orden.id}/trabajos`).send({ partidaId: e.partidas[0].id, minutos: 60, descripcion: 'x' });
    await e.mec.post(`/api/partidas/${e.partidas[0].id}/terminar`).send({});
    reloj.fijar(new Date('2026-11-09T14:00:00Z'));
    await e.mec.post(`/api/ordenes/${e.orden.id}/completar`).send({ kmSalida: 98510 });
    const dueno = await entrar('dueno@taller.test', 'DUENO');
    const r = await dueno.get('/api/estadisticas?desde=2026-11-01&hasta=2026-11-30');
    expect(r.status).toBe(200);
    expect(r.body.facturacion).toEqual({ base: 4000, iva: 840, total: 4840 });
    expect(r.body.ordenes).toMatchObject({ completadas: 1, abiertas: 1, ticketMedioCentimos: 4840 });
    expect(r.body.ordenes.horasMediasReparacion).toBeCloseTo(6, 0);
    expect(r.body.citas).toMatchObject({ total: 1, canceladas: 0, noPresentado: 0 });
    expect(r.body.trabajosFrecuentes[0]).toEqual({ descripcion: 'Cambiar pastillas de freno delanteras', veces: 1 });
    expect(r.body.mecanicos[0]).toMatchObject({ nombre: 'mec1', minutosRegistrados: 60 });
    expect(r.body.porDia.find((d: { fecha: string }) => d.fecha === '2026-11-09')).toMatchObject({ facturadoCentimos: 4840, citas: 1 });
  });

  it('solo el dueño las ve', async () => {
    const jefe = await entrar('jefe@taller.test', 'JEFE');
    expect((await jefe.get('/api/estadisticas?desde=2026-11-01&hasta=2026-11-30')).status).toBe(403);
  });

  it('rango de más de un año: 400', async () => {
    const dueno = await entrar('dueno@taller.test', 'DUENO');
    expect((await dueno.get('/api/estadisticas?desde=2025-01-01&hasta=2026-11-30')).status).toBe(400);
  });
});
