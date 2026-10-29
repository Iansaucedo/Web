# Handoff · TallerPro

Estado a 27 de octubre de 2026. Para quien retome el proyecto.

## Dónde está todo

| Qué | Dónde |
| --- | --- |
| Diseño (pantallas, emails, flujos) | Figma, archivo `vmBzauJrP9qfob6PXhJHWB` (fuente de verdad) |
| Documento de diseño | https://claude.ai/artifact/CW98CUrnLje9qXMNLYCbAE |
| Decisiones y cumplimiento (compartible) | https://claude.ai/artifact/2MtwWkedXTT4aChBoWnEcz |
| Decisiones con detalle técnico | `docs/decisiones.md` |
| Tests que deben fallar | `docs/mutaciones.md` (`npm run mutaciones -w api`) |
| Vista previa de los 31 emails | `docs/emails/index.html` |
| Arranque, tests, usuarios de prueba | `README.md` |
| API documentada | `http://localhost:4000/api/docs` (79 rutas, 94 operaciones) |

## Estado verificado

En la última ejecución:

- **API:** 268 tests en verde (22 de dominio y 246 de integración contra PostgreSQL).
- **E2E:** 49 tests en verde con Playwright, en escritorio y Pixel 7: flujos de Figma, batería de QA, axe en 23 pantallas, teclado y móvil.
- **Mutación:** 27 de 27 reglas rotas a propósito detectadas.
- **TypeScript:** sin errores en API y web; `npm audit`, 0 vulnerabilidades.

## Cómo arrancar (resumen)

```bash
npm install
cp .env.example .env            # GOOGLE_*, OWNER_EMAIL, JWT_SECRET (16+), SMTP_*
npm run db:up                   # o un PostgreSQL local
npm run db:migrate && npm run db:seed
npm run dev:api && npm run dev:web    # entrar siempre por http://localhost:3000
```

Para tests: bases de datos `taller_test` y `taller_e2e` (usuario `taller`/`taller`) con
`DATABASE_URL=... npx prisma migrate deploy`. Después, `npm test` y `npm run e2e`.

## Lo último que se hizo

- **Km de salida:** al completar (obligatorios, nunca menos que a la entrada) y al entregar (el jefe confirma o corrige; queda en la línea de tiempo). Salen en el PDF.
- **Fotos:** `POST /api/fotos` con la imagen tal cual. Se aceptan JPEG, PNG y WebP de hasta 5 MB, con el formato comprobado por los bytes, y se adjuntan al pedir autorización. Se guardan en PostgreSQL y las que nadie adjunta se borran a las 24 h.
- **Reserva múltiple:** el jefe ofrece día y una franja por vehículo, como en Figma, y tiene «Confirmar ya» si la empresa acepta por teléfono. Cada solicitud tiene código `RM-xx`.
- **Recordatorio 24 h antes:** email y aviso una sola vez por cita (`servicios/recordatorios.ts`, cada 15 min).
- **Navegación como en Figma:** barra superior con título y avatar; marca, grupos y «Cerrar sesión» en el menú lateral. Pantallas nuevas: Notificaciones, y para el mecánico Historial y Catálogo de consulta.
- **Web en Docker:** servicio `web` en `docker-compose.yml` (`npm run web:up`). Es la imagen standalone de Next, apunta a la API del equipo por `host.docker.internal:4000` y tiene healthcheck. Probado: la imagen compila, `/login` da 200, `/api/health` llega a la API y el healthcheck da `healthy`.
- **Enlaces de citas:** los avisos y emails de citas apuntaban a `/citas`, que no existía; ahora van a `/ordenes`, y `/citas` redirige allí.

## Cosas a saber antes de tocar nada

- **Cada ruta se define una vez con `definir()`** (`apps/api/src/lib/ruta.ts`): valida, comprueba el rol, documenta en Swagger y monta en Express. Un test falla si alguna ruta queda sin documentar.
- **Cuerpos de las peticiones:** toda petición con cuerpo debe ser JSON (si no, 415). La única excepción es una ruta con `binario` (la subida de fotos).
- **Stock:** todo cambio pasa por `moverStock()` (`servicios/stock.ts`), que deja un `MovimientoStock`. No actualices `Pieza.stock` a mano.
- **Eliminar:** pasa por `dejarConstancia()` (`servicios/constancias.ts`).
- **Hora:** usa `reloj.ahora()`, nunca `new Date()`; los tests y los E2E fijan la hora.
- **Migraciones:** `prisma migrate dev` falla en un entorno no interactivo si la migración tiene avisos. En ese caso, crea la carpeta a mano con `prisma migrate diff --from-url … --to-schema-datamodel prisma/schema.prisma --script` y aplica con `migrate deploy`.
- **PostgreSQL:** si el contenedor o la sesión se reinicia, puede quedar parado y todos los tests fallan con `PrismaClientInitializationError`. Arráncalo antes de nada.
- **Figma es la fuente de verdad:** cualquier cambio visible se añade también allí.

## TODO

Por prioridad.

### Producto

- [ ] **Rechazar una oferta de hueco sin cancelar la reserva.** En Figma la empresa tiene «Rechazar». Hace falta una ruta (p. ej. `POST /reservas-multiples/:id/rechazar-oferta`) que vuelva a `EN_ESPERA` y avise al jefe, con su test y su E2E.
- [ ] **PDF del presupuesto previo**, el que aprueba el cliente, para imprimirlo. Hoy solo hay PDF de la factura final.
- [ ] **Detalle de dos líneas en Notificaciones** (orden, vehículo, importe), como en Figma. Implica guardar datos estructurados en `Notificacion`.
- [ ] **Tema oscuro.** No está en Figma: primero el diseño, después `theme.ts`.

### Técnico

- [ ] **Pasar las fotos a Azure Blob** si el volumen lo pide. La API (`/fotos`, `/fotos/:id`) no cambia; solo `servicios/fotos.ts` y la migración de los datos.
- [ ] **Usar `node .next/standalone/server.js` en vez de `next start`** en `playwright.config.ts`. Ahora sale un aviso porque la web compila con `output: standalone`; el contenedor ya lo hace bien.
- [ ] **Contenedor para la API** (Prisma, migraciones al arrancar). Con él, `docker compose up` levantaría todo y el servicio `web` usaría `API_INTERNAL_URL=http://api:4000`.
- [ ] **«Convertidas este mes» con la hora del servidor.** Ahora usa la fecha del navegador; en E2E con el reloj fijado puede no coincidir.
- [ ] **Paginación real en las tablas** (órdenes, historial, catálogo). Hoy se devuelven hasta 200 filas.
- [ ] **Medir el tiempo de las tareas periódicas** con varias instancias. Son idempotentes, pero cada instancia las ejecuta.

### Accesibilidad y QA

- [ ] **Prueba manual con lector de pantalla** (NVDA y VoiceOver) en los flujos principales.
- [ ] **E2E de subir una foto desde el móvil** (Pixel 7) y de un error de red a mitad de la subida.

### Figma

- [ ] **Paginación en «Mecánico · Catálogo de piezas (consulta)».** Al ocultar los botones de editar también se ocultaron las flechas de paginación; hay que volver a mostrarlas.
- [ ] **Estado «Subiendo…» y error de foto** en el modal «Nueva solicitud de autorización».
- [ ] **Modal «Confirmar ya»** (la confirmación de que la empresa aceptó por teléfono) y flujo «Recordatorio 24 h» actualizado con el email nuevo.
