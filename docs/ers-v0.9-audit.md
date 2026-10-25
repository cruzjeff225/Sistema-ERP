# Mini ERP: auditoria ERS v0.9

Fecha: 2026-09-24. Fuente: `C:/Users/chica/Desktop/MiniERP ERS v0.9.pdf`, 103 paginas, y lineamientos del usuario. Esta matriz distingue implementacion observada de verificacion integral; no certifica cumplimiento total por existencia de pantallas.

Actualización del 4 de octubre de 2026: a petición del usuario se habilitó nuevamente Clientes dentro de Ventas. La decisión reemplaza la exclusión de Clientes descrita en las etapas históricas de este documento. El alcance y la verificación actuales se documentan en [Ventas y clientes](ventas-clientes.md); las cotizaciones de venta, ventas y devoluciones siguen pendientes.

## Matriz inicial

| Requerimiento ERS | Existe | Parcial | No existe | Problema / evidencia |
| --- | --- | --- | --- | --- |
| Alcance de ocho modulos | | X | | AppModule y navegacion habilitan Clientes; BusinessModule antiguo no esta registrado. Conservar tablas sin ofrecer procesos futuros. |
| Usuarios, roles N:M y permisos via roles | X | | | Prisma UserRole y RolePermission con UNIQUE compuesto; guards globales y DTOs. Pruebas de seguridad existentes pendientes de repetir. |
| Login activo, Argon2id, bloqueo a cinco intentos | X | | | AuthService y password-security. Revisar carreras de login correcto/fallido y cambio de clave propio. |
| Cambio propio y restablecimiento de clave | | X | | Existe restablecimiento administrativo; falta flujo propio con clave actual independiente de permiso administrativo. |
| Roles duplicar / eliminar no asignado | X | | | RolesService; verificaciones existentes. |
| Permisos CRUD y no eliminar asignados | X | | | PermissionsService; catalogos sin paginacion y validaciones parciales de null. |
| Bitacora JSON antes/despues, actor, transaccion | | X | | AuditService compartido; operaciones principales transaccionales; no hay saneamiento central de secretos. ModulesService no usa auditoria. |
| Bitacora solo lectura, filtros y comparacion | X | | | AuditController GET, QueryLogsDto, AuditView. Dashboard devuelve logs completos sin exigir logs.view. |
| Empresas NIT/NRC y geografia valida | X | | | Constraints en Prisma; OrganizationService valida jerarquia geografica. |
| Logo valido | | X | | DTO acepta data URI por expresion regular; falta validar contenido binario real. |
| Sucursales por empresa / almacenes / ubicaciones | X | | | FKs, nombres y coordenadas unicos; capacidad positiva; restricciones de existencias heredadas. Revisar cambios de padre con historial. |
| Proveedores y contactos | X | | | CRUD logico, filtros, contactos y auditoria. Listados sin paginacion de servidor. |
| Proveedor inactivo bloqueado en nuevas compras | | X | | Alta de cotizacion valida estado; recepcion y transiciones no lo revalidan. |
| Productos, unidades tipadas, imagenes | | X | | Relaciones y CRUD existentes. SKU unico solo por empresa, distinto de RN-PRO-004 (global). Cambio de padre de subcategoria puede invalidar productos existentes. |
| Solicitudes y aprobacion | X | | | DTOs, workflow, unidades purchase, relaciones y auditoria. Estado extra partially_ordered debe documentarse. |
| Cotizaciones multisolicitud y detalle origen | X | | | Tablas puente conservadas; comparacion y seleccion manual. |
| Pantalla importante de comparacion | | X | | Dialogo dentro de solicitudes; falta acceso directo y navegacion dedicada. |
| Ordenes, aprobacion, gastos y documentos | | X | | Funciona cadena; gastos modificables con permiso de orden sin comprobar permisos especificos de gastos. |
| Gastos >= 0 | | X | | DTO y UI exigen 0.01, mas restrictivo que RN-COM-019. |
| Recepcion parcial ligada a orden/detalle | | X | | API recibe parcialmente; esquema legacy purchase_items no conserva todos los campos fiscales del detalle ERS. |
| Consulta/actualizacion/cancelacion/cierre de compras | | X | | Consulta a traves de retaceos y ordenes. Faltan endpoints y pantalla propios de compras. |
| Retaceo proporcional, sin IVA, inmutable cerrado | X | | | allocateCost reconcilia centavos por restos mayores; estados y permisos coinciden con pp.92-93. Repetir caso ERS. |
| Inventario solo preparado | | X | | receiveOrder modifica stocks y close retaceo sobrescribe costo maestro, contrario a 6.8.46 y ejemplo paso 9. |
| Trazabilidad navegable completa | | X | | FKs presentes; faltan accesos bidireccionales y detalle completo desde recepcion. |
| Prisma/migraciones/seed | | X | | Migraciones existentes; seed habilita Clientes; revisar drift y duplicados antes de UNIQUE global. |
| Paginacion y estados UX | | X | | Usuarios/bitacora paginan; otros listados completos. Formularios y errores presentes, permisos de catalogos requieren prueba por perfil. |
| Verificacion integral actual | | X | | Hay scripts de usuarios, roles, modulos y compras; deben ampliarse al alcance nuevo y ejecutarse nuevamente. |

