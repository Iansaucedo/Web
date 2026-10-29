-- CreateEnum
CREATE TYPE "TipoMovimientoStock" AS ENUM ('ALTA', 'AJUSTE', 'CUADRE', 'USO', 'RECEPCION');

-- CreateTable
CREATE TABLE "MovimientoStock" (
    "id" TEXT NOT NULL,
    "piezaId" TEXT NOT NULL,
    "tipo" "TipoMovimientoStock" NOT NULL,
    "delta" INTEGER NOT NULL,
    "stockAntes" INTEGER NOT NULL,
    "stockDespues" INTEGER NOT NULL,
    "motivo" TEXT,
    "usuarioId" TEXT NOT NULL,
    "ordenId" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimientoStock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MovimientoStock_piezaId_fecha_idx" ON "MovimientoStock"("piezaId", "fecha");

-- AddForeignKey
ALTER TABLE "MovimientoStock" ADD CONSTRAINT "MovimientoStock_piezaId_fkey" FOREIGN KEY ("piezaId") REFERENCES "Pieza"("id") ON DELETE CASCADE ON UPDATE CASCADE;
