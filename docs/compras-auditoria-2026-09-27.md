# Auditoria de Compras contra ERS v0.9

## Alcance y fuentes

Revision previa a las correcciones solicitadas el 2026-09-27. Fuente primaria: `C:/Users/chica/Desktop/MiniERP ERS v0.9.pdf` (103 paginas), secciones 6.8.5-6.8.47 y RN/CA-COM. Tambien se aplica el texto del usuario del 2026-09-27. Se conserva el inventario operativo ya autorizado; no se rehace ni se agregan ventas, contabilidad o precios.

## Auditoria inicial

| Area | Estado | Evidencia / correccion necesaria |
| --- | --- | --- |
| Solicitudes: actor, sucursal, almacen, productos activos, cantidades y unidades purchase | CORRECTO | DTOs y PurchasesService validan creacion, envio y aprobacion; secuencias, FKs y auditoria existentes. |
| Cotizaciones multiples y fuentes por producto | CORRECTO | Tablas puente y validacion de fuentes; proveedor unico por oferta, precios y disponibilidad no negativos. |
| Comparacion y seleccion | PARCIAL | Comparacion dedicada existente y seleccion manual; faltaba mostrar impuestos y el alcance de ofertas consolidadas. Habia una segunda comparacion en un drawer. |
| Orden desde cotizacion seleccionada, proveedor unico y recepciones derivadas | CORRECTO en API / PARCIAL en BD | Origen asignado por servidor y sin endpoint directo de compra; FKs opcionales heredadas permiten nulos. Inspeccion: 7 ordenes y 7 compras, cero origenes nulos y cero detalles sin linea origen. |
| Estados automaticos de recepcion | CORRECTO | Cantidades, bloqueo de concurrencia, transacciones e idempotencia existentes. |
| Subtotal de orden | INCORRECTO | Encabezado guarda bruto y resta descuento al calcular total. 6.8.30 define subtotal neto; requiere cambio coordinado sin cambiar total final. |
| Gastos y additional_expenses | PARCIAL | Tipos activos, montos >= 0 y suma en servidor correctos. Actualizar gastos anidados permite eludir purchase_expenses.create/update. |
| Documentos por gasto | CORRECTO | purchase_order_expense_documents -> purchase_order_expenses -> purchase_orders; descarga autenticada y contenido validado. No existe purchase_documents. |
| Recepcion real vs orden | PARCIAL | Varias compras por orden, origen por linea y cantidades exactas. PurchaseItem legacy conserva cantidad, costo y neto, pero no snapshot fiscal completo. Pantalla no muestra simultaneamente ordenado/anterior/ahora/pendiente. |
| Retaceo proporcional al FOB, DAI y exclusion de IVA | CORRECTO | allocateCost usa Decimal/enteros para repartir centavos; importVat no suma al costo; cierre inmutable y auditado. |
| Porcentajes de retaceo | PARCIAL | No se almacenan, pero tasas por linea se obtienen del importe ya redondeado en vez de encabezado/FOB total. |
| Retaceo asociado a compra | PARCIAL | FK obligatoria a compra; falta rechazo explicito de una eventual compra historica sin orden. |
| Integracion con Inventario | PARCIAL | Movimientos vinculados a compra, saldo y reversion idempotentes correctos. Consulta no expone costo unitario/costo real del retaceo cerrado como referencia de valoracion. |
| Bitacora, transacciones y eliminacion | CORRECTO con verificacion pendiente | Operaciones principales auditadas dentro de transaccion; no hay DELETE de orden/compra/retaceo. Probar los perfiles restringidos y flujo completo. |
| Pruebas existentes | PARCIAL | verify-single-company pasa, pero la suite extendida crea otra empresa y su limpieza por empresa no es segura para Atlas. Adaptar fixtures aislados antes de ejecutarla. |

## Criterio de intervencion