## Plan por dependencias

1. Limitar modulos expuestos y efectos de inventario sin borrar datos historicos.
2. Reforzar auditoria, autorizacion y validaciones de relaciones.
3. Migrar restricciones y detalle de recepcion, previa inspeccion de datos existentes; nunca inventar origen para compras legacy.
4. Completar cambio de clave propio, compras/recepciones y gastos con permisos ERS.
5. Navegacion por secciones, comparacion y trazabilidad; paginacion coordinada API/UI.
6. Compilar cada etapa, verificar Prisma y ejecutar pruebas aisladas, incluido caso ERS; revisar UI.

## Interpretaciones y diferencias

- Inventario aparece en diagramas generales (pp.64,94), pero 6.8.3 y 6.8.46 lo dejan preparado para integracion posterior. Prioridad a alcance especifico: recepciones registran cantidades sin alterar existencias; retaceo conserva costo real sin asignar precios ni valorar inventario.
- Estados de compra son recomendados (p.79); no inventar transiciones que destruyan historia. Los nombres legacy se conservan hasta migracion explicita.
- RN-PRO-004 exige SKU unico en el sistema, mientras el modelo previo era unico por empresa. No renombrar SKU existentes automaticamente: comprobar colisiones antes de migrar.
- 6.8.30 define subtotal de orden neto de descuento; implementacion previa usa subtotal bruto y descuento separado. Total puede coincidir, pero contrato y UI necesitan alineacion coordinada.
- Codigos PR-00042/OC-00025/RTC-00233 del ejemplo son ilustrativos; pruebas deben usar secuencias reales sin sobrescribir documentos existentes.
- Gastos de cotizacion/orden son dinamicos. Flete/gastos/DAI del encabezado de retaceo son campos expresamente requeridos, no contradicen el catalogo dinamico.
- Ejemplo: 50,000 + 5,780 + 5,125 + 1,500 + 8,927 = 71,332. Distribucion por gasto y restos mayores produce 63,940.48 y 7,391.52; IVA excluido.

## Registro de etapas

### Etapa verificada: proceso de compras

Enfoque solicitado: ultimos modulos de compras, sin ampliar procesos de versiones futuras.

