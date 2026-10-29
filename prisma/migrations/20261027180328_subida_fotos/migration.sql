-- DropForeignKey
ALTER TABLE "FotoTrabajo" DROP CONSTRAINT "FotoTrabajo_partidaId_fkey";

-- AlterTable
ALTER TABLE "FotoTrabajo" ADD COLUMN     "bytes" INTEGER,
ADD COLUMN     "datos" BYTEA,
ADD COLUMN     "tipoContenido" TEXT,
ALTER COLUMN "partidaId" DROP NOT NULL,
ALTER COLUMN "url" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "FotoTrabajo_partidaId_subidaEn_idx" ON "FotoTrabajo"("partidaId", "subidaEn");

-- AddForeignKey
ALTER TABLE "FotoTrabajo" ADD CONSTRAINT "FotoTrabajo_partidaId_fkey" FOREIGN KEY ("partidaId") REFERENCES "Partida"("id") ON DELETE SET NULL ON UPDATE CASCADE;
