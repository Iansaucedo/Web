# Decisiones de diseño e implementación

Este documento justifica las decisiones del proyecto y comprueba, punto por punto, que cumple el enunciado
de la práctica (G2105 · Desarrollo de Aplicaciones Web), salvo el vídeo de presentación.
Cada decisión indica qué se eligió, qué alternativas había y por qué.

## 1. El proyecto

| | |
| --- | --- |
| **Objetivo** | Gestionar un taller de coches: citas, recepción, presupuestos que aprueba el cliente, reparación, piezas, facturación, personal y fichaje. |
| **Usuarios** | Cliente (particular o empresa), mecánico, jefe de taller y dueño. |
| **Flujo principal** | El cliente reserva → el jefe confirma y recibe el coche → el mecánico diagnostica y pide autorización → el cliente acepta o rechaza cada trabajo → el mecánico registra horas y piezas y completa → el cliente recibe la factura → el jefe entrega. |
| **Alcance mínimo** | Todo lo anterior, más reserva múltiple para empresas, pedidos de piezas, ausencias y capacidad, fichaje con correcciones, estadísticas y trazabilidad. |
| **Ampliaciones** | Tema oscuro, guardar las fotos en Azure Blob en vez de en PostgreSQL y que la empresa rechace una oferta sin cancelar la reserva (ver § 11). |
| **Marca** | TallerPro (el nombre del diseño de Figma se usa en web, emails, PDF y Swagger). |

### Roles y permisos

| Acción | Cliente | Mecánico | Jefe | Dueño |
| --- | :-: | :-: | :-: | :-: |
| Perfil, vehículos propios, reservar y cancelar (con 24 h) | ✓ | | | |
| Aprobar o rechazar presupuestos de sus órdenes | ✓ | | | |
| Ver órdenes del taller, diagnosticar, pedir autorización, registrar horas y piezas, completar | | ✓ | ✓ | ✓ |
| Fichar y pedir correcciones de su jornada | | ✓ | ✓ | ✓ |
| Confirmar, recibir, cancelar con motivo, «no presentado», entregar | | | ✓ | ✓ |
| Aprobar pedidos, catálogo y stock, puestos, asignaciones, ausencias | | | ✓ | ✓ |
| Dar de alta mecánicos / jefes | | | mecánicos | ambos |
| Dar de baja (y reactivar) mecánicos / jefes, registrar ausencias (vacaciones, baja médica…) | | | mecánicos | ambos |
| Ajustar y cuadrar stock, eliminar piezas (siempre queda registro) | | | ✓ | ✓ |
| Darse de baja uno mismo | ✓ | | | |
| Configuración, usuarios, estadísticas, constancias de borrado | | | | ✓ |

**Decisión:** el dueño es administrador global y pasa cualquier comprobación de rol (`requireRole` → `definir({ acceso })`).
Una empresa usa una sola cuenta para todos sus vehículos. **Por qué:** era la forma más sencilla de cubrir los casos reales
del taller sin roles intermedios.

## 2. Arquitectura y tecnologías

| Decisión | Alternativas | Motivo |
| --- | --- | --- |
| **Monorepo con dos apps:** API Express (`apps/api`) y web Next.js (`apps/web`) | Solo Next (API routes); SPA + API | Separa contrato HTTP y presentación; la API se prueba por HTTP sin navegador (requisito de pruebas). |
| **API monolítica y modular** (`src/modulos/*`) | Microservicios | Un equipo de 3 personas y una sola base de datos: los servicios separados solo añadirían despliegue y fallos de red. |
| **Next reenvía `/api/*` a Express** (rewrites) | CORS entre dominios | La cookie de sesión es *first-party* en el dominio de la web; no hace falta CORS ni `SameSite=None`. |
| **Solo HTTP, sin WebSockets** (requisito) | WebSockets / SSE | Los avisos se consultan cada 60 s mientras la pestaña está visible (*polling*) y al abrir la campana. |
| **JavaScript/TypeScript, sin WebAssembly** | — | Requisito. TypeScript estricto en API y web. |
| **PostgreSQL + Prisma** | MongoDB, SQLite | Datos muy relacionales con reglas de integridad; transacciones y cerrojos de PostgreSQL resuelven las carreras. La base de datos va en `docker-compose.yml`, sin servicios externos. |
| **zod + `@asteasolutions/zod-to-openapi`** | Joi, validación manual | El mismo esquema valida y documenta. |
| **MUI con tema Material 3 de Figma** | CSS propio, Tailwind | Componentes accesibles de serie (diálogos con foco atrapado, selects con teclado) y adaptables. |
| **Versiones actualizadas por seguridad:** Next 15.5.28, React 19, zod 4, nodemailer 10, `postcss` forzado a 8.5.32 | Next 14 | `npm audit --omit=dev` = 0 vulnerabilidades. |

