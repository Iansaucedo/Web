import type { Prisma } from '@prisma/client';
import { z } from '../openapi/zod';
import { definir } from '../lib/ruta';
import { prisma } from '../db';
import { conflicto, reglaNegocio } from '../lib/errores';
import { clienteDe, esPersonal, vehiculoAccesible } from '../servicios/acceso';
import { Id, Instante, ParamId, lista, Centimos } from './esquemas';
import { transaccion } from '../lib/transaccion';
import { reloj } from '../lib/reloj';
import { dejarConstancia } from '../servicios/constancias';

const Matricula = z
  .string()
  .transform((m) => m.replace(/[\s-]/g, '').toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9]{4,10}$/, 'Matrícula no válida'))
  .openapi({ example: '1234ABC' });
const Bastidor = z
  .string()
  .transform((b) => b.replace(/\s/g, '').toUpperCase())
  .pipe(z.string().regex(/^[A-HJ-NPR-Z0-9]{17}$/, 'El bastidor (VIN) tiene 17 caracteres, sin I, O ni Q'))
  .openapi({ example: 'WVWZZZ1KZAW000001' });
const Combustible = z.enum(['GASOLINA', 'DIESEL', 'HIBRIDO', 'ELECTRICO', 'GLP']);
const anioMax = new Date().getFullYear() + 1;

const VehiculoEntrada = z
  .object({
    matricula: Matricula,
    marca: z.string().trim().min(1).max(40),
    modelo: z.string().trim().min(1).max(60),
    anio: z.number().int().min(1950).max(anioMax).optional(),
    combustible: Combustible.optional(),
    kilometros: z.number().int().min(0).max(2_000_000).optional(),
    bastidor: Bastidor.optional(),
  })
  .strict()
  .openapi('VehiculoEntrada');

export const VehiculoSchema = z
  .object({
    id: Id,
    matricula: z.string(),
    marca: z.string(),
    modelo: z.string(),
    anio: z.number().int().nullable(),
    combustible: Combustible.nullable(),
    kilometros: z.number().int().nullable(),
    bastidor: z.string().nullable(),
    cliente: z.object({ id: Id, nombre: z.string(), tipo: z.enum(['INDIVIDUAL', 'EMPRESA']), razonSocial: z.string().nullable() }),
    enTaller: z.boolean().openapi({ description: 'Tiene una orden abierta (no se puede eliminar)' }),
  })
  .openapi('Vehiculo');

const incluir = { cliente: { include: { usuario: true } }, ordenes: { where: { estado: { not: 'ENTREGADA' } }, select: { id: true } } } satisfies Prisma.VehiculoInclude;
type VehiculoBd = Prisma.VehiculoGetPayload<{ include: typeof incluir }>;
export const aVehiculo = (v: VehiculoBd) => ({
  id: v.id,
  matricula: v.matricula,
  marca: v.marca,
  modelo: v.modelo,
  anio: v.anio,
  combustible: v.combustible,
  kilometros: v.kilometros,
  bastidor: v.bastidor,
  cliente: { id: v.cliente.id, nombre: v.cliente.usuario.nombre, tipo: v.cliente.tipo, razonSocial: v.cliente.razonSocial },
  enTaller: v.ordenes.length > 0,
});

async function comprobarUnicos(matricula?: string, bastidor?: string, excepto?: string) {
  if (matricula && (await prisma.vehiculo.findFirst({ where: { matricula, NOT: { id: excepto } } }))) {
    throw conflicto('MATRICULA_DUPLICADA', 'Ya hay un vehículo registrado con esa matrícula');
  }
  if (bastidor && (await prisma.vehiculo.findFirst({ where: { bastidor, NOT: { id: excepto } } }))) {
    throw conflicto('BASTIDOR_DUPLICADO', 'Ya hay un vehículo registrado con ese bastidor');
  }
}

