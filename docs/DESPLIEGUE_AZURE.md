# Guía de Despliegue en Azure y Configuración de Email · TallerPro

Esta guía detalla los pasos para desplegar la solución (API Express + Frontend Next.js + Base de datos PostgreSQL) en **Microsoft Azure** utilizando **GitHub Actions**, así como la configuración y prueba del servicio de envío de correos electrónicos.

---

## 1. Configuración del Servicio de Correo Electrónico (Email)

> [!IMPORTANT]
> **Bloqueo del puerto 25 en Azure:**  
> Por motivos de seguridad y políticas anti-spam, Azure bloquea las conexiones salientes por el puerto 25 en App Service.  
> Se debe utilizar siempre el **puerto 587 (STARTTLS)** o el **puerto 465 (SSL/TLS con `SMTP_SECURE=true`)**.

### Proveedores recomendados para Azure

#### Opción A: Twilio SendGrid (Recomendado oficial en Azure)
SendGrid está integrado en el marketplace de Azure y ofrece un plan gratuito adecuado para pruebas y pequeños talleres:
1. En Azure Portal, busca y crea un recurso **SendGrid Accounts**.
2. Entra al panel de SendGrid, ve a **Settings > API Keys** y genera una clave con permisos de *Mail Send*.
3. En **Sender Authentication**, verifica el dominio o el correo remitente (`no-responder@tudominio.com`).
4. Configura las variables:
   - `SMTP_HOST=smtp.sendgrid.net`
   - `SMTP_PORT=587`
   - `SMTP_SECURE=false`
   - `SMTP_USER=apikey` *(literalmente la palabra "apikey")*
   - `SMTP_PASS=<tu_api_key_de_sendgrid>`
   - `SMTP_FROM=TallerPro <tu-correo-verificado@tudominio.com>`

#### Opción B: Azure Communication Services (ACS) Email
Servicio nativo de Microsoft Azure para envío de emails:
1. Crea un recurso **Communication Services** y un recurso **Email Communication Services**.
2. Añade un dominio administrado por Azure (ej. `...azurecomm.net`) o tu dominio propio.
3. Habilita el relay SMTP y obtén las credenciales.
4. Variables:
   - `SMTP_HOST=smtp.azurecomm.net`
   - `SMTP_PORT=587`
   - `SMTP_USER=<tu_usuario_acs>`
   - `SMTP_PASS=<tu_clave_acs>`
   - `SMTP_FROM=TallerPro <donotreply@tudominio.azurecomm.net>`

#### Opción C: Microsoft 365 / Exchange Online / Outlook
Si la empresa dispone de cuentas de correo de Microsoft 365:
- `SMTP_HOST=smtp.office365.com`
- `SMTP_PORT=587`
- `SMTP_SECURE=false`
- `SMTP_USER=notificaciones@tudominio.com`
- `SMTP_PASS=<contraseña_de_aplicacion>`
- `SMTP_FROM=TallerPro <notificaciones@tudominio.com>`

#### Opción D: Gmail / Google Workspace
- `SMTP_HOST=smtp.gmail.com`
- `SMTP_PORT=587` (o `465` con `SMTP_SECURE=true`)
- `SMTP_USER=tu-cuenta@gmail.com`
- `SMTP_PASS=<contraseña_de_aplicacion_de_16_caracteres>` *(creada en Seguridad de Google > Contraseñas de aplicaciones)*
- `SMTP_FROM=TallerPro <tu-cuenta@gmail.com>`

### Probar el envío de correo desde la terminal

Puedes verificar la conexión y enviar un correo de prueba inmediatamente ejecutando:

```bash
# Prueba enviando al email del dueño (OWNER_EMAIL configurado en .env)
npm run email:test

# O especificando un correo destinatario directo:
npm run email:test -- tu-correo@ejemplo.com
```

---

## 2. Configuración de Google OAuth 2.0 (Inicio de Sesión)