## 3. Usuarios, autenticación y abuso

| Decisión | Motivo |
| --- | --- |
| **Acceso con Google (OAuth 2.0)**, sin contraseñas propias | No almacenamos credenciales; Google verifica el email. El «formulario de alta» no existe: abusarlo exige cuentas de Google verificadas. |
| **Sesión en JWT dentro de cookie `httpOnly`, `SameSite=Lax`, `Secure` en producción, 8 h, HS256 explícito** | JavaScript no puede leerla (XSS) y no viaja en peticiones cruzadas de otros sitios. Se rechaza `alg: none`. |
| **El rol y el estado se leen de la base de datos en cada petición**, no del token | Dar de baja o cambiar el rol tiene efecto inmediato. Hay un test que sube el rol dentro de un token firmado y no sirve. |
| **El personal entra por invitación** (jefe invita mecánicos; dueño invita jefes); el resto entra como cliente | Nadie se asigna un rol a sí mismo. La invitación se consume en el primer acceso. |
| **Perfil de cliente obligatorio** (teléfono; razón social y NIF/CIF si es empresa) antes de operar | Datos necesarios para avisar y facturar. |
| **Límite de peticiones por IP:** 20/min en `/api/auth/*` y 600/min en general → 429 con `Retry-After` | Frena fuerza bruta y bucles de un cliente roto. Está en memoria (suficiente con una instancia; documentado). |
| **CSRF:** toda petición con cuerpo debe ser `application/json` (si no, 415) | Un formulario de otro sitio no puede enviar JSON sin CORS. Se suma a `SameSite=Lax`. |
| **Ruta de acceso sin Google solo en `NODE_ENV=test`** | Necesaria para pruebas automáticas; en producción no se monta ni aparece en Swagger. |

## 4. Modelo de datos

Entidades principales: `Usuario`, `Cliente`, `Empleado`, `Invitacion`, `Vehiculo`, `Cita`, `ReservaMultiple`, `Puesto`,
`AsignacionPuesto`, `Ausencia`, `OcupacionPuesto`, `Orden`, `SolicitudAutorizacion`, `Partida`, `Pieza`, `PiezaUsada`,
`PiezaQuitada`, `PedidoPieza`, `RegistroTrabajo`, `Observacion`, `EventoOrden`, `Fichaje`, `SolicitudCorreccionFichaje`,
`Notificacion`, `ConfigTaller`, `EmailSaliente`, `ClaveIdempotencia`, `RegistroEliminacion`, `MovimientoStock`. Diagrama en `docs/diagramas/`.

