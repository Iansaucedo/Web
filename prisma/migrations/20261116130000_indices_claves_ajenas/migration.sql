-- CreateIndex
CREATE INDEX "Cita_vehiculoId_idx" ON "Cita"("vehiculoId");

-- CreateIndex
CREATE INDEX "Cita_clienteId_idx" ON "Cita"("clienteId");

-- CreateIndex
CREATE INDEX "Notificacion_usuarioId_creadaEn_idx" ON "Notificacion"("usuarioId", "creadaEn");

-- CreateIndex
CREATE INDEX "Orden_vehiculoId_idx" ON "Orden"("vehiculoId");

-- CreateIndex
CREATE INDEX "Vehiculo_clienteId_idx" ON "Vehiculo"("clienteId");

