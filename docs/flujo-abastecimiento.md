# Abastecimiento central y distribución a sucursales

Implementación actualizada el 5 de octubre de 2026. La revisión previa y la aprobación final se detallan en [Comparación y aprobación](comparacion-aprobacion-compras.md). Esta guía sustituye las instrucciones anteriores sobre cotización directa desde solicitudes y ocupación automática de espacios al recibir.

## Centro general

Se creó y configuró **Almacén General de Recursos e Insumos**, en la sucursal central existente. Las solicitudes conservan la sucursal solicitante, pero su almacén receptor es siempre el centro general configurado. El servidor rechaza otro destino, incluso si se altera el formulario.

Las órdenes nuevas también reciben en el centro general. El almacén de la sucursal se elige posteriormente en el traslado. El administrador puede consultar o cambiar el centro en **Administración → Configuración → Opciones avanzadas → Centro de recepción de compras**, sujeto a que no queden existencias, recepciones pendientes de ubicación ni órdenes abiertas en el centro anterior. No se puede desactivar el centro configurado ni su sucursal.

En **Organización → Espacios** se deben registrar los espacios físicos y sus capacidades nominales antes de confirmar la colocación. La recepción puede quedar pendiente aunque todavía no exista espacio disponible.

## Solicitudes y preparación de cotizaciones

1. La sucursal guarda su solicitud en borrador y pulsa **Enviar a Compras**. Una solicitud enviada ya está disponible para consolidación; la aprobación anterior permanece para documentos históricos y no es un paso obligatorio del nuevo flujo.
2. En **Compras → Cotizaciones → Nueva cotización**, Compras selecciona las solicitudes enviadas y puede filtrar un rango inclusivo de fechas de creación, usando la zona horaria de El Salvador. La consolidación se realiza internamente en esa gestión; no tiene un módulo separado.
3. El documento suma por producto y unidad de compra y guarda el detalle original por solicitud y sucursal. No se incluyen borradores ni solicitudes canceladas/rechazadas, ni se reutiliza una solicitud ya consolidada o con un proceso anterior de cotización activo.
4. Se guardan separadamente `requestedQuantity` y `purchaseQuantity`. Los cambios de cantidad requieren un motivo auditado. Los productos agregados por Compras tienen solicitado cero. Reducir la compra no reduce ni cancela automáticamente la necesidad de la sucursal.
5. Gerencia revisa y autoriza las cantidades antes de preparar las solicitudes a proveedores. Desde la primera RFQ, la propuesta queda bloqueada y conserva lo enviado. Las fuentes originales no se editan ni se distribuyen proporcionalmente suponiendo que comprado equivale a solicitado.

## Solicitud de cotización, oferta y adjudicación

- Se selecciona un proveedor y los productos del consolidado que se le consultarán. Sus cantidades se cargan automáticamente. Un producto puede consultarse a varios proveedores.
- Cada proveedor tiene su propia solicitud y PDF descargable. El PDF contiene solo sus productos seleccionados y cantidades; no registra una oferta recibida ni envía correos.
- Posteriormente se registra la oferta desde esa solicitud. Producto, unidad y cantidad consultada conservan el origen; se capturan precio, cantidad disponible, descuento, impuesto, entrega y condiciones. El apartado opcional **Cargos adicionales de la oferta** permite registrar flete, seguro y otros cargos ofertados. Se puede corregir una oferta antes de que genere órdenes, respetando los permisos específicos de gastos y conservando los importes que no se modifican.
- El comparativo muestra productos en filas y proveedores en columnas; permite seleccionar una oferta completa, combinar proveedores por producto o aplicar la recomendación. La vista alternativa por producto usa la misma recomendación de costo total. Las cantidades, descuentos, impuestos, disponibilidad, entrega, subtotales y presupuestos se mantienen separados.
- La disponibilidad requiere una respuesta explícita: **Tiene producto** exige cantidad y precio positivos; **No tiene** y **No cotizado** permiten disponibilidad cero. Los ceros históricos quedan **Por confirmar** y muestran el precio registrado, sin inventar disponibilidad.
- El motor evalúa combinaciones incluyendo gastos fijos una vez por proveedor y gastos proporcionales según su base. Señala por separado menor precio unitario y menor costo total. Costos o condiciones sin confirmar producen una comparación parcial que Compras debe reconocer antes de enviar.
- Una presentación exige factor y precio declarados, normalizados a la unidad de compra. Las monedas distintas requieren un tipo de cambio positivo con fecha para compararse en USD; no se infieren equivalencias ni se consultan tasas externas.
- **Generar órdenes y enviar a Gerencia** valida la versión del comparativo y genera una orden por proveedor en **Pendiente de aprobación**, en una transacción idempotente. No envía al proveedor ni modifica inventario. Gerencia revisa originales, propuesta, diferencias, motivos, ofertas, gastos y total; puede aprobar, rechazar o devolver con observaciones.
- Compras edita borradores o devoluciones dentro de las cantidades autorizadas. Gerencia no edita órdenes pendientes o aprobadas: aprueba, rechaza o devuelve con observaciones. Las correcciones se vuelven a enviar a revisión; condiciones comerciales diferentes requieren confirmación y referencia auditada del proveedor.
- Las órdenes conservan su cotización, los detalles adjudicados y el consolidado. Los productos adicionales no necesitan una solicitud ficticia. Las ofertas nuevas requieren una solicitud de cotización del consolidado; los documentos históricos conservan su trazabilidad anterior.
- Una adjudicación posterior al mismo proveedor amplía su misma orden si todavía está **en borrador** y procede de la misma oferta. Se agregan los productos o cantidades pendientes sin crear otra orden. Una orden enviada a aprobación o a fases posteriores ya no se amplía; si está en la papelera, primero debe restaurarse.
- Al ampliar un borrador se recalculan solamente los gastos estimados que siguen iguales a la proyección original de la oferta. Los presupuestos editados manualmente y los gastos con documentos adjuntos se conservan, con sus referencias. La fecha esperada se obtiene del mayor plazo de entrega de los productos elegidos, usando el plazo general de la oferta cuando el producto no especifica uno; la ampliación conserva una fecha posterior ya registrada.