| Decisión | Motivo |
| --- | --- |
| **Identificadores `cuid`** estables; el número de orden visible (`OR-0042`) es aparte | No revelan cuántos registros hay ni se pueden adivinar; el cliente tiene un número legible. |
| **Claves foráneas y únicas en la base de datos** (matrícula, bastidor, puesto+día, empleado+día…) | La integridad no depende solo del código. |
| **Importes en céntimos (enteros)**, IVA y tarifa en `ConfigTaller` | Sin errores de redondeo de coma flotante. |
| **Instantes en UTC (`timestamptz`); días como `date`; franjas calculadas en hora de Madrid** | El cambio de hora no desplaza las citas (hay un test con el cambio de octubre). |
| **Presupuesto por partida**; el cliente responde todas las partidas de una solicitud de una vez | Pedido explícito: aprobación por trabajo y respuesta única. Se puede volver a pedir autorización desde «en reparación». |
| **Presupuesto informativo (+IVA) y factura real al completar** | La factura usa las piezas realmente montadas (al precio de ese momento) y las horas registradas; se envía en PDF. |
| **Historia solo de inserción:** `EventoOrden` (línea de tiempo) y `Fichaje` (una corrección crea un fichaje nuevo que sustituye al anterior) | Auditabilidad: nada se reescribe; se sabe quién cambió qué y por qué. |
| **Trazabilidad de piezas:** puestas, quitadas (desechada / devuelta al cliente) y pedidas, con fecha y mecánico | Requisito del cliente; visible en el historial del vehículo y en «Trazabilidad». |
| **Eliminación con constancia** | Ver abajo. |

### Bajas de usuarios

| Quién | Cómo | Efecto |
| --- | --- | --- |
| **Cliente (autobaja)** | «Mi perfil → Darme de baja», escribiendo DAR DE BAJA | Se cancelan sus citas futuras y reservas pendientes (no vuelven), se cierra la sesión, queda constancia y recibe un email. **Durante 14 días** puede entrar, pero solo ve una página para «Recuperar mi cuenta» o «Cerrar sesión» (la API responde 403 `CUENTA_EN_BAJA` a todo lo demás). **Pasados 14 días** se desliga Google (`googleId` vacío y email liberado); el historial y las facturas se conservan. No se puede iniciar con un vehículo en el taller. |
| **Mecánico** | Lo da de baja el jefe (o el dueño), con motivo | Pierde el acceso al momento (no lo recupera entrando), sale de la capacidad y de sus puestos futuros. Reactivable. |
| **Jefe** | Solo lo da de baja el dueño | Igual que el mecánico. |
| **Dueño** | No puede darse de baja | Es el administrador. |

**Por qué:** el personal no decide su propia baja (afecta a la jornada y la capacidad); el cliente sí, pero con margen para arrepentirse.
El plazo se cuenta con el reloj del servidor y la desvinculación es un proceso periódico idempotente (`servicios/bajas.ts`).

### Ausencias

Tipos: vacaciones, baja médica, asuntos propios u otra, de `desde` a `hasta` (máximo 90 días), con nota opcional. Se guarda un registro por día;
si algún día ya tenía ausencia no se crea nada (409). Bajan la capacidad de cada día y avisan una sola vez a los jefes con las citas que sobran.

### Kilómetros de salida

El mecánico los pone al **marcar la orden como completada** (obligatorios, nunca menos que los de entrada: 422 `KM_MENOR`) y pasan a ser
los km actuales del vehículo. Al **entregar**, el jefe los confirma o corrige; una corrección queda en la línea de tiempo (`KM_CORREGIDOS`,
de → a). Una orden rechazada no se completa, así que sus km se piden al entregar (422 `KM_SALIDA_REQUERIDOS` si faltan). El PDF muestra
«km a la entrada · km a la salida».

### Fotos de los trabajos

- **Subida:** `POST /api/fotos` recibe la imagen tal cual (JPEG, PNG o WebP, hasta 5 MB) con su `Content-Type`. Es la única ruta que no exige JSON;
  el resto sigue dando 415 aunque se le mande una imagen.
- **Comprobación del contenido:** el servidor mira los primeros bytes; un HTML o un PNG que dice ser JPEG se rechaza (422 `FOTO_NO_VALIDA`).
  SVG y GIF no se aceptan (415), porque un SVG puede llevar scripts.
