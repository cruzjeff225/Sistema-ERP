# Prueba completa de compras: DEMO-20261005-91D078B8

Fecha: 2026-10-05, El Salvador. Resultado: **APROBADA**. Los datos son ficticios y permanecen identificados como DEMO para revisarlos en el ERP. Las operaciones se ejecutaron por API y las verificaciones de inventario se contrastaron con la base de datos.

- Maestros ficticios creados por API: productos, proveedores, sucursales, bodegas y espacios
- Dos solicitudes enviadas directamente a Compras: 100 + 400 solicitadas; Compras decide 600 y agrega 10 láminas
- PDF específico por proveedor; dos ofertas recibidas y comparadas por producto
- Adjudicación de tejas a A y láminas a B; una orden por proveedor, aprobadas y marcadas como enviadas
- Recepción parcial 450 + complemento 150; 10 láminas recibidas, ubicadas, verificadas, retaceadas y cerradas
- Gastos previstos separados de reales: costo FOB 1,230 + gastos capitalizables 212 = costo final 1,442; sin duplicar IVA ni inventario
- Traslados completados: Norte 100 y Sur 400; solicitudes atendidas, sin pendientes; reserva general 100 tejas y 10 láminas

| Producto | Solicitado | Comprado | Recibido | Distribuido | Reserva general |
|---|---:|---:|---:|---:|---:|
| Tejas | 500 | 600 | 600 | 500 | 100 |
| Láminas adicionales | 0 | 10 | 10 | 0 | 10 |

Ambas solicitudes quedaron atendidas; las dos órdenes recibidas; las tres recepciones y sus retaceos cerrados; los dos traslados completados. Costo FOB: $1,230. Gastos capitalizables reales: $212. Costo final: $1,442. Las reservas adicionales no pertenecen a solicitudes pendientes.

| Documento | Código | ID |
|---|---|---:|
| Solicitud | PR-00119 | 119 |
| Solicitud | PR-00120 | 120 |
| Cotización | COT-00126 | 126 |
| Cotización | COT-00127 | 127 |
| Orden de compra | OC-00116 | 116 |
| Orden de compra | OC-00117 | 117 |
| Recepción | RC-00096 | 96 |
| Retaceo | RET-00063 | 63 |
| Recepción | RC-00097 | 97 |
| Retaceo | RET-00064 | 64 |
| Recepción | RC-00098 | 98 |
| Retaceo | RET-00065 | 65 |
| Traslado | TR-D1849805 | 22 |
| Traslado | TR-C5EF9A02 | 23 |

Evidencia y PDFs: C:\Users\chica\Desktop\Sistema-ERP\backend\tmp\demos\DEMO-20261005-91D078B8. El JSON registra cada operación HTTP sin contraseñas ni tokens.

Verificación independiente: aprobada por API y BD. Se conciliaron cuatro existencias y ocho movimientos nuevos; las cantidades originales, compradas, recibidas y entregadas mantienen su trazabilidad. Se repitieron seis recepciones/entradas con los UUID en mayúsculas sobre documentos completados: no se modificaron documentos, existencias ni movimientos. Ambos PDFs tienen los productos del proveedor y la fecha local correctos.

Este caso es una **nueva inserción solicitada el 5 de octubre**; se conserva también la prueba anterior `DEMO-20261004-1963682E`. El primer intento `DEMO-20261005-AEF555D2` falló por API detenida antes de crear cualquier registro. Se reinició la API sin recarga automática y el segundo intento completó todas las fases.

Para revisar el nuevo caso: `/purchases/quotations/manage?id=30`. Todos sus maestros y documentos son ficticios y llevan el prefijo `DEMO-20261005-91D078B8`. Evidencia independiente: `verificacion-independiente.json`. Verificador reproducible: desde backend, `npm run verify:supply-retained -- --run=DEMO-20261005-91D078B8 --with-existing --replay`. No crea otro escenario ni elimina datos.
