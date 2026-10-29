# Taller

Sistema de gestión de un taller de coches: citas, órdenes de reparación, piezas, mecánicos, puestos y estadísticas.
El diseño completo está en el documento de diseño (PDF) y los diagramas en `docs/diagramas/`.

## Stack

- **Frontend:** Next.js + TypeScript (`apps/web`), que reenvía `/api/*` a Express.
- **API:** Express + TypeScript (`apps/api`), con login de Google mediante Passport y JWT en cookie `httpOnly`.
- **Datos:** PostgreSQL + Prisma (`prisma/`).
- **Tests:** Vitest (unitarios), Supertest (integración) y Playwright (E2E, en `e2e/`).

## Qué hay en el repositorio

| Ruta | Qué es |
| --- | --- |
| `prisma/` | Modelo de datos y migraciones (incluye la bandeja de salida de emails y las claves de idempotencia) |
| `apps/api/src/modulos/` | Rutas por área: citas, órdenes, piezas, personal, fichajes, estadísticas… Cada ruta se define con `definir()` |
| `apps/api/src/lib/ruta.ts` | Una sola definición por ruta: validación con zod, roles, idempotencia, Express y Swagger a la vez |
| `apps/api/src/domain/` | Reglas de negocio puras (estados, capacidad, importes, jornada, respuesta del cliente) |
| `apps/api/src/emails/` | Plantillas HTML de los 31 emails, maqueta común y cola de envío con reintentos |
| `apps/api/src/test/` | Tests de integración contra PostgreSQL real (Vitest + Supertest) |
| `apps/web/src/app/` | Pantallas de Next.js + MUI por rol, siguiendo los flujos de Figma |
| `e2e/` | Playwright: flujos completos, batería de QA y versión móvil |
| `docs/emails/` | Vista previa HTML de todos los emails (`index.html`) |

El diseño de las pantallas y de los emails está en Figma (páginas «Flujos», «Emails», etc.).

## Arrancar en local

```bash
npm install
cp .env.example .env              # rellenar GOOGLE_*, OWNER_EMAIL, JWT_SECRET (16+ caracteres) y SMTP_*
npm run db:up                     # PostgreSQL en Docker (o uno local)
npm run db:migrate && npm run db:seed
npm run dev:api                   # API en :4000
npm run dev:web                   # web en :3000
```

### Web en Docker

En vez de `npm run dev:web`, la web puede ir en un contenedor (la API y la base de datos siguen como arriba):

```bash
npm run web:up        # = docker compose up -d --build web → http://localhost:3000
```

- Imagen de producción de Next (`output: standalone`), con usuario sin privilegios y healthcheck. Dockerfile en `apps/web/Dockerfile`.
- Reenvía `/api/*` a la API del equipo (`http://host.docker.internal:4000`). Para otra API:
  `API_INTERNAL_URL=https://mi-api docker compose up -d --build web` (se fija al compilar, por eso `--build`).
- Detrás de un proxy corporativo, `docker build` necesita `--build-arg HTTPS_PROXY=…` y el certificado de la empresa para que `npm ci` descargue.

Entrad siempre por `http://localhost:3000`: el login y la cookie pasan por el reenvío de Next.
`API_INTERNAL_URL` se lee **al compilar** la web (`next build`), porque Next fija ahí las rewrites.

- **Swagger:** `http://localhost:4000/api/docs` (JSON en `/api/openapi.json`). Un test falla si alguna ruta queda sin documentar.
- **Emails:** `npm run emails:preview` regenera `docs/emails/`. Probar envío con `npm run email:test -- destino@ejemplo.com`. Sin `SMTP_HOST`, los emails se escriben en el log.

## Despliegue en Azure (CI/CD con GitHub Actions)