- **Adjuntar:** la foto queda suelta hasta adjuntarla a un trabajo, al pedir autorización (`fotoIds` de cada trabajo) o después
  (`POST /partidas/:id/fotos`). Solo valen las propias y sin adjuntar, como mucho 6 por trabajo, y todo va en la misma transacción que la solicitud.
- **Ver:** `GET /api/fotos/:id` sirve la imagen con `nosniff`, `Content-Security-Policy: default-src 'none'` y caché privada. El personal ve todas;
  el cliente, solo las de sus órdenes (otro cliente recibe 404); una foto suelta, solo quien la subió.
- **Dónde se guardan:** en PostgreSQL (`bytea`), en la misma transacción y copia de seguridad que el resto. El detalle de la orden nunca carga los bytes.
  Si el volumen crece, se puede pasar a Azure Blob sin cambiar la API.
- **Limpieza:** las fotos que nadie adjunta en 24 h (el mecánico cerró el diálogo sin enviar) se borran cada hora.

### Recordatorio 24 h antes

Cada 15 minutos se buscan las citas pendientes o confirmadas que empiezan dentro de 24 h y se envía el email `RECORDATORIO_CITA` y un aviso
en la web, **una sola vez por cita**. La marca `recordatorioEn` se pone con un UPDATE condicional, así que dos instancias no lo duplican.
No se recuerda una cita reservada con menos de 24 h (el cliente acaba de recibir el email de la reserva), ni una cancelada.
Si el cliente cambia la cita, la marca se borra.

### Reserva múltiple: día y franjas

Como en Figma, el jefe ofrece **un día y una franja por vehículo** (sin repetir). Se comprueba que caben ese día y en cada franja; si una está llena,
el error dice cuál (409 `SIN_HUECO`). La empresa ve las horas en el email y en la web. Si acepta por teléfono, el jefe pulsa **«Confirmar ya»**
y la empresa recibe la confirmación igualmente. Si al aceptar alguna franja ya está llena, la reserva vuelve a espera sin crear citas.
Cada solicitud tiene un código (`RM-07`).

### Stock con registro

Todo cambio de stock pasa por `servicios/stock.ts`, que bloquea la fila (`FOR UPDATE`) y anota un `MovimientoStock` con antes, después, quién, cuándo y por qué:
alta, **ajuste** (sumar o restar, con motivo), **cuadre** (fijar el recuento real del inventario, con motivo), uso en una reparación y recepción de un pedido.
Solo el jefe (y el dueño) ajusta o cuadra. La suma de los movimientos es el stock actual (hay un test que lo comprueba).
Cada pieza tiene categoría y su propio stock mínimo («stock bajo»). El catálogo muestra los «Movimientos de hoy».

### Eliminar sin dejar huérfanos

Toda eliminación deja en `RegistroEliminacion` una **copia completa del registro**, con quién, cuándo, por qué y el modo:

- **BORRADO:** el registro no tenía nada que dependiera de él. Se borra y queda la copia (vehículo sin citas, pieza nunca usada, ausencia, invitación sin usar).
- **BAJA:** otros registros dependen de él (un vehículo con citas u órdenes, una pieza ya usada, un usuario). No se borra: se marca como baja, deja de
  aparecer al cliente y no se puede reservar con él, pero su historial y la trazabilidad de piezas siguen enlazados.
- **No permitido:** con una cita activa o el vehículo en el taller → 409 `VEHICULO_EN_USO`.

La copia y el borrado van en la misma transacción. Si el cliente vuelve a registrar la misma matrícula, se recupera el vehículo con su historial.
El dueño consulta las constancias en «Constancias de borrado» (`GET /api/eliminaciones`).

## 5. Reglas de negocio principales