## Revisión previa de cantidades y decisión final

Compras prepara la propuesta dentro de Cotizaciones y la envía a Gerencia antes de generar solicitudes de precios. Gerencia aumenta, reduce o agrega productos con motivo y responsable, manteniendo intactas las solicitudes originales. Autoriza la versión revisada o la devuelve con observaciones.

El backend impide generar RFQ/PDF sin esa autorización. Desde la primera RFQ no se modifican las cantidades propuestas. Compras compara y decide los proveedores; Gerencia solo aprueba, rechaza o devuelve las órdenes finales. Las correcciones de Compras se realizan en borradores o devueltas, respetando las cantidades autorizadas, antes de una nueva aprobación.

Los procesos ya cotizados antes de este cambio conservan su continuidad y quedan identificados como históricos, sin inventar aprobaciones de usuarios.

## Recepción, viñeteo y ubicación

La recepción registra únicamente cantidades realmente recibidas, permite entregas parciales y conserva los saldos de la orden. Sus reintentos con el mismo UUID no duplican documentos.

La ubicación definitiva comienza vacía. Una sugerencia o un espacio propuesto en el formulario se guarda separadamente en `suggestedLocationId`, sin crear existencias ni ocupar el mapa. No se impide recibir por falta de espacio; la mercancía queda visible en la bandeja pendiente de ubicación.

En **Operaciones → Bodega → Ubicar productos**:

1. Imprimir la viñeta CODE128 del código interno y colocarla físicamente.
2. Leer o ingresar ese mismo código interno.
3. Elegir el espacio real y confirmar que los productos quedaron allí.

La confirmación revalida almacén, unidad y capacidad nominal. Solo entonces crea existencias y movimiento de recepción. Guarda fecha, usuario y confirmación del código; repetir la confirmación no duplica el movimiento. El mapa se alimenta de estas existencias confirmadas. La confirmación es del operador, no una comprobación por sensores. Una línea de recepción se coloca completa en un espacio; para varias ubicaciones se deben registrar recepciones menores.

## Gastos reales y retaceo

Los gastos previstos permanecen en la orden. En **Bodega → Gastos de recepción** se registran comprobantes de gastos reales por recepción, pudiendo relacionarlos con un gasto previsto de la misma orden y tipo.

Se identifica cada gasto mediante una referencia y se indica si es capitalizable y su rubro (flete, gasto o DAI). La referencia no se puede registrar nuevamente en otra recepción de la misma orden; un reintento idéntico en la misma recepción recupera el gasto registrado.

Cuando existen gastos reales registrados, el retaceo toma sus totales capitalizables, sustituyendo las estimaciones o agregados manuales. No suma real más previsto. Cada gasto queda vinculado a un solo retaceo, con reparto monetario exacto sobre el FOB de los productos recibidos. Recalcular no duplica asignaciones; cancelar un retaceo libera sus asignaciones. El IVA de importación y los gastos marcados como no capitalizables quedan fuera del costo. Cerrar el retaceo publica el costo final sin volver a ingresar existencias.

