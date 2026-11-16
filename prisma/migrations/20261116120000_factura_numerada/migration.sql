-- Factura con numeración propia (F-2026-0001, correlativa por año) y copia congelada al emitirla.
ALTER TABLE "Orden" ADD COLUMN     "facturaCodigo" TEXT,
ADD COLUMN     "facturaDatos" JSONB,
ADD COLUMN     "facturaEmitidaEn" TIMESTAMP(3);

CREATE TABLE "ContadorFactura" (
    "anio" INTEGER NOT NULL,
    "ultimo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ContadorFactura_pkey" PRIMARY KEY ("anio")
);

CREATE UNIQUE INDEX "Orden_facturaCodigo_key" ON "Orden"("facturaCodigo");

-- Las órdenes ya completadas reciben su número por orden de fecha de completado, año a año (hora de Madrid).
-- Su copia congelada queda vacía: se siguen calculando como antes (con la tarifa y el IVA ya fijados en la orden).
WITH numeradas AS (
  SELECT id,
         EXTRACT(YEAR FROM ("completadaEn" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Madrid')::int AS anio,
         ROW_NUMBER() OVER (
           PARTITION BY EXTRACT(YEAR FROM ("completadaEn" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Madrid')
           ORDER BY "completadaEn", numero
         ) AS n
  FROM "Orden"
  WHERE "completadaEn" IS NOT NULL
)
UPDATE "Orden" o
SET "facturaCodigo" = 'F-' || numeradas.anio || '-' || LPAD(numeradas.n::text, GREATEST(4, LENGTH(numeradas.n::text)), '0'),
    "facturaEmitidaEn" = o."completadaEn"
FROM numeradas
WHERE o.id = numeradas.id;

INSERT INTO "ContadorFactura" ("anio", "ultimo")
SELECT EXTRACT(YEAR FROM ("completadaEn" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Madrid')::int, COUNT(*)
FROM "Orden"
WHERE "completadaEn" IS NOT NULL
GROUP BY 1;
