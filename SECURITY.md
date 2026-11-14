# Seguridad

Proyecto académico. Este documento resume las medidas de seguridad, los riesgos que se aceptan a propósito y las
decisiones de diseño que una auditoría podría señalar, para que se evalúen con su contexto.

## Informar de una vulnerabilidad

Usa **Security → Report a vulnerability** en el repositorio de GitHub (aviso privado). No abras un issue público.

## Medidas implementadas

**Sesión y acceso**
- Acceso solo con Google (OAuth 2.0) con parámetro `state` en una cookie httpOnly de un solo uso (contra el CSRF en el login).
  Solo se aceptan emails que Google marca expresamente como verificados.
- Sesión en JWT (HS256, 8 h) dentro de una cookie `httpOnly`, `SameSite=Lax` y `Secure` (en producción o con HTTPS).
  En producción la API no arranca sin `JWT_SECRET` de al menos 32 caracteres; en el código no hay secreto por defecto.
- El usuario y su rol se leen de la base de datos en cada petición: dar de baja o cambiar el rol tiene efecto inmediato.
- Cerrar sesión invalida en el servidor los tokens ya emitidos (`versionSesion`), en todos los dispositivos del usuario.
- Autorización por rol en cada ruta (`lib/ruta.ts`) y por propiedad en cada recurso: lo ajeno responde 404, sin revelar que existe.

**Entrada y salida**
- Validación estricta con zod de parámetros, query (parámetros desconocidos o anidados → 400) y cuerpo; JSON de 100 KB como máximo.
- CSRF: toda petición con cuerpo exige `application/json` (un formulario de otro sitio no puede enviarlo sin CORS) y la cookie es `SameSite=Lax`.
- Sin SQL concatenado: Prisma y consultas parametrizadas.
- Emails: todo texto se escapa al maquetar; los botones solo enlazan a la web del taller.
- CSV: las celdas que empiezan por `= + - @` se neutralizan (inyección de fórmulas).
- Fotos: tipo comprobado por los bytes, ≤ 5 MB; se sirven con `nosniff` y `Content-Security-Policy: default-src 'none'`.
- Errores: nunca se devuelve la traza; cada respuesta lleva un `requestId` para buscarla en los logs.
- Los logs propios enmascaran los emails (`a***@dominio`); el texto de un error SMTP se registra tal cual lo devuelve el servidor de correo.

**Plataforma**
- Cabeceras: Helmet en la API; CSP, HSTS, `X-Frame-Options: DENY`, `nosniff` y `Referrer-Policy` en la web.
- Límite de peticiones por IP (20/min en el acceso, 600/min en general). `TRUST_PROXY` debe coincidir con los proxies reales
  y la API no debe ser accesible directamente desde internet (ver `docs/DESPLIEGUE_AZURE.md`).
- Swagger (`/api/docs`) no se publica en producción salvo con `API_DOCS=true`.
- Contenedores sin root y sin dependencias de desarrollo; Postgres de desarrollo solo en `127.0.0.1`.
- CI: acciones de GitHub fijadas por SHA, permisos mínimos y Dependabot para acciones y npm. `npm audit`: 0 vulnerabilidades.
- Concurrencia: cerrojos de PostgreSQL y actualizaciones condicionales en todo lo que compite (plazas, stock, fichajes, reservas).

## Riesgos aceptados

| Riesgo | Por qué se acepta | Mitigación |
|---|---|---|
| **Modo de pruebas** (`NODE_ENV=test`): `POST /api/auth/test-login` entra con cualquier email sin Google, y las rutas `/api/test/*` (públicas) reinician la base de datos y cambian la hora del servidor. | Es un proyecto académico: permite probar y corregir todos los roles sin cuentas de Google. | Solo existe con `NODE_ENV=test`; en producción las rutas no se montan ni se documentan. **Nunca debe usarse con datos reales.** |
| **Secretos configurados a mano** en Azure (App Settings y secretos de GitHub). | Despliegue de un único entorno, sin gestor de secretos. | Ningún secreto en el repositorio ni en su historial; `JWT_SECRET` obligatorio en producción. |
| **CSP con `'unsafe-inline'`** en scripts y estilos. | Next.js y MUI (emotion) insertan scripts y estilos en línea; usar nonces exigiría renderizar todo de forma dinámica. | Sin `unsafe-eval` en producción, `object-src 'none'`, `frame-ancestors 'none'`; React escapa todo el contenido. |
| **Límite de peticiones en memoria**: con varias instancias, cada una cuenta lo suyo. | Despliegue de una sola instancia. | Con más instancias habría que moverlo a Redis o al frontal (Azure Front Door / WAF). |

## Decisiones de diseño

- **El personal ve y trabaja en todas las órdenes abiertas**, no solo en las de sus puestos del día. Cada acción
  (piezas usadas y retiradas, horas, pedidos, cambios de estado, observaciones) queda en la línea de tiempo de la orden
  con quién y cuándo; cada foto guarda quién la subió.
- **La matrícula y el bastidor son únicos en todo el sistema** (un vehículo físico es uno solo). Por eso, al registrar
  uno ya existente, la respuesta indica que ya está registrado, sin decir de quién. Si alguien registra un vehículo
  ajeno, el taller lo resuelve a mano.
- **Conservación de datos tras la baja**: pasados 14 días de una autobaja se desliga Google y se libera el email, pero
  se conservan el nombre, el NIF y el historial de órdenes y facturas, por la obligación legal de conservar las facturas.
  Las constancias de eliminación guardan una copia del registro borrado, sin el identificador de Google.
- **Cerrar sesión cierra todas las sesiones del usuario**: es lo que permite invalidar en el servidor un token copiado.
