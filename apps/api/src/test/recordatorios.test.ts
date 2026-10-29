import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../db';
import { reloj } from '../lib/reloj';
import { enviarRecordatorios, recordar } from '../servicios/recordatorios';
import { AHORA, MANANA, PASADO, clienteConCoche, emailsA, madrid, reiniciarBd, reservar, tallerAbierto } from './ayudas';

beforeEach(reiniciarBd);

const recordatorios = async (email: string) => (await emailsA(email)).filter((e) => e.plantilla === 'RECORDATORIO_CITA');

describe('recordatorio 24 h antes', () => {
  it('se envía una sola vez cuando faltan 24 h o menos, con fecha, hora y vehículo', async () => {
    await tallerAbierto(1);
    const ana = await clienteConCoche();
    await reservar(ana, PASADO, '10:00'); // miércoles 11 a las 10:00; ahora es lunes 9

    reloj.fijar(new Date(new Date(madrid(PASADO, '10:00')).getTime() - 25 * 3_600_000));
    expect(await enviarRecordatorios()).toBe(0);

    reloj.fijar(new Date(new Date(madrid(PASADO, '10:00')).getTime() - 23.5 * 3_600_000));
    expect(await enviarRecordatorios()).toBe(1);
    expect(await enviarRecordatorios()).toBe(0);
    const [r] = await recordatorios('ana@cliente.test');
    expect(r.datos).toMatchObject({ hora: '10:00', matricula: '1234ABC', fecha: 'miércoles, 11 de noviembre' });
    expect(await prisma.notificacion.count({ where: { tipo: 'RECORDATORIO_CITA' } })).toBe(1);
  });

  it('QA: dos procesos a la vez no mandan el recordatorio dos veces', async () => {
    await tallerAbierto(1);
    const cita = (await reservar(await clienteConCoche(), PASADO, '10:00')).body;
    const ahora = new Date(new Date(madrid(PASADO, '10:00')).getTime() - 3_600_000);
    reloj.fijar(ahora);
    // Los dos procesos vieron la cita sin recordar en su consulta; solo uno gana al marcarla.
    const ganan = await Promise.all([recordar(cita.id, ahora, 'Europe/Madrid'), recordar(cita.id, ahora, 'Europe/Madrid')]);
    expect(ganan.filter(Boolean)).toHaveLength(1);
    expect(await recordar(cita.id, ahora, 'Europe/Madrid')).toBe(false);
    expect(await enviarRecordatorios()).toBe(0);
    expect(await recordatorios('ana@cliente.test')).toHaveLength(1);
  });

  it('no se recuerda una cita cancelada, ya pasada ni reservada con menos de 24 h', async () => {
    await tallerAbierto(1);
    const ana = await clienteConCoche();
    const cancelada = (await reservar(ana, PASADO, '10:00')).body;
    await ana.post(`/api/citas/${cancelada.id}/cancelar`).send({});
    const luis = await clienteConCoche('luis@cliente.test', '9999XYZ');
    reloj.fijar(new Date(AHORA.getTime() + 3 * 3_600_000)); // lunes 13:00
    await reservar(luis, MANANA, '09:00'); // reservada 20 h antes: ya tiene el email de la reserva
    expect(await enviarRecordatorios()).toBe(0);
    reloj.fijar(new Date(madrid(PASADO, '11:00')));
    expect(await enviarRecordatorios()).toBe(0);
    expect(await recordatorios('ana@cliente.test')).toHaveLength(0);
    expect(await recordatorios('luis@cliente.test')).toHaveLength(0);
  });
});