El proyecto incluye flujos de trabajo de **GitHub Actions** para compilar, migrar la base de datos y desplegar la API y la Web en **Azure App Service**:
- Flujo principal: [`.github/workflows/deploy-azure.yml`](.github/workflows/deploy-azure.yml)
- Flujo con contenedores Docker: [`.github/workflows/deploy-azure-containers.yml`](.github/workflows/deploy-azure-containers.yml)
- Guía completa de configuración de recursos, secretos y servicio SMTP (SendGrid, Azure Communication Services, Office 365): [`docs/DESPLIEGUE_AZURE.md`](docs/DESPLIEGUE_AZURE.md).

## Tests

```bash
npm test          # 268 tests de API: dominio + integración contra la base de datos taller_test
npm run e2e       # 49 E2E con Playwright: flujos, QA, accesibilidad (axe) y móvil (base de datos taller_e2e)
npm run mutaciones  # rompe 27 reglas a propósito y comprueba que los tests fallan (docs/mutaciones.md)
```

Bases de datos necesarias: `taller_test` y `taller_e2e` (usuario `taller`), con las migraciones aplicadas
(`DATABASE_URL=... npx prisma migrate deploy`). En modo test existen `POST /api/auth/test-login` y
`/api/test/*` (reiniciar datos, fijar la hora, ver los emails); en producción no se montan.

## Fiabilidad

- **Carreras:** las operaciones que compiten por lo mismo (la última plaza de un día, la última pieza del almacén,
  responder un presupuesto, fichar) van en transacción con cerrojo de PostgreSQL o con actualización condicional.
  Hay tests que las lanzan en paralelo.
- **Doble envío:** las POST que crean algo aceptan `Idempotency-Key`; la web la manda y bloquea el botón mientras espera.
- **Emails:** se guardan en la misma transacción que el cambio y se envían después con reintentos (1, 2, 4… min).
  Si el SMTP cae, no se pierde ninguno.
- **Seguridad:** el rol se lee de la base de datos en cada petición (dar de baja corta la sesión al momento);
  un recurso ajeno da 404; las peticiones con cuerpo exigen JSON (CSRF); query estricta; límite de 100 KB; nunca se devuelven trazas.
- **Tareas periódicas:** envío de emails, recordatorio 24 h antes (cada 15 min), limpieza de fotos sin adjuntar y desvinculación de autobajas.
  Todas son idempotentes y seguras con varias instancias.
- **Fotos:** `POST /api/fotos` con la imagen tal cual (JPEG, PNG o WebP, ≤ 5 MB); el formato se comprueba por los bytes.
- **Fechas:** franjas calculadas en hora de Madrid (el cambio de hora no las mueve); la hora la pone siempre el servidor.

## Usuarios de prueba

Con `NODE_ENV=test` (tests y E2E) se entra sin Google con `POST /api/auth/test-login { email }`.
`POST /api/test/reiniciar` crea: `dueno@taller.test`, `jefe@taller.test`, `mecanico@taller.test` y `mecanico2@taller.test`.
Cualquier otro email entra como cliente nuevo. No hay contraseñas.

## Decisiones

Ver [`docs/HANDOFF.md`](docs/HANDOFF.md) (estado y pendientes) y [`docs/decisiones.md`](docs/decisiones.md): decisiones justificadas, cumplimiento del enunciado punto por punto, accesibilidad y diferencias con Figma.

## Credenciales de Google

En Google Cloud Console, cread un cliente OAuth (aplicación web) con estas URLs de redirección:

- `http://localhost:3000/api/auth/google/callback`
- `https://<vuestra-web>.azurewebsites.net/api/auth/google/callback`

El primer acceso de un email invitado recibe el rol de la invitación; el resto entra como cliente.
El dueño se crea con `OWNER_EMAIL` al ejecutar `npm run db:seed`.

## Notas

- Las fechas con hora se guardan en UTC (`timestamptz`) y se muestran en la zona del taller (`Europe/Madrid`).
- Los importes se guardan en céntimos (enteros).
- La tarifa por hora (40 €/h) y el IVA (21 %) son valores por defecto de `ConfigTaller`, pendientes de confirmar.
