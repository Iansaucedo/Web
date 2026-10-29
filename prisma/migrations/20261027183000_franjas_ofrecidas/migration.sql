-- AlterTable
ALTER TABLE "ReservaMultiple" ADD COLUMN     "convertidaEn" TIMESTAMP(3),
ADD COLUMN     "franjasOfrecidas" TIMESTAMPTZ[],
ADD COLUMN     "numero" SERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ReservaMultiple_numero_key" ON "ReservaMultiple"("numero");