Conservar modelos, APIs y componentes correctos. Completar campos de PurchaseItem sin renombrar la tabla legacy ni crear modulos paralelos. Mantener existencias a cargo de InventoryService y publicar costos vinculados a la compra, sin volver a ingresar cantidades al cerrar retaceo ni sobrescribir el costo maestro del producto.

La auditoria es evidencia de revision, no una certificacion de cumplimiento. El resultado de compilaciones, migraciones y pruebas se registrara al finalizar.

## Correcciones y verificacion final

Comprobacion adicional contra respaldo: las 7 ordenes y 7 compras originales conservan totales y cantidades. Vite build correcto; permanece un aviso de empaquetado por importacion estatica/dinamica de auth.store, no un error de compilacion. Los formularios se comprobaron a 1440x960 y 390x844 sin desbordamiento horizontal de pagina; las tablas anchas conservan desplazamiento interno.

1. **Incorrecto/parcial corregido:** subtotal de orden neto, snapshot fiscal por recepcion, porcentajes globales del retaceo, permisos de gastos anidados, costo real consultable desde el kardex y comparacion unica con impuestos. El formulario de recepcion distingue ordenado/anterior/ahora/pendiente. Se corrigieron destinos preseleccionados arbitrariamente, enlaces entre documentos y confirmaciones.
2. **Clarificacion adicional del usuario:** compras es abastecimiento de proveedores, no ventas. Nueva finalidad obligatoria (reventa, operacion, mixta) validada por DTO y persistida. No se infiere la finalidad historica. Una solicitud no genera movimientos; una ya aprobada no puede cambiar su finalidad.
3. **Conservado:** stack Nest/Vue/Prisma, modulos existentes, puentes solicitud-cotizacion, seleccion por proveedor, documentos por gasto, reparto monetario, auditoria transaccional y motor de inventario. No se agregaron ventas, contabilidad, precios de venta ni otro inventario.
4. **Base de datos:** migraciones 20260927190000_purchase_receipt_integrity y 20260927200000_purchase_request_purpose. Origenes obligatorios y FKs RESTRICT, cantidad ordenada, recibido anterior, unidad, precio, descuento, impuesto y total por recepcion; costo unitario Decimal(14,4); subtotal neto de orden conservando totales; enum nullable para finalidades historicas. Cuatro relaciones antiguas de Prisma se alinearon con NoAction ya existente en BD. Respaldo de documentos previo: backend/tmp/compras-pre-ers-20260927.json (no es respaldo integral de PostgreSQL).
5. **Reglas verificadas:** finalidad obligatoria, cantidades positivas, origen obligatorio, disponibilidad, sobrecompra concurrente, permisos restringidos, adjuntos autenticados, entradas reales e idempotentes, retaceo cerrado inmutable, exclusion del IVA, reversion unica y no duplicacion de inventario. Caso ERS: 63940.48 + 7391.52 = 71332.00.
6. **Pruebas:** verify-purchase-regressions.ts PASS 19 grupos (incluye 52 casos de reparto); verify-single-company.ts PASS 9 grupos; frontend/tests/purchase-workflow.test.ts PASS 6. Compilacion Nest y vue-tsc correctas. Prisma migrate deploy correcto (18 migraciones); migrate diff sin diferencias. Comprobacion UI de navegacion, desglose fiscal, formulario de recepcion y finalidad, calculo de pendientes y confirmacion de descarte. Los fixtures temporales se eliminan por sus IDs, no por empresa.
7. **Limites reales:** el historial no permite reconstruir con certeza recibido-anterior ni finalidad; se muestran desconocidos en vez de inventarlos. Una base distinta con recepciones antiguas multilinea y descuentos/impuestos sin reparto requerira conciliacion previa: la migracion se detiene antes de asignar importes arbitrarios. El costo publicado es una referencia por movimiento de compra, no un nuevo metodo contable FIFO/promedio. La tabla fisica legacy purchase_items se conserva; contiene los campos del detalle de compra sin renombrar toda la arquitectura. Las pruebas enumeradas no certifican ausencia absoluta de errores en todo el ERP.
