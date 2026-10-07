# Despliegue y operación de Apex ERP

El frontend y la API se publican bajo un mismo dominio HTTPS. El archivo `deploy/compose.production.yaml` prepara PostgreSQL, migraciones, API y frontend; no publica el ERP en Internet por sí solo. Mantenga separados los entornos de trabajo, prueba y producción.

## Antes del primer arranque

1. Defina el servidor y dominio real, DNS y certificado TLS. Configure un proxy HTTPS que reenvíe a `127.0.0.1:8080`, conserve `Host` y envíe `X-Forwarded-Proto` y `X-Forwarded-For`. No exponga PostgreSQL ni la API directamente.
2. Copie `deploy/.env.production.example` a `deploy/.env.production`. Reemplace todos los valores `CHANGE_ME`; use contraseñas aleatorias distintas para la base y secretos JWT distintos de al menos 48 caracteres. Las contraseñas de conexión deben usar caracteres seguros para una URL o codificarse. No suba este archivo al repositorio.
3. Configure `FRONTEND_URL` con el origen HTTPS real, sin ruta. `TRUST_PROXY_HOPS=2` corresponde al proxy HTTPS y Nginx de este despliegue; ajústelo si cambia la topología.
4. Sustituya los contactos de referencia de proveedores y el correo `erp.local` de la empresa por datos comerciales reales. Compruebe los permisos de Sucursales, Compras, Gerencia y Bodega con sus usuarios reales. Cambie las credenciales iniciales antes de habilitar el acceso.
5. Respalde y restaure la base y `backend/uploads` en el entorno nuevo. El volumen de archivos debe conservar fotos y comprobantes. No ejecute `reset-purchase-inventory`, `demo:supply`, `prepare-purchase-base` ni una semilla sobre la base de operación.

## Instalación con Docker

Ejecute desde la raíz del repositorio, utilizando siempre el mismo nombre de proyecto:

```powershell
docker compose --env-file deploy/.env.production -p apex-production -f deploy/compose.production.yaml config --quiet
docker compose --env-file deploy/.env.production -p apex-production -f deploy/compose.production.yaml build
docker compose --env-file deploy/.env.production -p apex-production -f deploy/compose.production.yaml up -d --wait --wait-timeout 180 database
```

La restauración se hace **antes** de arrancar las migraciones y exclusivamente en la base nueva. Copie un respaldo PostgreSQL en formato personalizado al contenedor `database` y restáurelo con `pg_restore --username erp_owner --dbname erp_db --no-owner --no-privileges --exit-on-error`. No use `--clean` sobre una base operativa. La restauración con el propietario `erp_owner` conserva los permisos de acceso a tablas para el usuario limitado `erp_app`.

Después de restaurar la base, copie el contenido de `backend/uploads` al volumen `uploads` montado en `/app/uploads`, conservando su estructura y asegurando que sea escribible por el usuario `node`. No continúe si faltan los archivos de comprobantes referenciados en la base. Para una instalación nueva sin datos existentes, prepare usuarios y catálogos en un entorno controlado; las migraciones no crean un usuario administrador automáticamente.

```powershell
docker compose --env-file deploy/.env.production -p apex-production -f deploy/compose.production.yaml up -d --wait --wait-timeout 180
docker compose --env-file deploy/.env.production -p apex-production -f deploy/compose.production.yaml ps
```

Las migraciones se ejecutan con el propietario; la API utiliza `erp_app`, sin permisos de crear tablas, roles o bases. API y Nginx corren sin privilegios y con su sistema de archivos de solo lectura, salvo archivos adjuntos y temporales. PostgreSQL 18 utiliza el volumen `/var/lib/postgresql`; no monte allí directamente el directorio de datos de otra versión. La migración desde PostgreSQL 16 se hace mediante respaldo y restauración, conservando la instancia original hasta validar la nueva.

## Comprobaciones antes de habilitar usuarios

- Compruebe `/healthz`, `/api/health` y `/api/health/ready` mediante el dominio HTTPS. La última ruta confirma acceso a la base.
- Inicie sesión, renueve sesión y cierre sesión. La cookie de renovación debe tener `Secure`, `HttpOnly` y `SameSite=Lax`. Swagger no se publica en producción.
- Revise los catálogos y el centro general, abra una solicitud existente, una cotización y una orden, y descargue el PDF específico de cada proveedor. Verifique imágenes y comprobantes con usuarios autorizados.
- Compruebe que Gerencia puede revisar cantidades antes de pedir precios y aprobar, rechazar o devolver la compra elegida, conservando el historial.
- No haga pruebas ficticias permanentes en producción. `verify:purchase-approval` y `verify:supply-edges` ejercitan los procesos mediante transacciones que se revierten, pero deben ejecutarse preferentemente sobre una copia de prueba. Los valores de secuencias pueden avanzar aun al revertir una transacción.

En el entorno de trabajo, las comprobaciones disponibles son:

```powershell
cd backend
pnpm install --frozen-lockfile
pnpm exec prisma generate
pnpm run build
pnpm run test:supply
pnpm run test:production
pnpm run verify:production
cd ../frontend
pnpm install --frozen-lockfile
pnpm run build
```

`verify:production` es de solo lectura y genera `backend/tmp/production-qa/readiness.json`. Ejecútelo desde `backend` después de compilar ambos proyectos; agregue `--require-production` para exigir las variables del despliegue. No declara el sistema listo si hay migraciones pendientes, falta el centro general o permanecen contactos de referencia.

## Respaldos, actualizaciones y recuperación

Antes de cada actualización, guarde un respaldo PostgreSQL en formato personalizado y una copia de los archivos adjuntos en un destino separado del servidor. Detenga temporalmente las escrituras al tomar ambos respaldos para mantener su correspondencia. Proteja los respaldos y compruebe periódicamente una restauración aislada; un respaldo sin prueba de restauración no constituye evidencia de recuperación.

Para actualizar, conserve el archivo privado de configuración y los volúmenes, asigne un `ERP_RELEASE` nuevo, reconstruya y ejecute `up -d --wait`. Compruebe las migraciones y la disponibilidad antes de reabrir la operación. No ejecute `down --volumes` en producción. Volver a la imagen anterior solo es válido si su esquema sigue siendo compatible; de lo contrario, restaure base y adjuntos juntos en un entorno separado y valide antes de cambiar el servicio.

Revise registros con `docker compose ... logs --tail 100 backend migrate`. No comparta archivos `.env`, tokens o respaldos. El borrado lógico conserva movimientos; la papelera permite recuperación durante 30 días según las reglas del sistema y no sustituye el respaldo.

## Alternativa Windows

Use Node.js 24, pnpm 11.19.0 y PostgreSQL con usuarios separados para migraciones y API. Compile ambos proyectos, copie los recursos de `dist/src/assets/pdf` y ejecute `node dist/src/main.js` como servicio con reinicio automático. Sirva `frontend/dist` con un proxy que implemente las reglas de `frontend/nginx.conf`, incluyendo `/api`, imágenes, fallback de rutas y protección de comprobantes. Configure HTTPS, variables de producción y respaldo de `backend/uploads`. No utilice Vite ni `nest start --watch` como servidores de producción.

## Alcance de la preparación

Se han preparado archivos de despliegue y controles de arranque; el dominio, TLS, servidor definitivo, contactos comerciales y política de respaldo necesitan los datos y la infraestructura reales. La verificación automática de dependencias comprueba avisos conocidos en el momento de ejecutarse; repítala antes de publicar una nueva versión.
