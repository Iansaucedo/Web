import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../db';
import { reloj } from '../lib/reloj';
import { limpiarFotosHuerfanas } from '../servicios/fotos';
import { type Agente, clienteConCoche, ordenEnDiagnostico, ordenEnReparacion, PARTIDAS, reiniciarBd } from './ayudas';

beforeEach(reiniciarBd);

// Cabeceras mínimas de cada formato: el servidor mira los bytes, no el nombre ni el tipo que dice el navegador.
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 2)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(200, 3)]);

const subir = (a: Agente, datos: Buffer, tipo = 'image/jpeg') => a.post('/api/fotos').set('Content-Type', tipo).send(datos);

/** Descarga binaria con supertest. */
const descargar = (a: Agente, url: string) =>
  a.get(url).buffer(true).parse((res, cb) => {
    const t: Buffer[] = [];
    res.on('data', (c: Buffer) => t.push(c));
    res.on('end', () => cb(null, Buffer.concat(t)));
  });

describe('subir fotos', () => {
  it('el mecánico sube JPEG, PNG y WebP y recibe la URL para verla', async () => {
    const { mec } = await ordenEnDiagnostico();
    for (const [datos, tipo] of [[JPEG, 'image/jpeg'], [PNG, 'image/png'], [WEBP, 'image/webp']] as const) {
      const r = await subir(mec, datos, tipo);
      expect(r.status).toBe(201);
      expect(r.body.url).toBe(`/api/fotos/${r.body.id}`);
      const img = await descargar(mec, r.body.url);
      expect(img.status).toBe(200);
      expect(img.headers['content-type']).toBe(tipo);
      expect(img.headers['x-content-type-options']).toBe('nosniff');
      expect(Buffer.compare(img.body as Buffer, datos)).toBe(0);
    }
  });

  it('QA: un archivo que no es una imagen se rechaza aunque diga ser image/jpeg', async () => {
    const { mec } = await ordenEnDiagnostico();
    const html = Buffer.from('<html><script>alert(1)</script></html>');
    const r = await subir(mec, html);
    expect(r.status).toBe(422);
    expect(r.body.codigo).toBe('FOTO_NO_VALIDA');
    // Un PNG que dice ser JPEG tampoco: el tipo guardado debe coincidir con el contenido.
    expect((await subir(mec, PNG, 'image/jpeg')).body.codigo).toBe('FOTO_NO_VALIDA');
  });

  it('QA: otros tipos (SVG, GIF, sin tipo) dan 415 y más de 5 MB dan 413', async () => {
    const { mec } = await ordenEnDiagnostico();
    expect((await subir(mec, Buffer.from('<svg/>'), 'image/svg+xml')).status).toBe(415);
    expect((await subir(mec, Buffer.from('GIF89a'), 'image/gif')).status).toBe(415);
    expect((await mec.post('/api/fotos').set('Content-Type', 'application/octet-stream').send(JPEG)).status).toBe(415);
    const grande = Buffer.concat([JPEG, Buffer.alloc(5 * 1024 * 1024)]);
    const r = await subir(mec, grande);
    expect(r.status).toBe(413);
    expect(await prisma.fotoTrabajo.count()).toBe(0);
  });

  it('QA: el resto de rutas siguen exigiendo JSON (una imagen no cuela como cuerpo vacío)', async () => {
    const { jefe, orden } = await ordenEnReparacion(['RECHAZADA']);
    const r = await jefe.post(`/api/ordenes/${orden.id}/entregar`).set('Content-Type', 'image/jpeg').send(JPEG);
    expect(r.status).toBe(415);
  });

  it('un cliente no puede subir fotos', async () => {
    const { ana } = await ordenEnDiagnostico();
    expect((await subir(ana, JPEG)).status).toBe(403);
  });
});

