# Verificación del PDF y despliegue — 6 de octubre de 2026

## Resultado

La preparación técnica fue comprobada mediante compilaciones, pruebas y arranque con configuración de producción sobre una copia aislada de la base de trabajo. El sistema no se publicó en un servidor externo. Para habilitarlo a usuarios reales faltan el servidor y dominio HTTPS definitivos, la sustitución de contactos de referencia y el respaldo operativo de base y adjuntos.

## PDF para proveedores

- PDF generado desde la API de producción, con la solicitud existente `SC-70D02572`, dirigida a Distribuidora de Techos del Norte: dos productos y sus cantidades, sin ofertas ajenas ni precios inventados.
- Logo suministrado, colores corporativos, tipografía incrustada, fecha de emisión de la solicitud en El Salvador, destinatario, códigos, unidades y condiciones requeridas para la respuesta.
- Revisión visual de la página real y de las siete páginas de una solicitud de 45 productos largos, incluyendo una cantidad de 9,999,999,999.99. No se observaron cortes, superposiciones ni páginas vacías; encabezados y números de página se repiten correctamente.
- Pruebas de extracción de texto comprueban todos los productos, márgenes y cantidades. La generación rechaza listas vacías y cantidades no positivas.

## Pruebas y compilaciones

| Comprobación | Resultado |
| --- | --- |
| Backend: permisos, comparación, gastos, PDF y configuración de producción | 32 pruebas aprobadas |
| Frontend: formularios, comparación, revisión, recepción, inventario y navegación | 87 pruebas aprobadas |
| Backend: Prisma, TypeScript y recursos del PDF | Compilado |
| Frontend: comprobación de tipos y Vite | Compilado |
| Imágenes Docker: API y frontend | Construidas y arrancadas |
| Dependencias de producción de ambos proyectos | Sin avisos de vulnerabilidad reportados por la auditoría ejecutada |

La revisión visual se concentró en el PDF. La interfaz web se verificó mediante compilación, pruebas de componentes y comprobaciones HTTP; este registro no afirma una revisión visual completa de todas las pantallas en navegador.

## Flujo de compras sobre la copia aislada

Se ejecutaron los scripts compilados `verify-purchase-approval` y `verify-supply-edge-cases` dentro del contenedor de producción, conectado como `erp_app`, con transacciones revertidas al terminar.

1. Solicitudes en borrador y enviadas desde dos sucursales; consolidación de 4 + 6 sin cambiar originales.
2. Revisión previa de Gerencia: comprar más, menos y agregar un producto; motivo, responsable y revisión obsoleta bloqueada. No se permite alterar cantidades después de solicitar precios.
3. Ofertas incompletas y disponibilidad cero detectadas; selección completa o por producto; comparación que incluye gastos fijos por proveedor.
4. Generación de una orden por proveedor, pendientes de aprobación, reintentos sin duplicados ni cambios de inventario. Gerencia aprueba, rechaza o devuelve; la revisión final no permite editar la oferta del proveedor.
5. Recepción en el centro general, sin ocupar espacios sugeridos; viñeteado y ubicación confirmada, operación repetida sin duplicar existencias.
6. Gastos reales diferenciados de previstos, retaceo exacto por centavos y sin doble contabilización; documentos cerrados inmutables y cancelaciones con reversión correcta.
7. Distribución parcial a sucursal vinculada a la solicitud, con cantidades solicitada, propuesta, comprada, recibida y distribuida independientes y saldo pendiente.
8. Recepción sin espacios disponibles permanece pendiente; cancelación restaura stock y saldo de la orden sin permitir otra reversión repetida.

## Base y seguridad del despliegue

- Se respaldó la base PostgreSQL 16 de trabajo y se restauró en PostgreSQL 18 aislado. Las 25 migraciones estaban aplicadas; el arranque de migraciones terminó correctamente.
- La API usa un usuario sin superusuario, creación de tablas, bases, roles o evasión de políticas de filas. API y frontend corren sin privilegios y con raíz de solo lectura.
- Se comprobaron salud y conexión a base, autenticación, cookie `Secure`/`HttpOnly`/`SameSite=Lax`, CORS limitado al origen configurado y ausencia de Swagger en producción.
- Se verificaron el frontend compilado, carga de recursos, rutas internas, `404` para recursos inexistentes y acceso bloqueado a comprobantes mediante su ruta pública. API y PDF no se almacenan en caché.
- La comparación de los registros completos de diez entidades confirmó que las operaciones restauradas permanecieron idénticas tras las pruebas. Una comprobación independiente confirmó que la base original tampoco cambió sus operaciones.

Las operaciones conservadas fueron: 1 solicitud, 1 proceso de compra, 2 solicitudes de cotización, 2 ofertas, 1 orden, 1 recepción, 1 retaceo, 0 traslados, 2 registros de existencias y 2 movimientos. Las pruebas no insertaron operaciones permanentes en la base de trabajo.

El proyecto temporal de Docker se retiró al finalizar, incluidos sus volúmenes de prueba, comprobando previamente su identidad. La instancia original no se eliminó; los informes y el respaldo permanecen en la carpeta local ignorada `backend/tmp/production-qa`.

## Pendientes concretos

`verify:production` detectó únicamente datos comerciales de referencia: cuatro proveedores con contactos `example.com` y el correo `ApexRoofing@erp.local` de la empresa. No se reemplazaron por datos inventados. El entorno local conserva su configuración de desarrollo. El dominio, TLS, servidor final, credenciales de usuarios reales y política de respaldo deben completarse antes de habilitar producción.

La guía reproducible está en `docs/despliegue-produccion.md` y los archivos de despliegue en `deploy/`. El aviso de deprecación de consultas concurrentes de PostgreSQL observado en algunas comprobaciones no hizo fallar las pruebas; conviene revisarlo antes de una futura actualización a pg 9.

La revisión automática de permisos bloqueó el reinicio del backend local con “blocked by policy”, sin un motivo más específico. Los cambios están compilados y probados en el contenedor aislado; la instancia local abierta conserva su proceso anterior hasta reiniciarlo manualmente.