definir({
  metodo: 'get',
  ruta: '/vehiculos',
  etiqueta: 'Vehículos',
  resumen: 'Listar vehículos',
  descripcion: 'Un cliente ve los suyos. El personal ve todos y puede buscar por matrícula, marca, modelo o cliente (`q`).',
  query: z.object({ q: z.string().max(60).optional(), incluirBajas: z.enum(['true', 'false']).optional() }),
  respuesta: lista(VehiculoSchema),
  manejador: async ({ usuario, query }) => {
    const q = query.q?.trim();
    const where: Prisma.VehiculoWhereInput = esPersonal(usuario) ? {} : { cliente: { usuarioId: usuario.id } };
    if (!(esPersonal(usuario) && query.incluirBajas === 'true')) where.eliminadoEn = null;
    if (q) {
      const m = q.replace(/[\s-]/g, '').toUpperCase();
      where.OR = [
        { matricula: { contains: m } },
        { marca: { contains: q, mode: 'insensitive' } },
        { modelo: { contains: q, mode: 'insensitive' } },
        { cliente: { usuario: { nombre: { contains: q, mode: 'insensitive' } } } },
        { cliente: { razonSocial: { contains: q, mode: 'insensitive' } } },
      ];
    }
    const datos = await prisma.vehiculo.findMany({ where, include: incluir, orderBy: { matricula: 'asc' }, take: 200 });
    return { datos: datos.map(aVehiculo) };
  },
});

definir({
  metodo: 'post',
  ruta: '/vehiculos',
  etiqueta: 'Vehículos',
  resumen: 'Registrar un vehículo',
  acceso: ['CLIENTE'],
  idempotente: true,
  cuerpo: VehiculoEntrada,
  respuesta: VehiculoSchema,
  codigo: 201,
  errores: { 409: 'Matrícula o bastidor ya registrados', 422: 'Perfil incompleto' },
  manejador: async ({ usuario, cuerpo }) => {
    const cliente = await clienteDe(usuario);
    // Si el cliente vuelve a registrar un vehículo que dio de baja, se recupera con su historial.
    const deBaja = await prisma.vehiculo.findFirst({ where: { matricula: cuerpo.matricula, clienteId: cliente.id, eliminadoEn: { not: null } } });
    if (deBaja) {
      await comprobarUnicos(undefined, cuerpo.bastidor, deBaja.id);
      return aVehiculo(await prisma.vehiculo.update({ where: { id: deBaja.id }, data: { ...cuerpo, eliminadoEn: null }, include: incluir }));
    }
    await comprobarUnicos(cuerpo.matricula, cuerpo.bastidor);
    const v = await prisma.vehiculo.create({ data: { ...cuerpo, clienteId: cliente.id }, include: incluir });
    return aVehiculo(v);
  },
});

definir({
  metodo: 'get',
  ruta: '/vehiculos/:id',
  etiqueta: 'Vehículos',
  resumen: 'Ver un vehículo',
  params: ParamId,
  respuesta: VehiculoSchema,
  errores: { 404: 'No existe o no es tuyo' },
  manejador: async ({ usuario, params }) => aVehiculo(await vehiculoAccesible(usuario, params.id)),
});

definir({
  metodo: 'patch',
  ruta: '/vehiculos/:id',
  etiqueta: 'Vehículos',
  resumen: 'Editar un vehículo',
  descripcion: 'La matrícula no se cambia. Los kilómetros no pueden bajar.',
  acceso: ['CLIENTE', 'JEFE'],
  params: ParamId,
  cuerpo: VehiculoEntrada.omit({ matricula: true }).partial().strict(),
  respuesta: VehiculoSchema,
  errores: { 404: 'No existe o no es tuyo', 409: 'Bastidor ya registrado', 422: 'Los kilómetros no pueden bajar' },
  manejador: async ({ usuario, params, cuerpo }) => {
    const v = await vehiculoAccesible(usuario, params.id);
    if (cuerpo.kilometros !== undefined && v.kilometros !== null && cuerpo.kilometros < v.kilometros) {
      throw reglaNegocio('KM_MENOR', `Los kilómetros no pueden ser menos que los registrados (${v.kilometros})`);
    }
    await comprobarUnicos(undefined, cuerpo.bastidor, v.id);
    return aVehiculo(await prisma.vehiculo.update({ where: { id: v.id }, data: cuerpo, include: incluir }));
  },
});

