-- CreateEnum
CREATE TYPE "ModoEliminacion" AS ENUM ('BORRADO', 'BAJA');

-- AlterTable
ALTER TABLE "Vehiculo" ADD COLUMN     "eliminadoEn" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "RegistroEliminacion" (
    "id" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT NOT NULL,
    "modo" "ModoEliminacion" NOT NULL,
    "datos" JSONB NOT NULL,
    "motivo" TEXT,
    "usuarioId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistroEliminacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RegistroEliminacion_entidad_entidadId_idx" ON "RegistroEliminacion"("entidad", "entidadId");