- Recepciones/compras: listado paginado con busqueda y estado, consulta, correccion de factura/notas antes de verificacion, verificacion, cierre y cancelacion con motivo. Una cancelacion restituye cantidades pendientes de la orden una sola vez; no se permite con retaceo vigente ni despues del cierre.
- Comparacion: pantalla dedicada por solicitud, disponibilidad, precios, descuentos, plazo, vigencia, condiciones y seleccion manual. Opciones y documentos filtrados por empresa.
- Tipos de gastos: pantalla de registro, consulta, busqueda, edicion, activacion y desactivacion con confirmacion y permisos existentes. Gastos de importe cero admitidos segun ERS.
- Ordenes/recepciones: proveedor activo revalidado; generacion de orden revalida productos, unidades y tipos de gasto. Recepciones parciales conservan importes y bloquean sobre-recepcion concurrente.
- Retaceo: distribucion exacta de centavos, exclusion del IVA, estados controlados, cierre inmutable. Compras cerradas/canceladas no aparecen entre candidatas. No modifica existencias ni costo maestro del producto, conforme al alcance v0.9.
- Trazabilidad: desde recepcion se navega a orden, cotizacion, solicitud y retaceo. Creacion de compra y costeo quedan auditados con actor dentro de la transaccion.

Endpoints nuevos principales: `GET /api/purchases`, `GET/PATCH /api/purchases/:id`, `POST /api/purchases/:id/verify|close|cancel`, `GET /api/purchase-requests/comparison-options`. Se mantienen las APIs de solicitudes, cotizaciones, ordenes, tipos de gasto, documentos y retaceos existentes.

Permisos utilizados: `purchases.view/update/cancel/close`, `purchase_quotations.view/select`, `expense_types.view/create/update/activate/deactivate`. La verificacion utiliza `purchases.update`; no se inventa permiso adicional. No se certifica aun toda la matriz RBAC con perfiles restringidos.

### Base de datos y alcance

Migracion aplicada: `20260925003000_ers_v09_scope`. Agrega UNIQUE global de SKU y codigo interno, previa comprobacion de colisiones, y deshabilita modulos/permisos fuera del alcance sin borrar datos. Prisma Client regenerado. El seed preserva registros historicos al deshabilitar modulos; no se ejecuto un reseed global.

Clientes deja de estar registrado como API y ruta funcional. Retaceo e inventario quedan separados. Tambien se reforzo el saneamiento central de secretos de auditoria y se agrego cambio de clave propio; este ultimo compila, pero queda pendiente de prueba funcional especifica.

### Evidencia ejecutada

- Backend: `nest build`, sin errores.
- Frontend: `vue-tsc -b`, sin errores; `vite build`, exitoso (aviso no bloqueante sobre importacion dinamica de auth.store).
- Prisma: `migrate status`, 14 migraciones, base al dia.
- `verify-purchase-regressions.ts`: PASS 14 grupos, incluido reparto monetario en 52 escenarios, catalogo de gastos, flujos parciales/concurrentes, aislamiento, documentos autenticados, estados y trazabilidad. Fixtures creados en empresa de prueba y limpiados al finalizar.
- Caso ERS: FOB 55,780 + flete 5,125 + gastos 1,500 + DAI 8,927 = 71,332. Costos finales 63,940.48 y 7,391.52; IVA 9,273.16 excluido. Confirmados por API y base de datos.
- Navegador: comparacion y recepciones en movil; catalogo de gastos en escritorio; apertura de detalle con enlaces de trazabilidad y busqueda sin resultados. Sin modificar documentos existentes desde estas pruebas visuales.
- `git diff --check`: sin errores de espacios; avisos normales LF/CRLF del entorno Windows.

### Pendientes v0.9 (no certificados)

- Gastos siguen dentro de cotizaciones/ordenes: falta pantalla independiente de gastos y reforzar permisos especificos al modificar gastos anidados.
- Alinear subtotal neto de orden con 6.8.30 mediante cambio coordinado de contrato, persistencia y UI; los totales actuales si se reconcilian en pruebas.
- Completar snapshot fiscal de detalle de recepcion (modelo legacy purchase_items), sin inventar datos historicos.
- Extender paginacion de servidor al resto de listados de compras.
- Ejecutar matriz completa con usuarios de permisos restringidos y pruebas UI de escritura por cada perfil.
- La matriz inicial conserva otras brechas de auditoria general fuera del enfoque actual. No constituye certificacion del 100% del ERP.

Inventario operativo, kardex, ventas, cuentas por pagar y contabilidad siguen fuera de esta implementacion; pertenecen a versiones posteriores.
