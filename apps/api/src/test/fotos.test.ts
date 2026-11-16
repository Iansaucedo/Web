import sharp from 'sharp';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../db';
import { reloj } from '../lib/reloj';
import { formatoReal, LADO_MAXIMO_FOTO, limpiarFotosHuerfanas, MAX_FOTOS_SUELTAS } from '../servicios/fotos';
import { type Agente, anonimo, clienteConCoche, ordenEnDiagnostico, ordenEnReparacion, PARTIDAS, reiniciarBd } from './ayudas';

beforeEach(reiniciarBd);

// Imágenes reales y pequeñas: el servidor las decodifica y las vuelve a codificar, así que deben ser válidas.
const lienzo = (ancho = 40, alto = 20) => sharp({ create: { width: ancho, height: alto, channels: 3, background: { r: 200, g: 60, b: 30 } } });
const JPEG = await lienzo().jpeg().toBuffer();
const PNG = await lienzo().png().toBuffer();
const WEBP = await lienzo().webp().toBuffer();
/** Foto de móvil: EXIF con marca, modelo y GPS, y orientación «girar 90°» (se guarda apaisada, se ve vertical). */
const JPEG_CON_EXIF = await lienzo(40, 20)
  .withExif({ IFD0: { Make: 'MovilEspia', Model: 'X1', Copyright: 'Ana' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '43/1 27/1 0/1' } })
  .withMetadata({ orientation: 6 })
  .jpeg()
  .toBuffer();
// Cabeceras de formato correctas pero contenido roto: pasan el primer filtro y deben fallar al decodificar.
const JPEG_FALSO = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]);

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
      // Se guarda re-codificada en el mismo formato, no los bytes originales.
      expect(formatoReal(img.body as Buffer)).toBe(tipo);
      expect((await sharp(img.body as Buffer).metadata()).width).toBe(40);
    }
  });

  it('QA: la foto se guarda sin EXIF ni GPS y con la orientación aplicada a los píxeles', async () => {
    const { mec } = await ordenEnDiagnostico();
    expect((await sharp(JPEG_CON_EXIF).metadata()).exif).toBeDefined();
    const r = await subir(mec, JPEG_CON_EXIF);
    expect(r.status).toBe(201);
    const guardada = (await descargar(mec, r.body.url)).body as Buffer;
    const m = await sharp(guardada).metadata();
    expect(m.exif).toBeUndefined();
    expect(m.xmp).toBeUndefined();
    expect(m.orientation).toBeUndefined();
    expect([m.width, m.height]).toEqual([20, 40]);
    expect(guardada.includes(Buffer.from('MovilEspia'))).toBe(false);
  });

  it('QA: una foto enorme se reduce y un archivo con cabecera válida pero roto se rechaza', async () => {
    const { mec } = await ordenEnDiagnostico();
    const grande = await lienzo(4000, 1000).jpeg({ quality: 30 }).toBuffer();
    const r = await subir(mec, grande);
    expect(r.status).toBe(201);
    const m = await sharp((await descargar(mec, r.body.url)).body as Buffer).metadata();
    expect([m.width, m.height]).toEqual([LADO_MAXIMO_FOTO, LADO_MAXIMO_FOTO / 4]);
    const roto = await subir(mec, JPEG_FALSO);
    expect(roto.status).toBe(422);
    expect(roto.body.codigo).toBe('FOTO_NO_VALIDA');
  });

  it(`QA: como mucho ${MAX_FOTOS_SUELTAS} fotos sin adjuntar por persona`, async () => {
    const { mec } = await ordenEnDiagnostico();
    for (let i = 0; i < MAX_FOTOS_SUELTAS; i++) expect((await subir(mec, PNG, 'image/png')).status).toBe(201);
    const r = await subir(mec, PNG, 'image/png');
    expect(r.status).toBe(422);
    expect(r.body.codigo).toBe('DEMASIADAS_FOTOS_SUELTAS');
  });

  it('QA: sin sesión se responde 401 sin leer el archivo', async () => {
    const r = await anonimo().post('/api/fotos').set('Content-Type', 'image/jpeg').send(JPEG);
    expect(r.status).toBe(401);
    expect(await prisma.fotoTrabajo.count()).toBe(0);
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
