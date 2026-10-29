// Tipos de las respuestas de la API (ver /api/docs).
export type Rol = 'CLIENTE' | 'MECANICO' | 'JEFE' | 'DUENO';

export interface Usuario {
  id: string;
  email: string;
  nombre: string;
  rol: Rol;
  activo: boolean;
  cliente: { id: string; tipo: 'INDIVIDUAL' | 'EMPRESA'; telefono: string; razonSocial: string | null; nif: string | null } | null;
  empleadoId: string | null;
  /** El cliente se dio de baja: solo puede recuperar la cuenta o salir hasta `hasta`. */
  enBaja: { desde: string; hasta: string } | null;
}

export interface Vehiculo {
  id: string;
  matricula: string;
  marca: string;
  modelo: string;
  anio: number | null;
  combustible: string | null;
  kilometros: number | null;
  bastidor: string | null;
  cliente: { id: string; nombre: string; tipo: string; razonSocial: string | null };
  enTaller: boolean;
}

export type EstadoCita = 'PENDIENTE' | 'CONFIRMADA' | 'RECIBIDA' | 'CANCELADA' | 'NO_PRESENTADO';
export interface Cita {
  id: string;
  estado: EstadoCita;
  inicio: string;
  fin: string;
  fecha: string;
  hora: string;
  descripcionProblema: string;
  vehiculo: { id: string; matricula: string; marca: string; modelo: string };
  cliente: { id: string; nombre: string; telefono: string; razonSocial: string | null };
  ordenId: string | null;
  reservaMultipleId: string | null;
  puedeCambiar: boolean;
}

export interface DiaDisponible {
  fecha: string;
  laborable: boolean;
  capacidad: number;
  ocupadas: number;
  lleno: boolean;
  franjas: { inicio: string; hora: string; libres: number }[];
}

export type EstadoOrden = 'EN_DIAGNOSTICO' | 'ESPERANDO_AUTORIZACION' | 'EN_REPARACION' | 'ESPERANDO_PIEZAS' | 'COMPLETADA' | 'RECHAZADA' | 'ENTREGADA';
export interface OrdenResumen {
  id: string;
  numero: number;
  codigo: string;
  estado: EstadoOrden;
  abiertaEn: string;
  completadaEn: string | null;
  entregaEstimada: string | null;
  kmEntrada: number;
  kmSalida: number | null;
  vehiculo: { id: string; matricula: string; marca: string; modelo: string };
  cliente: { id: string; nombre: string; telefono: string };
  puesto: { id: string; nombre: string } | null;
}

export interface Partida {
  id: string;
  descripcion: string;
  horasEstimadas: number;
  importeEstimadoCentimos: number;
  estado: 'PENDIENTE' | 'ACEPTADA' | 'RECHAZADA';
  respondidaEn: string | null;
  terminadaEn: string | null;
  minutosRegistrados: number;
  piezasUsadas: { id: string; pieza: string; referencia: string; cantidad: number; precioUnitarioCentimos: number; mecanico: string; fecha: string }[];
  piezasQuitadas: { id: string; descripcion: string; cantidad: number; destino: 'DESECHADA' | 'DEVUELTA_CLIENTE'; fecha: string }[];
  pedidos: { id: string; pieza: string; cantidad: number; estado: string }[];
  fotos: { id: string; url: string; descripcion: string | null }[];
}

export interface Solicitud {
  id: string;
  estado: 'PENDIENTE' | 'RESPONDIDA';
  creadaEn: string;
  respondidaEn: string | null;
  comentarioCliente: string | null;
  creadaPor: string;
  partidas: Partida[];
}

export interface Importe {
  base: number;
  iva: number;
  total: number;
}

export interface OrdenDetalle extends OrdenResumen {
  diagnostico: string | null;
  notasRecepcion: string | null;
  descripcionProblema: string;
  solicitudes: Solicitud[];
  presupuesto: Importe;
  factura: (Importe & { lineas: { concepto: string; cantidad: number; precioUnitarioCentimos: number; importeCentimos: number }[] }) | null;
  observaciones: { id: string; texto: string; interna: boolean; autor: string; fecha: string }[];
  eventos: { id: string; tipo: string; payload: Record<string, unknown>; actor: string; fecha: string }[];
  motivoNoCompletable: string | null;
}