| Regla | Dónde | Pruebas |
| --- | --- | --- |
| Capacidad del día = min(puestos activos, mecánicos presentes × vehículos por mecánico) − vehículos que siguen en el taller; llegadas por franja limitadas | `servicios/agenda.ts`, `domain/capacidad.ts` | `agenda.test.ts` |
| Reserva solo en el inicio exacto de una franja futura, en día laborable, como mucho a 60 días; un vehículo, una cita activa | `modulos/citas.ts` | `agenda.test.ts` |
| El cliente cambia o cancela hasta 24 h antes (límite incluido); el jefe cancela siempre, con motivo | `modulos/citas.ts` | `agenda.test.ts`, `qa.spec.ts` |
| Se recibe solo el día de la cita; los km no bajan; puesto libre o nada | `modulos/citas.ts` | `agenda.test.ts` |
| Máquina de estados de la orden; solo el sistema sale de «esperando autorización» | `domain/estadoOrden.ts` | `dominio.test.ts` |
| Rechazar todo en la primera solicitud cierra la orden; en las siguientes se sigue con lo aprobado | `domain/respuesta.ts` | `respuesta.test.ts`, `ordenes.test.ts` |
| Piezas y horas solo en trabajos aceptados y sin terminar; stock descontado de forma atómica | `servicios/ordenes.ts`, `modulos/piezas.ts` | `ordenes.test.ts` |
| «Completar» solo con todo lo aceptado terminado, y la interfaz explica qué falta | `domain/respuesta.ts` | `ordenes.test.ts`, `qa.spec.ts` |
| Pedidos: el mecánico pide, el jefe aprueba o rechaza (con motivo), recibir suma stock una vez | `modulos/piezas.ts` | `ordenes.test.ts` |
| Fichaje en orden ENTRADA → (pausa)* → SALIDA, con la hora del servidor; correcciones revisadas por otra persona; no se acepta una corrección que deje la jornada imposible | `domain/jornada.ts`, `modulos/fichajes.ts` | `jornada.test.ts` |
| Una ausencia baja la capacidad, quita las asignaciones del día y avisa si sobran citas | `modulos/personal.ts` | `personal.test.ts` |
| Km de salida al completar (nunca menos que los de entrada); el jefe los confirma o corrige al entregar | `modulos/ordenes.ts` | `ordenes.test.ts`, `flujo-reparacion.spec.ts` |
| Fotos: formato comprobado por los bytes, 5 MB, 6 por trabajo, solo las propias; el cliente solo ve las suyas | `modulos/fotos.ts`, `servicios/fotos.ts` | `fotos.test.ts` |
| Reserva múltiple: una franja por vehículo, todas con hueco; «Confirmar ya» si aceptan por teléfono | `modulos/reservas.ts` | `agenda.test.ts`, `flujos.spec.ts` |
| Recordatorio 24 h antes, una vez por cita | `servicios/recordatorios.ts` | `recordatorios.test.ts` |

## 6. Fiabilidad

| Problema | Solución |
| --- | --- |
| Dos clientes por la última plaza; dos mecánicos por la última pieza; dos respuestas a un presupuesto; doble fichaje | Transacciones con cerrojo de PostgreSQL (`pg_advisory_xact_lock`) por recurso lógico y actualizaciones condicionales (`UPDATE … WHERE stock >= n`, `WHERE estado = 'PENDIENTE'`). Tests que lanzan las peticiones en paralelo. |
| Doble clic o reintento de red | `Idempotency-Key` en las POST que crean algo: la repetición devuelve la respuesta guardada (`Idempotent-Replayed`). La web reutiliza la clave al reintentar y bloquea el botón mientras espera. |
| El SMTP cae y se pierden avisos | Bandeja de salida (`EmailSaliente`) escrita en la misma transacción que el cambio; un proceso la envía con reintentos (1, 2, 4… min, hasta 6 intentos) y `FOR UPDATE SKIP LOCKED` (dos instancias no duplican). |
| Tests dependientes de la hora | Reloj inyectable (`lib/reloj.ts`); en E2E se fija en servidor y navegador. |
| Errores incoherentes o con trazas | Formato único `{ error, codigo, detalles?, requestId }`; Prisma P2002 → 409, P2025 → 404; 500 sin trazas y con `requestId` en el log. |
| Datos maliciosos o inesperados | Validación estricta (cuerpo `.strict()`, query estricta: `?estado[$ne]=x` → 400), límite de 100 KB (413), JSON roto (400). |
| Recordatorio o limpieza en varias instancias | Marca con UPDATE condicional (`WHERE recordatorioEn IS NULL`) en la misma transacción que el aviso: solo una instancia lo envía. |
| Una foto maliciosa | El tipo se comprueba por los bytes, no por la cabecera; solo JPEG, PNG y WebP; se sirve con `nosniff` y CSP `default-src 'none'`. |
| Operación que se cuelga | Transacciones con tiempo límite; `/api/health` y `/api/ready`; cierre ordenado con SIGTERM. |

