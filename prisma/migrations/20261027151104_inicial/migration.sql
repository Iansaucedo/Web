-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('CLIENTE', 'MECANICO', 'JEFE', 'DUENO');

-- CreateEnum
CREATE TYPE "TipoCliente" AS ENUM ('INDIVIDUAL', 'EMPRESA');

-- CreateEnum
CREATE TYPE "Combustible" AS ENUM ('GASOLINA', 'DIESEL', 'HIBRIDO', 'ELECTRICO', 'GLP');

-- CreateEnum
CREATE TYPE "EstadoCita" AS ENUM ('PENDIENTE', 'CONFIRMADA', 'RECIBIDA', 'CANCELADA', 'NO_PRESENTADO');

-- CreateEnum
CREATE TYPE "EstadoReservaMultiple" AS ENUM ('EN_ESPERA', 'HUECO_OFRECIDO', 'CONVERTIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "EstadoOrden" AS ENUM ('EN_DIAGNOSTICO', 'ESPERANDO_AUTORIZACION', 'EN_REPARACION', 'ESPERANDO_PIEZAS', 'COMPLETADA', 'RECHAZADA', 'ENTREGADA');

-- CreateEnum
CREATE TYPE "EstadoSolicitud" AS ENUM ('PENDIENTE', 'RESPONDIDA');

-- CreateEnum
CREATE TYPE "EstadoPartida" AS ENUM ('PENDIENTE', 'ACEPTADA', 'RECHAZADA');

-- CreateEnum
CREATE TYPE "DestinoPiezaQuitada" AS ENUM ('DESECHADA', 'DEVUELTA_CLIENTE');

-- CreateEnum
CREATE TYPE "EstadoPedido" AS ENUM ('PENDIENTE', 'APROBADO', 'PEDIDO', 'RECIBIDO', 'RECHAZADO');

-- CreateEnum
CREATE TYPE "TipoEvento" AS ENUM ('ESTADO_CAMBIADO', 'PUESTO_ASIGNADO', 'SOLICITUD_CREADA', 'PARTIDA_RESPONDIDA', 'TRABAJO_REGISTRADO', 'PIEZA_USADA', 'PIEZA_QUITADA', 'PEDIDO_ACTUALIZADO', 'OBSERVACION');

-- CreateEnum
CREATE TYPE "TipoFichaje" AS ENUM ('ENTRADA', 'INICIO_PAUSA', 'FIN_PAUSA', 'SALIDA');

-- CreateEnum
CREATE TYPE "EstadoSolicitudCorreccion" AS ENUM ('PENDIENTE', 'ACEPTADA', 'RECHAZADA');

-- CreateEnum
CREATE TYPE "EstadoEmail" AS ENUM ('PENDIENTE', 'ENVIADO', 'FALLIDO');

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "googleId" TEXT,
    "rol" "Rol" NOT NULL DEFAULT 'CLIENTE',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitacion" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "rol" "Rol" NOT NULL,
    "creadaPorId" TEXT NOT NULL,
    "usadaEn" TIMESTAMP(3),
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "tipo" "TipoCliente" NOT NULL,
    "telefono" TEXT NOT NULL,
    "razonSocial" TEXT,
    "nif" TEXT,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Empleado" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Empleado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehiculo" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "matricula" TEXT NOT NULL,
    "bastidor" TEXT,
    "marca" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "anio" INTEGER,
    "combustible" "Combustible",
    "kilometros" INTEGER,

    CONSTRAINT "Vehiculo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cita" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "vehiculoId" TEXT NOT NULL,
    "inicio" TIMESTAMPTZ NOT NULL,
    "fin" TIMESTAMPTZ NOT NULL,
    "estado" "EstadoCita" NOT NULL DEFAULT 'PENDIENTE',
    "descripcionProblema" TEXT NOT NULL,
    "reservaMultipleId" TEXT,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cita_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservaMultiple" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "fechasPreferidas" DATE[],
    "fechaOfrecida" DATE,
    "estado" "EstadoReservaMultiple" NOT NULL DEFAULT 'EN_ESPERA',
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReservaMultiple_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservaMultipleVehiculo" (
    "reservaId" TEXT NOT NULL,
    "vehiculoId" TEXT NOT NULL,

    CONSTRAINT "ReservaMultipleVehiculo_pkey" PRIMARY KEY ("reservaId","vehiculoId")
);

