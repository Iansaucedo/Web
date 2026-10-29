-- AlterEnum
ALTER TYPE "TipoEvento" ADD VALUE 'KM_CORREGIDOS';

-- AlterTable
ALTER TABLE "Orden" ADD COLUMN     "kmSalida" INTEGER;