## 7. Contrato HTTP y documentación

- Cada ruta se declara una sola vez con `definir()` (`lib/ruta.ts`): acceso por rol, validación de params, query y cuerpo,
  idempotencia, montaje en Express y documentación OpenAPI. **No puede existir una ruta sin documentar:** un test lo comprueba.
- Swagger en `/api/docs` (79 rutas, 94 operaciones; la subida de fotos se documenta con su cuerpo binario). Cada operación documenta sus errores con su código estable (`FRANJA_LLENA`, `STOCK_INSUFICIENTE`…).
- **Un recurso ajeno responde 404, no 403**, para no revelar que existe. 403 se reserva a «tu rol no puede hacer esto».
- Se comprueba el permiso **antes** que los datos: un cliente que manda datos inválidos a una ruta de jefe recibe 403, no 400.

## 8. Interfaz

| Decisión | Motivo |
| --- | --- |
| Pantallas y flujos diseñados primero en Figma (páginas «Flujos», «Móvil y tablet», «Estados», «Emails») y el tema de MUI con los mismos tokens | Coherencia entre diseño y código. |
| Navegación lateral por rol, con la página actual marcada (`aria-current`) | Saber dónde se está y qué se puede hacer. |
| Si alguien abre la URL de otro rol, ve «No tienes acceso» | La autorización real está en el servidor; esto evita pantallas llenas de errores. |
| Toda acción pasa por `useAccion`: botón bloqueado mientras se guarda, error dentro del diálogo, aviso al terminar | La interfaz nunca asume que una petición funciona. |
| Las acciones destructivas o irreversibles piden confirmación y dicen la consecuencia | Cancelar, marcar no presentado, entregar, dar de baja, eliminar, completar. |
| Carga, vacío y error con reintento en todas las listas (`Carga`, `Vacio`) | No hay pantallas en blanco. |
| Emails: 29 plantillas diseñadas en Figma; HTML con tablas y CSS en línea; todo texto escapado; botón centrado; solo enlaces a la web del taller | Compatibilidad con Outlook y Gmail, seguridad y lectura clara. |

## 9. Accesibilidad (WCAG 2.2 AA)

| Requisito del enunciado | Cómo se cumple | Comprobación |
| --- | --- | --- |
| HTML semántico y controles apropiados | `main`, `nav`, `header`, listas reales, botones para acciones y enlaces para navegar | axe en todas las pantallas (`e2e/accesibilidad.spec.ts`) |
| Teclado, orden de foco y foco visible | Enlace «Saltar al contenido»; contorno de 3 px en `:focus-visible`; diálogos con foco atrapado y Escape; selects con flechas | Test de reserva completa solo con teclado |
| Etiquetas, instrucciones y errores claros | Todos los campos con `label`; textos de ayuda; errores del servidor en español con el campo que falla | axe + revisión |
| Contraste y no depender del color | Paleta M3 con contraste AA; los estados llevan texto e icono (`ChipEstado`); la gráfica tiene vista de tabla | axe; test de chips |
| Texto alternativo | Las fotos de trabajos tienen `alt` con su descripción; los iconos decorativos van ocultos | axe |
| Idioma y encabezados | `lang="es"`; un `h1` por página y sin saltos de nivel | Tests específicos |
| Cambios de estado anunciados | Avisos con `role="alert"`; carga con `aria-busy`; contador de avisos en el nombre del botón | Test de teclado (comprueba el aviso) |
| Sin arrastrar, gestos, sonido ni animaciones imprescindibles | No hay arrastre; se respeta `prefers-reduced-motion` | Revisión |
| Táctil y adaptable | Botones de fichaje de 56 px; menú plegable en móvil; sin scroll horizontal | `e2e/movil.spec.ts` (Pixel 7) |

