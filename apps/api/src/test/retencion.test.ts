import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../db';
import { reloj } from '../lib/reloj';
import { aplicarRetencion } from '../servicios/retencion';
import { AHORA, entrar, reiniciarBd } from './ayudas';

beforeEach(reiniciarBd);

const hace = (dias: number) => new Date(AHORA.getTime() - dias * 86_400_000);

describe('retención de datos', () => {
  it('borra emails procesados de más de 30 días, avisos leídos de más de 180 (y cualquiera de más de un año) y constancias de más de 6 años', async () => {
    reloj.fijar(AHORA);
    const u = await entrar('ana@cliente.test', 'CLIENTE', { sinPerfil: true });
    await prisma.emailSaliente.createMany({
      data: [
        { para: 'a@x.es', plantilla: 'BIENVENIDA', datos: {}, estado: 'ENVIADO', creadoEn: hace(31) },
        { para: 'a@x.es', plantilla: 'BIENVENIDA', datos: {}, estado: 'FALLIDO', creadoEn: hace(31) },
        { para: 'a@x.es', plantilla: 'BIENVENIDA', datos: {}, estado: 'ENVIADO', creadoEn: hace(29) },
        { para: 'a@x.es', plantilla: 'BIENVENIDA', datos: {}, estado: 'PENDIENTE', creadoEn: hace(90) },
      ],
    });
    await prisma.notificacion.createMany({
      data: [
        { usuarioId: u.usuarioId, tipo: 'X', mensaje: 'leído viejo', leida: true, creadaEn: hace(181) },
        { usuarioId: u.usuarioId, tipo: 'X', mensaje: 'sin leer', leida: false, creadaEn: hace(181) },
        { usuarioId: u.usuarioId, tipo: 'X', mensaje: 'sin leer muy viejo', leida: false, creadaEn: hace(366) },
      ],
    });
    await prisma.registroEliminacion.createMany({
      data: [
        { entidad: 'Vehiculo', entidadId: 'v1', modo: 'BORRADO', datos: {}, usuarioId: u.usuarioId, fecha: hace(6 * 365 + 1) },
        { entidad: 'Vehiculo', entidadId: 'v2', modo: 'BORRADO', datos: {}, usuarioId: u.usuarioId, fecha: hace(5 * 365) },
      ],
    });
    expect(await aplicarRetencion()).toEqual({ emails: 2, avisos: 2, constancias: 1 });
    expect((await prisma.emailSaliente.findMany()).map((e) => e.estado).sort()).toEqual(['ENVIADO', 'PENDIENTE']);
    expect((await prisma.notificacion.findMany()).map((n) => n.mensaje)).toEqual(['sin leer']);
    expect((await prisma.registroEliminacion.findMany()).map((r) => r.entidadId)).toEqual(['v2']);
  });
});