export interface Pieza {
  id: string;
  referencia: string;
  nombre: string;
  categoria: string;
  stockMinimo: number;
  precioCentimos: number;
  stock: number;
  activa: boolean;
  stockBajo: boolean;
}

export interface Pedido {
  id: string;
  estado: 'PENDIENTE' | 'APROBADO' | 'PEDIDO' | 'RECIBIDO' | 'RECHAZADO';
  pieza: { id: string; referencia: string; nombre: string } | null;
  descripcionLibre: string | null;
  cantidad: number;
  orden: { id: string; codigo: string; matricula: string };
  trabajo: string;
  mecanico: string;
  creadoEn: string;
  actualizadoEn: string;
}

export type TipoFichaje = 'ENTRADA' | 'INICIO_PAUSA' | 'FIN_PAUSA' | 'SALIDA';
export interface Fichaje {
  id: string;
  tipo: TipoFichaje;
  momento: string;
  hora: string;
  origen: string;
  corregido: boolean;
  motivo: string | null;
}
export interface Resumen {
  minutosTrabajados: number;
  minutosPausa: number;
  completa: boolean;
}
export interface Jornada extends Resumen {
  empleadoId: string;
  nombre: string;
  fecha: string;
  entrada: string | null;
  salida: string | null;
  corregida: boolean;
  fichajes: Fichaje[];
}
export interface Correccion {
  id: string;
  empleadoId: string;
  empleado: string;
  fecha: string;
  tipo: TipoFichaje;
  hora: string;
  motivo: string;
  estado: 'PENDIENTE' | 'ACEPTADA' | 'RECHAZADA';
  creadaEn: string;
}

export interface Puesto {
  id: string;
  nombre: string;
  activo: boolean;
  ocupadoPor: { ordenId: string; codigo: string; matricula: string; estado: EstadoOrden } | null;
  mecanicoHoy: { empleadoId: string; nombre: string } | null;
}
export type TipoAusencia = 'VACACIONES' | 'BAJA_MEDICA' | 'PERSONAL' | 'OTRA';

export interface Mecanico {
  empleadoId: string;
  usuarioId: string;
  nombre: string;
  email: string;
  rol: Rol;
  activo: boolean;
  ausenteHoy: boolean;
  puestosHoy: string[];
}

export interface ReservaMultiple {
  id: string;
  estado: 'EN_ESPERA' | 'HUECO_OFRECIDO' | 'CONVERTIDA' | 'CANCELADA';
  codigo: string;
  fechasPreferidas: string[];
  fechaOfrecida: string | null;
  franjasOfrecidas: string[];
  convertidaEn: string | null;
  cliente: { id: string; nombre: string; telefono: string };
  vehiculos: { id: string; matricula: string; marca: string; modelo: string }[];
  creadaEn: string;
}

export interface Notificacion {
  id: string;
  tipo: string;
  mensaje: string;
  enlace: string | null;
  leida: boolean;
  creadaEn: string;
}

export interface Config {
  zonaHoraria: string;
  aperturaMinutos: number;
  cierreMinutos: number;
  diasLaborables: number[];
  minutosFranja: number;
  recepcionesPorFranja: number;
  vehiculosPorMecanico: number;
  tarifaHoraCentimos: number;
  ivaPorcentaje: number;
  horasMinimasCancelar: number;
  jornadaMinutosDia: number;
}

export interface Lista<T> {
  datos: T[];
}

export interface MovimientoStock {
  id: string;
  tipo: 'ALTA' | 'AJUSTE' | 'CUADRE' | 'USO' | 'RECEPCION';
  delta: number;
  stockAntes: number;
  stockDespues: number;
  motivo: string | null;
  usuario: string;
  ordenCodigo: string | null;
  fecha: string;
}