La aplicación utiliza **Google OAuth 2.0** a través de Passport en la API (`apps/api/src/modulos/auth.ts`) y reenvía las solicitudes desde el dominio de la Web (`apps/web`) para que las cookies de sesión se almacenen de forma *first-party* en el navegador del usuario.

### Pasos en Google Cloud Console

1. Accede a la [Consola de Google Cloud](https://console.cloud.google.com/).
2. Crea un proyecto nuevo o selecciona el existente (ej. `TallerPro`).
3. Ve a **APIs y servicios > Pantalla de consentimiento de OAuth**:
   - Tipo de usuario: **Externo** (*External*).
   - Nombre de la aplicación: `TallerPro`.
   - Correo electrónico de asistencia y de contacto del desarrollador.
   - En **Dominios autorizados** (*Authorized domains*), añade: `azurewebsites.net` (o tu dominio personalizado si utilizas uno).
4. Ve a **APIs y servicios > Credenciales**:
   - Haz clic en **+ Crear credenciales > ID de cliente de OAuth**.
   - Tipo de aplicación: **Aplicación web**.
   - Nombre: `TallerPro Azure Web`.
   - **Orígenes autorizados de JavaScript** (*Authorized JavaScript origins*):
     - `https://taller-web.azurewebsites.net` *(o tu URL real del frontend)*
     - `http://localhost:3000` *(para desarrollo local)*
   - **URIs de redireccionamiento autorizados** (*Authorized redirect URIs*):
     - `https://taller-web.azurewebsites.net/api/auth/google/callback`
     - `http://localhost:3000/api/auth/google/callback` *(para desarrollo local)*
5. Copia el **ID de cliente** (*Client ID*) y el **Secreto de cliente** (*Client Secret*).

### Variables obligatorias en Azure App Service (`taller-api`)

En la Web App de la API (`taller-api`):
- `GOOGLE_CLIENT_ID`: El ID de cliente copiado de Google Cloud Console.
- `GOOGLE_CLIENT_SECRET`: El secreto de cliente de Google Cloud Console.
- `PUBLIC_WEB_URL`: `https://taller-web.azurewebsites.net`  
  *(Debe ser la URL pública del frontend Next.js, no de la API, para que la redirección tras el inicio de sesión fije la cookie en el dominio que ve el usuario).*

> [!TIP]
> **Modo Pruebas (sin Google):** Si necesitas probar el sistema en Azure o localmente sin configurar Google OAuth:
> - Configura en la API: `NODE_ENV=test`
> - Configura en la Web: `NEXT_PUBLIC_ACCESO_PRUEBAS=1`
> Esto activará botones de acceso rápido directo en `/login` para entrar con roles de Cliente, Mecánico, Jefe o Dueño.

---

## 3. Preparación de Recursos en Azure

Para desplegar la aplicación completa necesitarás:

1. **Grupo de recursos**: ej. `rg-tallerpro` (en la región más cercana, ej. `West Europe` o `Spain Central`).
2. **Azure Database for PostgreSQL (Flexible Server)**:
   - Versión 16.
   - Crea la base de datos `taller`.
   - En *Seguridad de red*, permite el acceso a servicios de Azure (*Allow public access from any Azure service within Azure to this server*).
   - Copia la cadena de conexión:
     `postgresql://<usuario>:<password>@<servidor>.postgres.database.azure.com:5432/taller?sslmode=require`
3. **Azure App Service Plan**:
   - Sistema Operativo: **Linux**.
   - Nivel: **B1** (Basic) o superior (los planes gratuitos no permiten websockets ni Always On).
4. **Dos Web Apps (App Services)** en dicho plan:
   - **API Web App**: ej. `taller-api` (Runtime: Node 22 LTS).
   - **Web Web App**: ej. `taller-web` (Runtime: Node 22 LTS).

---

## 3. Configuración de Variables de Entorno en Azure App Service

Ve a cada Web App en Azure Portal > **Configuración / Variables de entorno** (*Application settings*):

### En `taller-api` (Backend Express):
| Nombre | Valor de Ejemplo | Descripción |
|---|---|---|
| `DATABASE_URL` | `postgresql://...` | Conexión con PostgreSQL en Azure |
| `JWT_SECRET` | *(clave aleatoria de 32+ caracteres)* | Secreto para firmar cookies JWT |
| `OWNER_EMAIL` | `dueno@taller.es` | Email del dueño para avisos |
| `GOOGLE_CLIENT_ID` | `...` | OAuth 2.0 de Google (opcional) |
| `GOOGLE_CLIENT_SECRET` | `...` | OAuth 2.0 de Google (opcional) |
| `PUBLIC_WEB_URL` | `https://taller-web.azurewebsites.net` | Dominio público del frontend |
| `SMTP_HOST` | `smtp.sendgrid.net` | Servidor SMTP |
| `SMTP_PORT` | `587` | Puerto SMTP (587 o 465) |
| `SMTP_SECURE` | `false` | `true` si es puerto 465 |
| `SMTP_USER` | `apikey` | Usuario SMTP |
| `SMTP_PASS` | `...` | Contraseña o API Key SMTP |
| `SMTP_FROM` | `TallerPro <no-responder@taller.es>` | Remitente de los 31 correos |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `false` | La compilación la realiza GitHub Actions |

### En `taller-web` (Frontend Next.js):
| Nombre | Valor de Ejemplo | Descripción |
|---|---|---|
| `API_INTERNAL_URL` | `https://taller-api.azurewebsites.net` | Destino al que se reenvía `/api/*` |
| `PORT` | `3000` | Puerto en el que escucha Next.js |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `false` | La compilación la realiza GitHub Actions |

---

## 4. Configuración de Secretos en GitHub

En tu repositorio de GitHub, ve a **Settings > Secrets and variables > Actions**:

### Secretos del repositorio (*Repository secrets*)
1. `AZURE_API_PUBLISH_PROFILE`:
   - En Azure Portal, abre la Web App de la API (`taller-api`).
   - Pulsa el botón **Obtener perfil de publicación** (*Get publish profile*) en la barra superior.
   - Abre el archivo `.PublishSettings` descargado con un editor de texto, copia todo el XML y pégalo como valor de este secreto.
2. `AZURE_WEB_PUBLISH_PROFILE`:
   - Descarga el perfil de publicación de la Web App del frontend (`taller-web`) y pégalo aquí.
3. `DATABASE_URL`:
   - La cadena de conexión a tu base de datos Azure PostgreSQL (`postgresql://...`). Permite a GitHub Actions ejecutar `prisma migrate deploy` automáticamente en cada despliegue.

### Variables del repositorio (*Repository variables*)
*(Pestaña Variables al lado de Secrets)*:
- `AZURE_API_APP_NAME`: Nombre de la Web App de la API (ej. `taller-api`).
- `AZURE_WEB_APP_NAME`: Nombre de la Web App de la Web (ej. `taller-web`).
- `API_INTERNAL_URL`: URL pública o interna de la API (ej. `https://taller-api.azurewebsites.net`).

---

## 5. Flujos de Trabajo de GitHub Actions

El repositorio incluye dos flujos en `.github/workflows/`:

1. [`.github/workflows/deploy-azure.yml`](file:///.github/workflows/deploy-azure.yml) *(Principal)*:
   - Se activa automáticamente al hacer **push a `main`** o manualmente con **Run workflow**.
   - Instala dependencias con `npm ci`.
   - Genera el cliente de Prisma y compila tanto API como Next.js Standalone.
   - Si `DATABASE_URL` está configurado en secrets, ejecuta las migraciones pendientes en PostgreSQL.
   - Despliega los artefactos listos para producción en las dos Web Apps de Azure mediante la acción oficial `azure/webapps-deploy@v3`.

2. [`.github/workflows/deploy-azure-containers.yml`](file:///.github/workflows/deploy-azure-containers.yml) *(Opcional / Contenedores)*:
   - Permite compilar y publicar imágenes Docker de la API y la Web a GitHub Container Registry (`ghcr.io`) y desplegarlas en Azure Container Apps o App Service for Containers.
