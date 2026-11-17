-- La factura se calcula con la tarifa y el IVA del momento de completar la orden, no con los actuales.
ALTER TABLE "Orden" ADD COLUMN "tarifaHoraCentimos" INTEGER,
ADD COLUMN "ivaPorcentaje" INTEGER;

-- Órdenes ya facturadas: se congelan con la configuración vigente (la que se venía usando).
UPDATE "Orden" o
SET "tarifaHoraCentimos" = c."tarifaHoraCentimos", "ivaPorcentaje" = c."ivaPorcentaje"
FROM "ConfigTaller" c
WHERE c.id = 1 AND o.estado IN ('COMPLETADA', 'ENTREGADA');
