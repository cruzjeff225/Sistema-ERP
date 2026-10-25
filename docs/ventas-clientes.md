# Ventas y directorio de clientes

Etapa implementada el 4 de octubre de 2026, según la elección del usuario: mejorar primero Clientes y la organización de Ventas.

La base funcional es `C:/Users/chica/Desktop/MiniERP ERS v0.9.pdf`: el alcance general incluye clientes y ventas (p. 5), el perfil Vendedor gestiona clientes (p. 7) y las reglas generales exigen auditoría y eliminación lógica sin perder historia (p. 9). El documento detalla principalmente los procesos de Compras. Esta etapa habilita el directorio; las cotizaciones de venta, ventas y devoluciones requieren su implementación posterior.

## Acceso y uso

- **Ventas → Clientes**, desde el menú lateral. Ventas usa el mismo diseño de accesos de Operaciones, Compras y Configuración.
- Clientes abre el directorio de **Activos**. **Todos** e **Inactivos** cambian el estado consultado; la búsqueda acepta nombre, documento, teléfono o correo. El servidor devuelve páginas de 25 registros.
- La ficha muestra identificación, contacto y ubicación. **Nuevo cliente** y **Editar cliente** abren un formulario lateral. Nombre y país son obligatorios; para El Salvador también se requiere departamento, municipio y distrito. Documento, teléfono, correo y dirección son opcionales y se pueden limpiar al editar.
- **Más acciones** permite activar/desactivar con el permiso específico o enviar a la papelera. Desactivar conserva los datos. La recuperación se realiza en **Configuración → Papelera**, durante 30 días, con el mismo identificador, estado anterior y relaciones históricas.
- Cerrar un formulario modificado o cambiar de ruta permite conservarlo o confirmar el descarte. Cambiar de empresa limpia el contexto; las consultas y escrituras capturan la empresa de origen y las respuestas tardías no alteran otro contexto, incluso después de A → B → A.

El directorio conserva ambos temas existentes. No aplica el filtro semanal de documentos de Compras: los clientes se consultan por estado y búsqueda, independientemente de la fecha de alta.

## API y permisos

`GET /api/customers` acepta `page`, `limit` (1–100), `search` (hasta 100 caracteres) y `status=active|inactive|all`. Devuelve `data: { items, total, page, totalPages }`. La vista envía `status=active`; el valor por defecto de la API es `all`.

Se mantienen `GET /api/customers/:id`, `POST /api/customers`, `PATCH /api/customers/:id` y `PATCH /api/customers/:id/status`. Las consultas excluyen registros en la papelera y respetan la empresa. Las escrituras y su auditoría comparten una transacción y el bloqueo usado por la papelera. Un documento duplicado devuelve un conflicto legible, incluyendo cuando pertenece a un cliente recuperable.

Permisos: `customers.view/create/update/activate/deactivate`. La papelera usa `trash.delete/view/restore`. Las cuentas de consulta no cargan catálogos del editor ni muestran acciones de modificación. Los permisos de otros roles se asignan desde Configuración.

`backend/scripts/enable-customers.ts` habilita únicamente el módulo y sus cinco permisos en instalaciones existentes, asignándolos al rol superadmin. Ya fue ejecutado en la base local; no se hizo un reseed ni se modificaron clientes o roles ajenos. El seed también conserva habilitado Clientes para nuevas instalaciones. No hubo cambios de esquema para esta etapa.

La ruta anterior `/customers` redirige a `/sales/customers`; la entrada de Ventas está en `/sales`.

## Verificación

- TypeScript del backend y frontend, y compilación de Vite.
- 68 pruebas del frontend, incluidas tres sobre campos opcionales, cambio a país extranjero y ubicación obligatoria.
- `backend/scripts/verify-customers.ts`: rutas HTTP, autenticación y validación; alta, edición, desactivación, duplicados, aislamiento, búsqueda paginada, auditoría y papelera. Los clientes ficticios, sus entradas de papelera y eventos de auditoría se crean dentro de una transacción revertida al finalizar.
- Revisión del código ejecutado de la vista: permisos de consulta, activación específica, descarte/cancelación, empresa capturada y respuestas tardías. Renderizado de HTML con perfiles de consulta y edición, sin navegador.

No se realizó revisión visual en navegador para esta etapa.
