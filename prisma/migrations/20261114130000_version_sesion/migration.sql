-- Cerrar sesión invalida en el servidor los tokens ya emitidos (antes solo se borraba la cookie).
ALTER TABLE "Usuario" ADD COLUMN "versionSesion" INTEGER NOT NULL DEFAULT 0;
