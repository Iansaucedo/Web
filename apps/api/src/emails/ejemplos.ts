import type { NombrePlantilla } from './plantillas';

/**
 * Datos de ejemplo de cada email. Los usan el test de plantillas, la vista previa
 * (`npm run emails:preview -w api`) y el diseño de Figma, para que los tres muestren lo mismo.
 */
const web = 'http://localhost:3000';
const golf = { marca: 'Volkswagen', modelo: 'Golf', matricula: '1234 KLM' };

export const datosEjemplo: Record<NombrePlantilla, Record<string, unknown>> = {
  BIENVENIDA: { nombre: 'Ana', enlace: `${web}/reservar` },
  CITA_SOLICITADA: { nombre: 'Ana', ...golf, fecha: 'martes, 10 de noviembre', hora: '09:30', problema: 'Ruido al frenar y testigo de ABS encendido', horasCancelar: 24, enlace: `${web}/ordenes` },
  CITA_NUEVA_TALLER: { nombre: 'Marta', cliente: 'Ana García', ...golf, fecha: 'martes, 10 de noviembre', hora: '09:30', problema: 'Ruido al frenar y testigo de ABS encendido', enlace: `${web}/jefe/citas` },
  CITA_CONFIRMADA: { nombre: 'Ana', ...golf, fecha: 'martes, 10 de noviembre', hora: '09:30', horasCancelar: 24, enlace: `${web}/ordenes` },
  RECORDATORIO_CITA: { nombre: 'Ana', marca: 'Volkswagen', modelo: 'Golf', matricula: '1234 ABC', fecha: 'miércoles, 11 de noviembre', hora: '10:00', problema: 'Ruido al frenar', enlace: `${web}/ordenes` },
  CITA_MODIFICADA: { nombre: 'Ana', ...golf, antes: 'martes, 10 de noviembre, 09:30', fecha: 'jueves, 12 de noviembre', hora: '11:00', enlace: `${web}/ordenes` },
  CITA_CANCELADA: { nombre: 'Ana', ...golf, fecha: 'martes, 10 de noviembre', hora: '09:30', porTaller: true, motivo: 'Falta de personal ese día', enlace: `${web}/reservar` },
  CITA_NO_PRESENTADO: { nombre: 'Ana', ...golf, fecha: 'martes, 10 de noviembre', hora: '09:30', enlace: `${web}/reservar` },
  VEHICULO_RECIBIDO: { nombre: 'Ana', ...golf, orden: 'OR-0042', km: '98.450', notas: 'Arañazo en la puerta trasera derecha', enlace: `${web}/ordenes/x` },
  SOLICITUD_AUTORIZACION: {
    nombre: 'Ana',
    ...golf,
    orden: 'OR-0042',
    partidas: [
      { descripcion: 'Cambiar pastillas de freno delanteras', importe: '96,00 €' },
      { descripcion: 'Sustituir sensor ABS delantero izquierdo', importe: '128,50 €' },
    ],
    base: '224,50 €',
    ivaPorcentaje: 21,
    iva: '47,15 €',
    total: '271,65 €',
    enlace: `${web}/ordenes/x`,
  },
  RESPUESTA_CLIENTE: {
    nombre: 'Luis',
    ...golf,
    orden: 'OR-0042',
    aceptadas: 1,
    rechazadas: 1,
    ordenRechazada: false,
    decisiones: [
      { descripcion: 'Cambiar pastillas de freno delanteras', decision: 'Aceptado' },
      { descripcion: 'Sustituir sensor ABS delantero izquierdo', decision: 'Rechazado' },
    ],
    comentario: 'El sensor lo miro en otro momento, gracias.',
    enlace: `${web}/mecanico/ordenes/x`,
  },
  ESPERANDO_PIEZAS: { nombre: 'Ana', ...golf, orden: 'OR-0042', entrega: 'viernes, 13 de noviembre', enlace: `${web}/ordenes/x` },
  REPARACION_REANUDADA: { nombre: 'Ana', ...golf, orden: 'OR-0042', enlace: `${web}/ordenes/x` },
  ENTREGA_ESTIMADA: { nombre: 'Ana', ...golf, orden: 'OR-0042', antes: 'jueves, 12 de noviembre, 18:00', entrega: 'viernes, 13 de noviembre, 13:00', enlace: `${web}/ordenes/x` },
  ORDEN_COMPLETADA: {
    nombre: 'Ana',
    ...golf,
    orden: 'OR-0042',
    lineas: [
      { concepto: 'Pastillas de freno delanteras (x1)', importe: '56,00 €' },
      { concepto: 'Mano de obra: cambiar pastillas (1 h)', importe: '40,00 €' },
    ],
    base: '96,00 €',
    ivaPorcentaje: 21,
    iva: '20,16 €',
    total: '116,16 €',
    enlace: `${web}/ordenes/x`,
  },
  ORDEN_RECHAZADA: { nombre: 'Ana', ...golf, orden: 'OR-0042', enlace: `${web}/ordenes/x` },
  VEHICULO_ENTREGADO: { nombre: 'Ana', ...golf, orden: 'OR-0042', fecha: 'viernes, 13 de noviembre, 17:40', enlace: `${web}/vehiculos` },
  RESERVA_MULTIPLE_RECIBIDA: { nombre: 'Flotas SL', numVehiculos: 3, vehiculos: '1234 KLM, 5678 MNP, 9012 RST', fechas: '16, 17 y 18 de noviembre', enlace: `${web}/reservas` },
  RESERVA_MULTIPLE_NUEVA: { nombre: 'Marta', cliente: 'Flotas SL', numVehiculos: 3, vehiculos: '1234 KLM, 5678 MNP, 9012 RST', fechas: '16, 17 y 18 de noviembre', enlace: `${web}/jefe/citas` },
  HUECO_OFRECIDO: { nombre: 'Flotas SL', fecha: 'martes, 17 de noviembre', franjas: '09:00, 09:30 y 10:00', numVehiculos: 3, vehiculos: '1234 KLM, 5678 MNP, 9012 RST', enlace: `${web}/reservas` },
  RESERVA_MULTIPLE_CONFIRMADA: {
    nombre: 'Flotas SL',
    fecha: 'martes, 17 de noviembre',
    numVehiculos: 3,
    citas: [
      { vehiculo: 'Ford Transit · 1234 KLM', hora: '08:00' },
      { vehiculo: 'Ford Transit · 5678 MNP', hora: '08:00' },
      { vehiculo: 'Renault Kangoo · 9012 RST', hora: '08:30' },
    ],
    enlace: `${web}/ordenes`,
  },
  PEDIDO_PENDIENTE: { nombre: 'Marta', mecanico: 'Luis Pérez', pieza: 'Sensor ABS delantero (REF 0265007896)', cantidad: 1, orden: 'OR-0042', matricula: '1234 KLM', partida: 'Sustituir sensor ABS', enlace: `${web}/jefe/pedidos` },
  PEDIDO_APROBADO: { nombre: 'Luis', pieza: 'Sensor ABS delantero', cantidad: 1, orden: 'OR-0042', enlace: `${web}/mecanico/ordenes/x` },
  PEDIDO_RECHAZADO: { nombre: 'Luis', pieza: 'Sensor ABS delantero', cantidad: 1, orden: 'OR-0042', motivo: 'Hay uno compatible en el almacén 2', enlace: `${web}/mecanico/ordenes/x` },
  PIEZA_RECIBIDA: { nombre: 'Luis', pieza: 'Sensor ABS delantero', cantidad: 1, orden: 'OR-0042', matricula: '1234 KLM', enlace: `${web}/mecanico/ordenes/x` },
  MECANICO_AUSENTE: { nombre: 'Marta', mecanico: 'Luis Pérez', tipo: 'baja médica', fecha: 'del martes, 10 de noviembre al viernes, 13 de noviembre', capacidad: 4, citas: 14, exceso: 2, enlace: `${web}/jefe/citas` },
  INVITACION: { rol: 'mecánico', invitadoPor: 'Marta Ruiz', email: 'luis@taller.es', enlace: `${web}/login` },
  CORRECCION_SOLICITADA: { nombre: 'Marta', empleado: 'Luis Pérez', fecha: 'lunes, 9 de noviembre', tipo: 'Salida', hora: '16:05', motivo: 'Se me olvidó fichar al salir', enlace: `${web}/jefe/jornadas` },
  CORRECCION_RESUELTA: { nombre: 'Luis', aceptada: true, fecha: 'lunes, 9 de noviembre', tipo: 'Salida', hora: '16:05', enlace: `${web}/mecanico/jornada` },
  BAJA_CUENTA: { nombre: 'Ana', hasta: 'lunes, 23 de noviembre', dias: 14, citasCanceladas: 1, enlace: `${web}/login` },
  FICHAJE_CORREGIDO: { nombre: 'Luis', fecha: 'lunes, 9 de noviembre', tipo: 'Entrada', antes: '08:17', ahora: '07:58', motivo: 'La tablet del taller no tenía conexión', jefe: 'Marta Ruiz', enlace: `${web}/mecanico/jornada` },
};