definir({
  metodo: 'delete',
  ruta: '/vehiculos/:id',
  etiqueta: 'Vehículos',
  resumen: 'Eliminar un vehículo (con constancia)',
  descripcion:
    'Siempre deja una copia en las constancias de eliminación. Sin historial, se borra. Con citas u órdenes pasadas, se da de baja (deja de aparecer y no se puede reservar) para no dejar registros huérfanos. Con una cita activa o en el taller no se puede.',
  acceso: ['CLIENTE', 'JEFE'],
  params: ParamId,
  cuerpo: z.object({ motivo: z.string().trim().max(300).optional() }).strict(),
  codigo: 204,
  errores: { 404: 'No existe o no es tuyo', 409: 'VEHICULO_EN_USO' },
  manejador: async ({ usuario, params, cuerpo }) => {
    const v = await vehiculoAccesible(usuario, params.id);
    await transaccion(async (tx) => {
      const enUso =
        (await tx.cita.count({ where: { vehiculoId: v.id, estado: { in: ['PENDIENTE', 'CONFIRMADA'] } } })) +
        (await tx.orden.count({ where: { vehiculoId: v.id, estado: { not: 'ENTREGADA' } } })) +
        (await tx.reservaMultipleVehiculo.count({ where: { vehiculoId: v.id, reserva: { estado: { in: ['EN_ESPERA', 'HUECO_OFRECIDO'] } } } }));
      if (enUso) throw conflicto('VEHICULO_EN_USO', 'Este vehículo tiene una cita o una reparación en curso. Cancélala o espera a recogerlo');
      const conHistorial = (await tx.cita.count({ where: { vehiculoId: v.id } })) + (await tx.reservaMultipleVehiculo.count({ where: { vehiculoId: v.id } }));
      const { cliente: _c, ordenes: _o, ...copia } = v;
      await dejarConstancia(tx, 'Vehiculo', copia, conHistorial ? 'BAJA' : 'BORRADO', usuario.id, cuerpo.motivo);
      if (conHistorial) await tx.vehiculo.update({ where: { id: v.id }, data: { eliminadoEn: reloj.ahora() } });
      else await tx.vehiculo.delete({ where: { id: v.id } });
    });
  },
});

const HistorialSchema = z
  .object({
    vehiculo: VehiculoSchema,
    ordenes: z.array(
      z.object({
        id: Id,
        numero: z.number().int(),
        estado: z.string(),
        abiertaEn: Instante,
        completadaEn: Instante.nullable(),
        kmEntrada: z.number().int(),
        trabajos: z.array(
          z.object({
            descripcion: z.string(),
            estado: z.enum(['PENDIENTE', 'ACEPTADA', 'RECHAZADA']),
            importeEstimadoCentimos: Centimos,
            piezasUsadas: z.array(z.object({ referencia: z.string(), nombre: z.string(), cantidad: z.number().int(), fecha: Instante, mecanico: z.string() })),
            piezasQuitadas: z.array(z.object({ descripcion: z.string(), cantidad: z.number().int(), destino: z.string(), fecha: Instante, mecanico: z.string() })),
          }),
        ),
      }),
    ),
  })
  .openapi('HistorialVehiculo');

definir({
  metodo: 'get',
  ruta: '/vehiculos/:id/historial',
  etiqueta: 'Vehículos',
  resumen: 'Historial y trazabilidad de piezas',
  descripcion: 'Todas las órdenes del vehículo con sus trabajos, las piezas puestas y las retiradas (y su destino), con fecha y mecánico.',
  params: ParamId,
  respuesta: HistorialSchema,
  errores: { 404: 'No existe o no es tuyo' },
  manejador: async ({ usuario, params }) => {
    const v = await vehiculoAccesible(usuario, params.id);
    const mec = { include: { empleado: { include: { usuario: true } } } } as const;
    const ordenes = await prisma.orden.findMany({
      where: { vehiculoId: v.id },
      orderBy: { abiertaEn: 'desc' },
      include: {
        solicitudes: {
          orderBy: { creadaEn: 'asc' },
          include: { partidas: { include: { piezasUsadas: { include: { pieza: true, empleado: { include: { usuario: true } } } }, piezasQuitadas: mec } } },
        },
      },
    });
    return {
      vehiculo: aVehiculo(v),
      ordenes: ordenes.map((o) => ({
        id: o.id,
        numero: o.numero,
        estado: o.estado,
        abiertaEn: o.abiertaEn,
        completadaEn: o.completadaEn,
        kmEntrada: o.kmEntrada,
        trabajos: o.solicitudes.flatMap((s) =>
          s.partidas.map((p) => ({
            descripcion: p.descripcion,
            estado: p.estado,
            importeEstimadoCentimos: p.importeEstimadoCentimos,
            piezasUsadas: p.piezasUsadas.map((u) => ({ referencia: u.pieza.referencia, nombre: u.pieza.nombre, cantidad: u.cantidad, fecha: u.fecha, mecanico: u.empleado.usuario.nombre })),
            piezasQuitadas: p.piezasQuitadas.map((q) => ({ descripcion: q.descripcion, cantidad: q.cantidad, destino: q.destino, fecha: q.fecha, mecanico: q.empleado.usuario.nombre })),
          })),
        ),
      })),
    };
  },
});
