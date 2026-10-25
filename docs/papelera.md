# Papelera recuperable

La papelera está en **Administración → Configuración → Papelera**. Se puede buscar por nombre o código, filtrar por módulo y restaurar cada registro hasta 30 días después de su eliminación. La fecha límite y los días restantes aparecen en cada elemento.

**Eliminar registros** permite buscar los registros de un módulo y enviarlos a la papelera. Las pantallas de solicitudes, cotizaciones, órdenes, recepciones, retaceos, productos y proveedores incluyen la acción en **Más acciones**. Usuarios, organización y tipos de gasto tienen un botón de papelera en sus filas.

## Qué ocurre al eliminar

- El documento desaparece de su lista de gestión y sus endpoints de edición dejan de estar disponibles.
- Conserva el mismo ID, contenido, relaciones y estado del proceso. Eliminar no equivale a cancelar.
- Las cantidades compradas, recibidas y distribuidas, las existencias, los movimientos y el costo aplicado por un retaceo cerrado se conservan.
- Los adjuntos e imágenes se mantienen para permitir la recuperación durante el plazo.
- Los registros con estado activo se desactivan temporalmente. Restaurar recupera su estado original, incluso si ya estaban inactivos antes de eliminarse.
- No se habilita repetir un retaceo o comprar otra vez cantidades ya comprometidas por el hecho de esconder un documento.

## Recuperación y vencimiento

Restaurar devuelve el registro a su módulo con sus relaciones originales. Si su registro de origen también está en la papelera, primero se debe recuperar el origen.

A partir del momento exacto en que vencen los 30 días, el registro deja de ser recuperable. La depuración se ejecuta al iniciar el backend y cada hora, por lotes de 100. Los registros sin referencias se eliminan físicamente. Los documentos que sostienen relaciones históricas se mantienen como registros eliminados y no recuperables para evitar alterar movimientos, costos o trazabilidad. La consulta de referencias incluye las restricciones de la base de datos, incluso las que podrían provocar eliminaciones en cascada o desvincular documentos.

## Alcance y acceso

Incluye usuarios, empleados asociados, roles, permisos, módulos de permisos, sucursales, almacenes, espacios, categorías, subcategorías, unidades, proveedores, contactos, productos, imágenes, asociaciones con proveedores, solicitudes, cotizaciones, órdenes, recepciones, retaceos, tipos y gastos reales, adjuntos de gastos, traslados y gestiones/solicitudes de cotización a proveedores.

Las existencias y la bitácora de movimientos se conservan como historial. La empresa configurada, la cuenta propia desde la sesión activa, el rol superadmin y los controles de recuperación de la papelera están protegidos para mantener el acceso. Se conserva al menos un superadministrador.

Los permisos son `trash.view`, `trash.delete` y `trash.restore`. Las migraciones los asignan a los roles admin y superadmin. Los cambios sobre cuentas, roles, permisos y módulos invalidan las sesiones afectadas. Se registra una entrada de auditoría por eliminación y recuperación sin guardar contraseñas ni tokens en la papelera.

## Eliminación definitiva manual

Cada fila permite **Eliminar definitivamente**. **Vaciar papelera** prepara todos los registros recuperables de la empresa activa, incluso los que no aparecen en la página o filtro actual, y solicita confirmación indicando el número exacto. El servidor elimina únicamente los IDs incluidos en esa confirmación; un registro enviado a la papelera después queda disponible. Se admiten hasta 1000 registros por operación.

El permiso independiente `trash.purge` está asignado a admin y superadmin; enviar a papelera no concede eliminación definitiva. El backend exige confirmación, empresa correcta y registros todavía eliminados. Las operaciones repetidas no duplican auditoría y un registro restaurado no se elimina. La operación es transaccional y cada eliminación queda registrada como `PURGE`.

Los registros sin referencias se eliminan físicamente de la base. Los que sostienen historial, movimientos, costos o relaciones se conservan como eliminados no recuperables, igual que en la depuración por vencimiento. Se borra el estado de recuperación, se conserva la auditoría y no se cancelan movimientos. Las relaciones de la base se comprueban bajo bloqueo del registro para evitar cascadas por inserciones simultáneas. Esta opción no ejecuta una limpieza de archivos huérfanos del disco.

Las eliminaciones anteriores que no generaron una entrada de papelera no se incorporan automáticamente a este nuevo historial.

## Verificación

- `npm run verify:trash`: plazo, aislamiento por empresa, recuperación del mismo ID y estado, relaciones, duplicación de clics, permisos, revocación de sesiones y vencimiento con inventario conservado.
- `npm run verify:supply`: flujo completo y eliminación/recuperación de solicitudes, ofertas, órdenes, recepciones, retaceos, traslados y adjuntos; verifica cantidades, movimientos y costos sin duplicaciones.
- Compilación de Nest y comprobación de tipos y build de Vue.

Las pruebas usan registros propios temporales y los limpian al terminar.