**Problemas encontrados y corregidos durante la revisión:**

- Saltos de encabezado de `h1` a `h6`.
- Enlaces del menú dentro de `<ul>` sin `<li>`.
- El nombre accesible del botón de usuario no contenía su texto visible (WCAG 2.5.3).
- El número de la campana entraba en el nombre accesible.

**Limitaciones conocidas:**

- La revisión automática no sustituye a la manual: queda pendiente probar con un lector de pantalla real (NVDA o VoiceOver).
- No hay tema oscuro; el diseño de Figma es solo claro.

## 10. Pruebas

| Nivel | Qué | Cuántas | Comando |
| --- | --- | --- | --- |
| Unitarias (dominio) | Estados, capacidad, importes, jornada, respuesta | 22 | `npm test` |
| API / integración por HTTP | Supertest contra PostgreSQL real (`taller_test`), base reiniciada en cada test | 246 | `npm test` |
| Extremo a extremo | Playwright: flujos de Figma, batería QA, accesibilidad (axe) y móvil (`taller_e2e`) | 49 | `npm run e2e` |
| **Mutación** («tests que deben fallar») | Rompe a propósito 27 reglas clave y exige que los tests fallen | 27/27 detectadas | `npm run mutaciones` |

**Tests que deben fallar.** `apps/api/scripts/mutaciones.ts` cambia una línea de cada regla importante (verificar el JWT, el rol,
el cerrojo de capacidad, el stock no negativo, el registro de stock, la constancia de borrado…), ejecuta sus tests y exige que
**fallen**; después restaura el código. La primera ejecución encontró un hueco real: sin verificar la firma del JWT los tests
seguían en verde (los tokens falsos eran de usuarios inexistentes). Se añadieron tests con tokens falsos de usuarios reales y
caducados. Al añadir el recordatorio pasó lo mismo: con el UPDATE sin condición el test de «dos procesos a la vez» seguía en verde,
porque las llamadas no llegaban a competir. Se cambió por un test determinista que reclama la misma cita dos veces.
Resultado en `docs/mutaciones.md`.

Cobertura de lo que pide el enunciado:

- **Autenticación:**
  - sin sesión → 401;
  - JWT con otra clave o con `alg: none` → 401;
  - usuario dado de baja → 401.
- **Autorización** (un caso por cada tipo de permiso, como mínimo):
  - recurso de otro cliente → 404;
  - rol insuficiente → 403;
  - jefe que intenta invitar a otro jefe → 403;
  - nadie corrige sus propios fichajes.
- **CRUD:**
  - vehículos: crear, consultar, editar y eliminar con constancia;
  - piezas, puestos, ausencias, invitaciones y citas;
  - en cada caso se comprueba el estado de la base de datos después de la operación.
- **Validación:** datos incompletos o incoherentes → 400 o 422, con el campo que falla.
- **Reglas de negocio con casos límite:**
  - exactamente 24 h antes;
  - la última plaza, con peticiones simultáneas;
  - stock insuficiente;
  - cambio de hora;
  - jornada imposible.
- **Flujo principal:**
  - `e2e/flujo-reparacion.spec.ts`;
  - en API, los helpers `ordenEnDiagnostico` y `ordenEnReparacion`.
- **Estado consistente tras un error:**
  - el stock no cambia;
  - no queda una orden a medias si el puesto está ocupado;
  - las partidas siguen pendientes tras una respuesta incompleta.

Cada test prepara sus propios datos; nunca se usa la base de datos de desarrollo.