-- CreateTable
CREATE TABLE "Puesto" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Puesto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AsignacionPuesto" (
    "id" TEXT NOT NULL,
    "puestoId" TEXT NOT NULL,
    "empleadoId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,

    CONSTRAINT "AsignacionPuesto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ausencia" (
    "id" TEXT NOT NULL,
    "empleadoId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,

    CONSTRAINT "Ausencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OcupacionPuesto" (
    "id" TEXT NOT NULL,
    "puestoId" TEXT NOT NULL,
    "ordenId" TEXT NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fin" TIMESTAMP(3),

    CONSTRAINT "OcupacionPuesto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Orden" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "citaId" TEXT NOT NULL,
    "vehiculoId" TEXT NOT NULL,
    "puestoId" TEXT,
    "estado" "EstadoOrden" NOT NULL DEFAULT 'EN_DIAGNOSTICO',
    "diagnostico" TEXT,
    "kmEntrada" INTEGER NOT NULL,
    "entregaEstimada" TIMESTAMPTZ,
    "notasRecepcion" TEXT,
    "abiertaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completadaEn" TIMESTAMP(3),

    CONSTRAINT "Orden_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SolicitudAutorizacion" (
    "id" TEXT NOT NULL,
    "ordenId" TEXT NOT NULL,
    "creadaPorId" TEXT NOT NULL,
    "estado" "EstadoSolicitud" NOT NULL DEFAULT 'PENDIENTE',
    "respondidaEn" TIMESTAMP(3),
    "comentarioCliente" TEXT,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SolicitudAutorizacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Partida" (
    "id" TEXT NOT NULL,
    "solicitudId" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "horasEstimadas" DECIMAL(5,2) NOT NULL,
    "importeEstimadoCentimos" INTEGER NOT NULL,
    "estado" "EstadoPartida" NOT NULL DEFAULT 'PENDIENTE',
    "respondidaEn" TIMESTAMP(3),
    "terminadaEn" TIMESTAMP(3),

    CONSTRAINT "Partida_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FotoTrabajo" (
    "id" TEXT NOT NULL,
    "partidaId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "descripcion" TEXT,
    "subidaPorId" TEXT NOT NULL,
    "subidaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FotoTrabajo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pieza" (
    "id" TEXT NOT NULL,
    "referencia" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "precioCentimos" INTEGER NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Pieza_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PiezaUsada" (
    "id" TEXT NOT NULL,
    "partidaId" TEXT NOT NULL,
    "piezaId" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precioUnitarioCentimos" INTEGER NOT NULL,
    "empleadoId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PiezaUsada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PiezaQuitada" (
    "id" TEXT NOT NULL,
    "partidaId" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "destino" "DestinoPiezaQuitada" NOT NULL,
    "empleadoId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PiezaQuitada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PedidoPieza" (
    "id" TEXT NOT NULL,
    "partidaId" TEXT NOT NULL,
    "piezaId" TEXT,
    "descripcionLibre" TEXT,
    "cantidad" INTEGER NOT NULL,
    "estado" "EstadoPedido" NOT NULL DEFAULT 'PENDIENTE',
    "creadoPorId" TEXT NOT NULL,
    "aprobadoPorId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PedidoPieza_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistroTrabajo" (
    "id" TEXT NOT NULL,
    "ordenId" TEXT NOT NULL,
    "partidaId" TEXT NOT NULL,
    "empleadoId" TEXT NOT NULL,
    "minutos" INTEGER NOT NULL,
    "descripcion" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistroTrabajo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Observacion" (
    "id" TEXT NOT NULL,
    "ordenId" TEXT NOT NULL,
    "empleadoId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "interna" BOOLEAN NOT NULL DEFAULT false,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Observacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventoOrden" (
    "id" TEXT NOT NULL,
    "ordenId" TEXT NOT NULL,
    "tipo" "TipoEvento" NOT NULL,
    "actorId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "visibleCliente" BOOLEAN NOT NULL DEFAULT true,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventoOrden_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fichaje" (
    "id" TEXT NOT NULL,
    "empleadoId" TEXT NOT NULL,
    "tipo" "TipoFichaje" NOT NULL,
    "momento" TIMESTAMPTZ NOT NULL,
    "origen" TEXT NOT NULL,
    "sustituyeAId" TEXT,
    "corregidoPorId" TEXT,
    "motivo" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Fichaje_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SolicitudCorreccionFichaje" (
    "id" TEXT NOT NULL,
    "empleadoId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "tipo" "TipoFichaje" NOT NULL,
    "horaPedida" TIMESTAMPTZ NOT NULL,
    "motivo" TEXT NOT NULL,
    "estado" "EstadoSolicitudCorreccion" NOT NULL DEFAULT 'PENDIENTE',
    "resueltaPor" TEXT,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SolicitudCorreccionFichaje_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notificacion" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "enlace" TEXT,
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigTaller" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "zonaHoraria" TEXT NOT NULL DEFAULT 'Europe/Madrid',
    "aperturaMinutos" INTEGER NOT NULL DEFAULT 480,
    "cierreMinutos" INTEGER NOT NULL DEFAULT 1080,
    "diasLaborables" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
    "minutosFranja" INTEGER NOT NULL DEFAULT 30,
    "recepcionesPorFranja" INTEGER NOT NULL DEFAULT 2,
    "vehiculosPorMecanico" INTEGER NOT NULL DEFAULT 2,
    "tarifaHoraCentimos" INTEGER NOT NULL DEFAULT 4000,
    "ivaPorcentaje" INTEGER NOT NULL DEFAULT 21,
    "horasMinimasCancelar" INTEGER NOT NULL DEFAULT 24,
    "jornadaMinutosDia" INTEGER NOT NULL DEFAULT 480,

    CONSTRAINT "ConfigTaller_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailSaliente" (
    "id" TEXT NOT NULL,
    "para" TEXT NOT NULL,
    "plantilla" TEXT NOT NULL,
    "datos" JSONB NOT NULL,
    "adjuntoFacturaOrdenId" TEXT,
    "estado" "EstadoEmail" NOT NULL DEFAULT 'PENDIENTE',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "proximoIntento" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimoError" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviadoEn" TIMESTAMP(3),

    CONSTRAINT "EmailSaliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaveIdempotencia" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "metodo" TEXT NOT NULL,
    "ruta" TEXT NOT NULL,
    "hashCuerpo" TEXT NOT NULL,
    "codigo" INTEGER,
    "respuesta" JSONB,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaveIdempotencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_googleId_key" ON "Usuario"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitacion_email_key" ON "Invitacion"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_usuarioId_key" ON "Cliente"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "Empleado_usuarioId_key" ON "Empleado"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "Vehiculo_matricula_key" ON "Vehiculo"("matricula");

-- CreateIndex
CREATE UNIQUE INDEX "Vehiculo_bastidor_key" ON "Vehiculo"("bastidor");

-- CreateIndex
CREATE INDEX "Cita_inicio_estado_idx" ON "Cita"("inicio", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "Puesto_nombre_key" ON "Puesto"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "AsignacionPuesto_puestoId_fecha_key" ON "AsignacionPuesto"("puestoId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "Ausencia_empleadoId_fecha_key" ON "Ausencia"("empleadoId", "fecha");

-- CreateIndex
CREATE INDEX "OcupacionPuesto_puestoId_inicio_idx" ON "OcupacionPuesto"("puestoId", "inicio");

-- CreateIndex
CREATE UNIQUE INDEX "Orden_numero_key" ON "Orden"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "Orden_citaId_key" ON "Orden"("citaId");

-- CreateIndex
CREATE INDEX "Orden_estado_idx" ON "Orden"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "Pieza_referencia_key" ON "Pieza"("referencia");

-- CreateIndex
CREATE INDEX "EventoOrden_ordenId_fecha_idx" ON "EventoOrden"("ordenId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "Fichaje_sustituyeAId_key" ON "Fichaje"("sustituyeAId");

-- CreateIndex
CREATE INDEX "Fichaje_empleadoId_momento_idx" ON "Fichaje"("empleadoId", "momento");

-- CreateIndex
CREATE INDEX "Notificacion_usuarioId_leida_idx" ON "Notificacion"("usuarioId", "leida");

-- CreateIndex
CREATE INDEX "EmailSaliente_estado_proximoIntento_idx" ON "EmailSaliente"("estado", "proximoIntento");

-- CreateIndex
CREATE UNIQUE INDEX "ClaveIdempotencia_usuarioId_clave_key" ON "ClaveIdempotencia"("usuarioId", "clave");

-- AddForeignKey
ALTER TABLE "Invitacion" ADD CONSTRAINT "Invitacion_creadaPorId_fkey" FOREIGN KEY ("creadaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Empleado" ADD CONSTRAINT "Empleado_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehiculo" ADD CONSTRAINT "Vehiculo_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cita" ADD CONSTRAINT "Cita_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cita" ADD CONSTRAINT "Cita_vehiculoId_fkey" FOREIGN KEY ("vehiculoId") REFERENCES "Vehiculo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cita" ADD CONSTRAINT "Cita_reservaMultipleId_fkey" FOREIGN KEY ("reservaMultipleId") REFERENCES "ReservaMultiple"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservaMultiple" ADD CONSTRAINT "ReservaMultiple_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservaMultipleVehiculo" ADD CONSTRAINT "ReservaMultipleVehiculo_reservaId_fkey" FOREIGN KEY ("reservaId") REFERENCES "ReservaMultiple"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservaMultipleVehiculo" ADD CONSTRAINT "ReservaMultipleVehiculo_vehiculoId_fkey" FOREIGN KEY ("vehiculoId") REFERENCES "Vehiculo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsignacionPuesto" ADD CONSTRAINT "AsignacionPuesto_puestoId_fkey" FOREIGN KEY ("puestoId") REFERENCES "Puesto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsignacionPuesto" ADD CONSTRAINT "AsignacionPuesto_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "Empleado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ausencia" ADD CONSTRAINT "Ausencia_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "Empleado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OcupacionPuesto" ADD CONSTRAINT "OcupacionPuesto_puestoId_fkey" FOREIGN KEY ("puestoId") REFERENCES "Puesto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OcupacionPuesto" ADD CONSTRAINT "OcupacionPuesto_ordenId_fkey" FOREIGN KEY ("ordenId") REFERENCES "Orden"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orden" ADD CONSTRAINT "Orden_citaId_fkey" FOREIGN KEY ("citaId") REFERENCES "Cita"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orden" ADD CONSTRAINT "Orden_vehiculoId_fkey" FOREIGN KEY ("vehiculoId") REFERENCES "Vehiculo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orden" ADD CONSTRAINT "Orden_puestoId_fkey" FOREIGN KEY ("puestoId") REFERENCES "Puesto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitudAutorizacion" ADD CONSTRAINT "SolicitudAutorizacion_ordenId_fkey" FOREIGN KEY ("ordenId") REFERENCES "Orden"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitudAutorizacion" ADD CONSTRAINT "SolicitudAutorizacion_creadaPorId_fkey" FOREIGN KEY ("creadaPorId") REFERENCES "Empleado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Partida" ADD CONSTRAINT "Partida_solicitudId_fkey" FOREIGN KEY ("solicitudId") REFERENCES "SolicitudAutorizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FotoTrabajo" ADD CONSTRAINT "FotoTrabajo_partidaId_fkey" FOREIGN KEY ("partidaId") REFERENCES "Partida"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PiezaUsada" ADD CONSTRAINT "PiezaUsada_partidaId_fkey" FOREIGN KEY ("partidaId") REFERENCES "Partida"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PiezaUsada" ADD CONSTRAINT "PiezaUsada_piezaId_fkey" FOREIGN KEY ("piezaId") REFERENCES "Pieza"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PiezaUsada" ADD CONSTRAINT "PiezaUsada_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "Empleado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PiezaQuitada" ADD CONSTRAINT "PiezaQuitada_partidaId_fkey" FOREIGN KEY ("partidaId") REFERENCES "Partida"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PiezaQuitada" ADD CONSTRAINT "PiezaQuitada_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "Empleado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoPieza" ADD CONSTRAINT "PedidoPieza_partidaId_fkey" FOREIGN KEY ("partidaId") REFERENCES "Partida"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoPieza" ADD CONSTRAINT "PedidoPieza_piezaId_fkey" FOREIGN KEY ("piezaId") REFERENCES "Pieza"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoPieza" ADD CONSTRAINT "PedidoPieza_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "Empleado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoPieza" ADD CONSTRAINT "PedidoPieza_aprobadoPorId_fkey" FOREIGN KEY ("aprobadoPorId") REFERENCES "Empleado"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroTrabajo" ADD CONSTRAINT "RegistroTrabajo_ordenId_fkey" FOREIGN KEY ("ordenId") REFERENCES "Orden"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroTrabajo" ADD CONSTRAINT "RegistroTrabajo_partidaId_fkey" FOREIGN KEY ("partidaId") REFERENCES "Partida"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroTrabajo" ADD CONSTRAINT "RegistroTrabajo_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "Empleado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observacion" ADD CONSTRAINT "Observacion_ordenId_fkey" FOREIGN KEY ("ordenId") REFERENCES "Orden"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observacion" ADD CONSTRAINT "Observacion_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "Empleado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoOrden" ADD CONSTRAINT "EventoOrden_ordenId_fkey" FOREIGN KEY ("ordenId") REFERENCES "Orden"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoOrden" ADD CONSTRAINT "EventoOrden_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fichaje" ADD CONSTRAINT "Fichaje_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "Empleado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fichaje" ADD CONSTRAINT "Fichaje_sustituyeAId_fkey" FOREIGN KEY ("sustituyeAId") REFERENCES "Fichaje"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fichaje" ADD CONSTRAINT "Fichaje_corregidoPorId_fkey" FOREIGN KEY ("corregidoPorId") REFERENCES "Empleado"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notificacion" ADD CONSTRAINT "Notificacion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
