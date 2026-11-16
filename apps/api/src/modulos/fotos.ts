import { z } from '../openapi/zod';
import { definir } from '../lib/ruta';
import { prisma } from '../db';
import { transaccion } from '../lib/transaccion';
import { conflicto, noEncontrado, reglaNegocio } from '../lib/errores';
import { reloj } from '../lib/reloj';
import { PERSONAL } from '../servicios/acceso';
import { adjuntarFotos, fotoVisible, formatoReal, MAX_BYTES_FOTO, MAX_FOTOS_POR_TRABAJO, MAX_FOTOS_SUELTAS, LADO_MAXIMO_FOTO, sanearFoto, TIPOS_FOTO, urlFoto } from '../servicios/fotos';
import { Id, ParamId } from './esquemas';

const LADO = LADO_MAXIMO_FOTO;
const FotoSubida = z.object({ id: Id, url: z.string().openapi({ example: '/api/fotos/ckx…' }) }).openapi('FotoSubida');

definir({
  metodo: 'post',
  ruta: '/fotos',
  etiqueta: 'Trabajos',
  resumen: 'Subir una foto',
  descripcion: `El cuerpo es la imagen tal cual (JPEG, PNG o WebP, hasta ${MAX_BYTES_FOTO / 1024 / 1024} MB), con su Content-Type. El servidor comprueba el formato por los bytes y la vuelve a codificar sin metadatos (EXIF, GPS), girada según su orientación y con ${LADO} px como máximo. Cada persona puede tener como mucho ${MAX_FOTOS_SUELTAS} fotos sin adjuntar. La foto queda suelta hasta adjuntarla a un trabajo (al pedir autorización o después); si nadie la adjunta en 24 h, se borra.`,
  acceso: PERSONAL,
  binario: { tipos: TIPOS_FOTO, maxBytes: MAX_BYTES_FOTO },
  respuesta: FotoSubida,
  codigo: 201,
  errores: { 422: 'FOTO_NO_VALIDA (el contenido no es una imagen del tipo indicado) o DEMASIADAS_FOTOS_SUELTAS' },
  manejador: async ({ usuario, req, cuerpo }) => {
    const bruto = cuerpo as unknown as Buffer;
    const tipo = Buffer.isBuffer(bruto) ? formatoReal(bruto) : null;
    if (!tipo || tipo !== req.headers['content-type']?.split(';')[0].trim().toLowerCase()) {
      throw reglaNegocio('FOTO_NO_VALIDA', 'El archivo no es una foto JPEG, PNG o WebP válida');
    }
    const sueltas = await prisma.fotoTrabajo.count({ where: { subidaPorId: usuario.id, partidaId: null } });
    if (sueltas >= MAX_FOTOS_SUELTAS) {
      throw reglaNegocio('DEMASIADAS_FOTOS_SUELTAS', `Tienes ${sueltas} fotos subidas sin adjuntar a ningún trabajo. Adjúntalas o espera a que se borren (24 h)`);
    }
    const datos = await sanearFoto(bruto, tipo);
    const f = await prisma.fotoTrabajo.create({
      data: { datos, tipoContenido: tipo, bytes: datos.length, subidaPorId: usuario.id, subidaEn: reloj.ahora() },
      select: { id: true, url: true },
    });
    return { id: f.id, url: urlFoto(f) };
  },
});

definir({
  metodo: 'get',
  ruta: '/fotos/:id',
  etiqueta: 'Trabajos',
  resumen: 'Ver una foto',
  descripcion: 'El personal ve las fotos de cualquier trabajo; el cliente, solo las de sus órdenes. Una foto aún sin adjuntar solo la ve quien la subió.',
  params: ParamId,
  produce: 'imagen',
  errores: { 404: 'No existe o no puedes verla' },
  manejador: async ({ usuario, params, res }) => {
    const f = await fotoVisible(usuario, params.id);
    res
      .status(200)
      .set({ 'Content-Type': f.tipo, 'Cache-Control': 'private, max-age=86400', 'Content-Disposition': 'inline', 'Content-Security-Policy': "default-src 'none'" })
      .end(f.datos);
  },
});

definir({
  metodo: 'post',
  ruta: '/partidas/:id/fotos',
  etiqueta: 'Trabajos',
  resumen: 'Adjuntar una foto a un trabajo ya propuesto',
  descripcion: `Adjunta una foto subida antes con POST /fotos. Como mucho ${MAX_FOTOS_POR_TRABAJO} por trabajo. El cliente la ve en su orden.`,
  acceso: PERSONAL,
  params: ParamId,
  cuerpo: z.object({ fotoId: Id }).strict(),
  respuesta: FotoSubida,
  codigo: 201,
  errores: { 404: 'El trabajo no existe', 409: 'La orden está entregada', 422: 'FOTO_NO_VALIDA o DEMASIADAS_FOTOS' },
  manejador: async ({ usuario, params, cuerpo }) =>
    transaccion(async (tx) => {
      const p = await tx.partida.findUnique({ where: { id: params.id }, include: { solicitud: { include: { orden: true } } } });
      if (!p) throw noEncontrado('El trabajo');
      if (p.solicitud.orden.estado === 'ENTREGADA') throw conflicto('ESTADO_NO_PERMITE', 'La orden ya está entregada');
      await adjuntarFotos(tx, p.id, [cuerpo.fotoId], usuario.id);
      return { id: cuerpo.fotoId, url: `/api/fotos/${cuerpo.fotoId}` };
    }),
});
