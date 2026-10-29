-- CreateEnum
CREATE TYPE "TipoAusencia" AS ENUM ('VACACIONES', 'BAJA_MEDICA', 'PERSONAL', 'OTRA');

-- AlterTable
ALTER TABLE "Ausencia" ADD COLUMN     "nota" TEXT,
ADD COLUMN     "tipo" "TipoAusencia" NOT NULL DEFAULT 'OTRA';