Para recepciones históricas sin gastos reales registrados se conserva la entrada manual de totales del retaceo. Un gasto registrado en una recepción se distribuye entre los productos de esa recepción; no se reparte automáticamente entre otras recepciones.

## Traslados y pendientes

El despacho sale del centro general, identifica el detalle de solicitud original y tiene como destino un almacén de la sucursal solicitante. Valida existencias y el saldo aún no despachado de esa solicitud.

**Preparar con existencias disponibles** propone cantidades, espacios de origen y espacios compatibles del destino a partir del saldo por despachar, las existencias confirmadas y la capacidad nominal disponible. El operador puede revisar, ajustar o quitar líneas antes de confirmar. Los productos que no caben o no tienen existencias suficientes quedan señalados para atender su faltante. Preparar y revisar el plan no reserva espacios, no cambia existencias ni genera movimientos; el servidor vuelve a validar los datos al confirmar el despacho.

La salida descuenta existencias del origen y queda **en tránsito**. No ocupa todavía el espacio previsto del destino. La sucursal registra cantidades recibidas, incluso por partes, y confirma su ubicación real. Entonces se crean las existencias y el movimiento de entrada del destino.

El seguimiento distingue:

| Cantidad | Fuente |
| --- | --- |
| Solicitado | Detalles originales de solicitudes |
| Decidido | Cantidad de compra del consolidado |
| Comprado | Órdenes activas adjudicadas |
| Recibido | Recepciones de las órdenes, independientes de la ubicación |
| Despachado | Salidas por traslado vinculadas a cada solicitud |
| Distribuido | Cantidades efectivamente recibidas por la sucursal |
| Pendiente de solicitud | Solicitado menos recibido por la sucursal |

La solicitud solo pasa a **Entregada a sucursal** cuando sus productos se han recibido completamente allí. Ordenar o recibir del proveedor no la da por atendida. Los UUID de despacho y recepción evitan duplicaciones y rechazan referencias reutilizadas con datos diferentes.

## Verificación y límites

- Migraciones aplicadas: `20261003140000_supply_workflow`, `20261003143000_general_warehouse`, `20261003150000_supply_integrity`. El cambio es aditivo; conserva documentos históricos. Se habilitaron los nuevos tipos de movimiento en la restricción de PostgreSQL.
- `backend/scripts/verify-supply-workflow.ts` comprueba con registros temporales el centro general fijo, la exclusión de borradores, las cantidades originales y decididas, los productos adicionales, el PDF por proveedor, la adjudicación por producto, la ampliación de borradores, las recepciones parciales e idempotentes, la sugerencia sin ocupación, el viñeteo y la ubicación, los gastos reales, el retaceo y los traslados con saldo original. Elimina sus datos por IDs al terminar.
- `backend/scripts/order-expense-projection.test.ts` comprueba el recálculo de estimaciones y la conservación de presupuestos manuales o documentados. `frontend/tests/quotation-comparison.test.ts` cubre costos comparables, disponibilidad, vigencia, moneda y estimaciones al ampliar órdenes.
- `frontend/tests/quotation-offer-expenses.test.ts` comprueba permisos y conservación de gastos al corregir una oferta. `frontend/tests/warehouse-dispatch.test.ts` y `frontend/tests/warehouse-context.test.ts` cubren las propuestas de despacho y el contexto de las solicitudes y recepciones. `frontend/tests/purchase-inbox.test.ts`, `frontend/tests/quotation-process-inbox.test.ts` y `frontend/tests/purchase-workflow.test.ts` documentan el filtrado temporal y las acciones según la fase.
- `backend/scripts/demo-supply-workflow.ts` genera información ficticia identificada como DEMO y recorre el proceso completo para inspeccionar sus documentos y relaciones. A diferencia de la verificación temporal, conserva los registros de demostración.
- Las pruebas de compras anteriores que creaban ofertas directamente o esperaban ubicación automática describen el contrato anterior. La nueva prueba se ejecuta con `pnpm run verify:supply` desde `backend`, con API, PostgreSQL y credenciales de verificación configurados.
- La capacidad de espacios sigue siendo nominal en unidades de compra; no representa medidas, peso o volumen. Los registros históricos de traslados no se enlazan retrospectivamente a solicitudes sin evidencia.

## Navegación y antigüedad