## 11. Cumplimiento del enunciado (sin el vídeo)

| Requisito | Estado | Evidencia |
| --- | :-: | --- |
| Autenticación de usuarios | ✓ | Google OAuth, `modulos/auth.ts` |
| Perfil o espacio personal | ✓ | `/perfil`, vehículos, órdenes, mi jornada |
| Permisos y roles comprobados en el servidor | ✓ | `definir({ acceso })`, comprobaciones de propiedad; `plataforma`, `qa` |
| CRUD sobre entidades principales | ✓ | Vehículos, citas, piezas, puestos, ausencias, invitaciones, usuarios; eliminar siempre con constancia |
| Varias entidades relacionadas con reglas de negocio | ✓ | 28 modelos; § 4 y § 5 |
| Identificadores estables e integridad | ✓ | `cuid`, claves foráneas, eliminación con constancia |
| Validaciones (cliente y servidor) | ✓ | zod en servidor; formularios con campos obligatorios, rangos y avisos |
| Persistencia entre sesiones y reinicios | ✓ | PostgreSQL |
| Solo HTTP, sin WebSockets ni WebAssembly | ✓ | Polling de avisos |
| Errores HTTP adecuados y comprensibles | ✓ | § 6 y § 7 |
| Accesibilidad | ✓ | § 9 |
| Escritorio y móvil | ✓ | Figma «Móvil y tablet»; `e2e/movil.spec.ts` |
| Pruebas de API con un solo comando, independientes y con base de datos propia | ✓ | § 10 (y además E2E y mutación) |
| Indicación de progreso, acciones destructivas deliberadas | ✓ | § 8 |
| Código organizado, sin secretos en el repositorio | ✓ | `.env` en `.gitignore`; secretos de test solo en la configuración de tests |
| Instrucciones de instalación y credenciales de prueba | ✓ | `README.md` |
| Base de datos contenida en el proyecto | ✓ | `docker-compose.yml` |

### Diferencias con los flujos de Figma

Las diferencias que quedaban están resueltas: recordatorio 24 h, km de salida, ofrecer hueco con día y franjas, subida de fotos
y barra superior (título de la página arriba; marca y «Cerrar sesión» en el menú lateral, con los grupos y nombres de Figma). También se
añadieron las pantallas que estaban en el menú de Figma y no en la web: «Notificaciones», y para el mecánico «Historial» y
«Catálogo de piezas» de consulta. Lo que sigue distinto:

| En Figma | En el código | Motivo |
| --- | --- | --- |
| La empresa puede «Rechazar» una oferta de hueco | Puede aceptarla o cancelar la reserva | Rechazar sin cancelar necesita otra ruta y su aviso al jefe; queda como ampliación |
| Notificaciones con detalle de dos líneas (orden, vehículo, importe) | Una línea con el mensaje del aviso | El aviso guarda el mensaje ya redactado; el detalle está en el email |
| Fotos en un almacenamiento de archivos (Azure Blob) | Fotos en PostgreSQL | Más simple y transaccional; se puede migrar sin cambiar la API |

**Figma es la fuente de verdad.** Cada cambio de comportamiento se añade también al archivo de Figma:

- **Pantallas y modales:** baja de cuenta, eliminar vehículo, baja y reactivación de mecánicos, motivo y nota en la ausencia, menú del lápiz, cuadre e historial de stock, constancias, «No tienes acceso».
- **Emails:** 31 (incluidos `BAJA_CUENTA` y `RECORDATORIO_CITA`; `HUECO_OFRECIDO` con las horas de llegada).
- **Pantallas nuevas:** «Mecánico · Historial» y «Mecánico · Catálogo de piezas (consulta)»; «Confirmar ya» en «Empresas en espera».
- **Flujos:** los 6 nuevos de la tabla anterior.

Cuando el código difería del diseño (marca TallerPro, «Continuar con Google», categoría y stock mínimo de piezas, panel de movimientos), se ha alineado el código con Figma.