describe('fotos en la solicitud de autorización', () => {
  it('las fotos subidas se adjuntan a cada trabajo y el cliente las ve al decidir', async () => {
    const { mec, ana, orden } = await ordenEnDiagnostico();
    const f1 = (await subir(mec, JPEG)).body;
    const f2 = (await subir(mec, PNG, 'image/png')).body;
    const r = await mec.post(`/api/ordenes/${orden.id}/solicitudes`).send({ partidas: [{ ...PARTIDAS[0], fotoIds: [f1.id, f2.id] }, PARTIDAS[1]] });
    expect(r.status).toBe(201);
    const vista = (await ana.get(`/api/ordenes/${orden.id}`)).body;
    const [p1, p2] = vista.solicitudes[0].partidas;
    expect(p1.fotos.map((f: { url: string }) => f.url)).toEqual([f1.url, f2.url]);
    expect(p2.fotos).toEqual([]);
    expect((await descargar(ana, f1.url)).status).toBe(200);
  });

  it('QA: no se adjunta una foto ajena, ya usada o inexistente, y no queda nada a medias', async () => {
    const { mec, orden } = await ordenEnDiagnostico();
    const otro = await (await import('./ayudas')).entrar('mec2@taller.test', 'MECANICO');
    const ajena = (await subir(otro, JPEG)).body;
    const r = await mec.post(`/api/ordenes/${orden.id}/solicitudes`).send({ partidas: [{ ...PARTIDAS[0], fotoIds: [ajena.id] }] });
    expect(r.status).toBe(422);
    expect(r.body.codigo).toBe('FOTO_NO_VALIDA');
    expect(await prisma.solicitudAutorizacion.count()).toBe(0);
    expect((await prisma.orden.findUniqueOrThrow({ where: { id: orden.id } })).estado).toBe('EN_DIAGNOSTICO');

    const mia = (await subir(mec, JPEG)).body;
    const repetida = await mec.post(`/api/ordenes/${orden.id}/solicitudes`).send({ partidas: [{ ...PARTIDAS[0], fotoIds: [mia.id] }, { ...PARTIDAS[1], fotoIds: [mia.id] }] });
    expect(repetida.status).toBe(422);
    expect((await mec.post(`/api/ordenes/${orden.id}/solicitudes`).send({ partidas: [{ ...PARTIDAS[0], fotoIds: ['no-existe'] }] })).status).toBe(422);
  });

  it('como mucho 6 fotos por trabajo', async () => {
    const { mec, orden } = await ordenEnDiagnostico();
    const ids = [];
    for (let i = 0; i < 7; i++) ids.push((await subir(mec, JPEG)).body.id);
    expect((await mec.post(`/api/ordenes/${orden.id}/solicitudes`).send({ partidas: [{ ...PARTIDAS[0], fotoIds: ids }] })).status).toBe(400);
  });

  it('se pueden añadir fotos a un trabajo ya propuesto', async () => {
    const { mec, ana, partidas, orden } = await ordenEnReparacion();
    const f = (await subir(mec, WEBP, 'image/webp')).body;
    expect((await mec.post(`/api/partidas/${partidas[0].id}/fotos`).send({ fotoId: f.id })).status).toBe(201);
    expect((await mec.post(`/api/partidas/${partidas[0].id}/fotos`).send({ fotoId: f.id })).body.codigo).toBe('FOTO_NO_VALIDA');
    expect((await mec.post(`/api/partidas/${partidas[0].id}/fotos`).send({ url: 'https://blob.example/f.jpg' })).status).toBe(400);
    const vista = (await ana.get(`/api/ordenes/${orden.id}`)).body;
    expect(vista.solicitudes[0].partidas[0].fotos).toHaveLength(1);
  });
});

describe('ver fotos', () => {
  it('QA: otro cliente no ve las fotos de una orden ajena; nadie ve una foto aún sin adjuntar salvo quien la subió', async () => {
    const { mec, orden } = await ordenEnDiagnostico();
    const f = (await subir(mec, JPEG)).body;
    const luis = await clienteConCoche('luis@cliente.test', '9999XYZ');
    expect((await luis.get(f.url)).status).toBe(404);
    await mec.post(`/api/ordenes/${orden.id}/solicitudes`).send({ partidas: [{ ...PARTIDAS[0], fotoIds: [f.id] }] });
    expect((await luis.get(f.url)).status).toBe(404);
    const suelta = (await subir(mec, JPEG)).body;
    const otro = await (await import('./ayudas')).entrar('mec2@taller.test', 'MECANICO');
    expect((await otro.get(suelta.url)).status).toBe(404);
    expect((await mec.get(suelta.url)).status).toBe(200);
  });

  it('el detalle de la orden no carga los bytes de las fotos', async () => {
    const { mec, orden } = await ordenEnDiagnostico();
    const f = (await subir(mec, JPEG)).body;
    await mec.post(`/api/ordenes/${orden.id}/solicitudes`).send({ partidas: [{ ...PARTIDAS[0], fotoIds: [f.id] }] });
    const foto = (await mec.get(`/api/ordenes/${orden.id}`)).body.solicitudes[0].partidas[0].fotos[0];
    expect(Object.keys(foto).sort()).toEqual(['descripcion', 'id', 'url']);
  });
});

describe('limpieza', () => {
  it('las fotos que nadie adjuntó se borran a las 24 h; las adjuntas se quedan', async () => {
    const { mec, orden } = await ordenEnDiagnostico();
    const usada = (await subir(mec, JPEG)).body;
    await subir(mec, PNG, 'image/png');
    await mec.post(`/api/ordenes/${orden.id}/solicitudes`).send({ partidas: [{ ...PARTIDAS[0], fotoIds: [usada.id] }] });
    expect(await limpiarFotosHuerfanas()).toBe(0);
    reloj.fijar(new Date(reloj.ahora().getTime() + 25 * 3_600_000));
    expect(await limpiarFotosHuerfanas()).toBe(1);
    expect((await prisma.fotoTrabajo.findMany()).map((f) => f.id)).toEqual([usada.id]);
  });
});