Consolidados deja de ser un módulo visible. La agrupación interna se mantiene para conservar cantidades y origen, dentro de Gestionar cotizaciones, accesible desde Solicitudes y Cotizaciones. El usuario selecciona solicitudes, continúa con sus productos, consulta proveedores y elige ofertas. Los enlaces antiguos redirigen a esa gestión. La barra numerada de fases se retiró; la navegación utiliza el menú y acciones relacionadas de cada documento.

Los listados muestran **Esta semana** por defecto: de lunes a domingo según `America/El_Salvador`. **Anteriores** permite consultar todos los documentos, incluidos los de la semana actual, y aplicar búsqueda y filtros; cuando hay filtros de fecha se pueden acotar los registros históricos. La separación no cambia estados ni elimina documentos pendientes. Los enlaces directos mantienen el documento de origen accesible en su pestaña correspondiente. Al seleccionar solicitudes para cotizar, las selecciones se conservan al cambiar entre pestañas.

## Interfaz orientada a la siguiente tarea

Solicitudes, cotizaciones y órdenes destacan una sola acción principal según estado y permisos. Editar, aprobar solicitudes, rechazar y cancelar están en Más acciones. Documentos relacionados, datos generales, entregas a sucursal y desglose de gastos se consultan desplegándolos. El total de la orden u oferta permanece visible.

Las ofertas se registran en tarjetas por producto, con precio y cantidad disponible como datos principales. Impuestos, descuentos, condiciones y cargos adicionales de la oferta siguen disponibles en apartados desplegables. La recepción guía hacia viñeteo y ubicación, verificación, retaceo y cierre. Los listados de solicitudes, cotizaciones, órdenes y recepciones conservan semana actual e historial filtrable.

## Configuración de gastos

Tipos de gasto se configura desde Retaceo mediante Configurar gastos. El panel permite crear, editar, activar o desactivar tipos sin salir del módulo, respetando los permisos existentes y conservando el historial. Ya no aparece como opción dentro de Órdenes de compra.

## QA y prueba conservada

La revisión del 5 de octubre comprobó el flujo completo con un único escenario ficticio. Se corrigieron duplicaciones por mayúsculas del UUID, destinos inactivos, avances desde solicitudes archivadas, reintentos de adjudicación/ofertas, respuestas de otra empresa y el bloqueo de recepción sin espacios. El PDF utiliza fecha local. Los UUID equivalentes, incluidos los históricos, se reconocen sin distinguir mayúsculas; referencias con contenido diferente continúan rechazadas. Consulte [el informe de QA](qa-compras-2026-10-05.md) y [los documentos de la prueba](prueba-completa-compras.md).

## Elegir ofertas: comparación y revisión

La comparación ahora tiene dos pasos. **Elegir proveedores** mantiene una lista visible de productos y muestra las ofertas del producto activo en filas alineadas: proveedor, precio unitario, total estimado, disponibilidad y entrega. En espacios estrechos, las filas pasan a bloques con sus etiquetas. Una selección por radio elige el proveedor; la cantidad se ajusta en un único campo y se conserva al cambiar de producto. Siguiente producto lleva al siguiente sin selección; al terminar permite revisar.

Los totales consideran descuentos, impuestos y gastos previstos. Cambiar una cantidad recalcula la comparación sin reducir artificialmente el máximo del campo. Cuando todas las ofertas son parciales, se muestra la misma cantidad comparable y elegir inicialmente utiliza esa cantidad mostrada; el operador puede aumentarla hasta la disponibilidad. El saldo que seguirá pendiente queda visible. No se suman ni se recomiendan conjuntamente monedas distintas.

**Revisar compra** agrupa la selección por proveedor, permite corregir cantidades o volver a cambiar proveedor y muestra productos netos, impuestos, gastos, total y almacén general. Confirmar y crear órdenes envía la adjudicación conservando su referencia de reintento. Cuando se amplía un borrador, distingue importe adicional, total previo y total resultante. No es necesario ver simultáneamente un resumen detallado mientras se comparan ofertas.

Condiciones, vigencia, notas y desglose de cada oferta se consultan al desplegar su fila. Las ofertas no disponibles quedan en un apartado cerrado con el motivo. Los productos ya comprados muestran las órdenes existentes; no se presentan como ofertas que todavía deban elegirse. Se mantienen la semana actual, Anteriores, filtros, permisos y protección de selecciones no guardadas.

Verificación del rediseño: 76 pruebas de frontend aprobadas, incluyendo seis del componente real sobre precios/cantidades, parcialidad, navegación, revisión por proveedor, monedas, permisos, reintentos y compras completadas. Tipado y compilación Vite aprobados. Se verificó el HTML por SSR; no se realizó navegación visual de navegador.
