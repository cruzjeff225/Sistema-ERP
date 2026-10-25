# Cantidades, cotizaciones y aprobación de Compras

Actualizado el 5 de octubre de 2026. Se usan los módulos existentes de Solicitudes, Cotizaciones y Órdenes; no se agrega un módulo de consolidación.

## Flujo vigente

1. Las sucursales crean borradores y los envían a Compras. Solicitar no genera órdenes ni existencias.
2. Dentro de Cotizaciones, Compras agrupa las solicitudes enviadas por producto y rango de fechas, conserva las cantidades y sucursales de origen y prepara la propuesta. Puede aumentar, reducir y agregar productos con motivo y responsable.
3. **Enviar cantidades a Gerencia** deja la propuesta en revisión. Gerencia puede modificar cantidades y agregar productos, conservando lo solicitado originalmente; autoriza esa versión o devuelve con observaciones. El permiso existente `purchase_orders.approve` permite revisar cantidades sin permisos para editar ofertas.
4. Solo después de autorizar cantidades se preparan los PDF específicos de cada proveedor. Desde la primera solicitud de precios, la propuesta queda bloqueada para evitar modificar lo que ya se consultó. Un proveedor puede responder disponible, no disponible o no cotizado; disponibilidad y precio positivos son obligatorios cuando ofrece el producto.
5. Compras registra ofertas, compara unidades y monedas con equivalencias válidas y elige un proveedor completo, proveedores por producto o una recomendación por costo total. La recomendación incluye cargos por proveedor y distingue comparaciones parciales. Un hash evita enviar una comparación desactualizada.
6. **Generar órdenes y enviar a Gerencia** agrupa una orden por proveedor pendiente de aprobación. La decisión final es aprobar, rechazar o devolver con observaciones: la orden pendiente o aprobada no se edita. Compras corrige únicamente borradores o devueltas, sin superar las cantidades autorizadas, y vuelve a enviar a revisión.
7. Se marca la orden aprobada como enviada al proveedor antes de recibir. Las recepciones parciales mantienen pendientes y no ocupan espacios sugeridos. La ubicación confirmada y el código interno generan el movimiento de entrada una sola vez.
8. Se verifica la recepción, se registran gastos reales y se prepara el retaceo. Los reales capitalizables sustituyen los previstos; los no capitalizables y el IVA recuperable no se duplican en el costo. Calcular, verificar y cerrar el retaceo no vuelven a ingresar inventario.
9. Se cierra la recepción y se continúa en Bodega para distribuir por traslado a las sucursales. Despacho, recepción parcial y pendiente se conservan vinculados a cada solicitud.

## Datos, permisos y compatibilidad

Migración aditiva `20261006010000_quantity_review_before_quoting`: estado y versión de la revisión de cantidades, versión autorizada, responsable, fecha y observaciones. Respaldo PostgreSQL verificado antes de aplicarla: `backend/tmp/purchase-backups/2026-10-06T02-32-19-533Z-quantity-review/database-before.dump`.

Los procesos que ya tenían solicitudes de precios u órdenes conservan su continuidad. La migración los identifica como anteriores a la revisión previa y no inventa un gerente ni una fecha de autorización. No se modifican sus solicitudes, órdenes, recepciones, existencias o movimientos.

El backend controla permisos y transiciones, rechaza revisiones obsoletas y bloquea cambios después de cotizar. La aprobación final registra versión, usuario y fecha. Las órdenes retienen la autorización inicial y la selección comparada. Los UUID y la transacción por empresa evitan duplicados de adjudicación, recepción y traslado.

## Verificación

- `verify-purchase-approval.ts` ejecuta `verify-quantity-review-workflow.ts` sobre PostgreSQL real en una transacción revertida: borradores, agrupación de sucursales, aumentos/reducciones/productos adicionales, permisos y versiones, PDF, oferta completa, selección combinada, comparación parcial, gastos previstos/reales, aprobación, recepción, ubicación, retaceo, traslado parcial y reintentos.
- La prueba confirma solicitado 10, propuesto/comprado/recibido 15 y distribuido 2 como valores distintos, sin registros ficticios permanentes.
- Pruebas unitarias de backend: comparación, cargos fijos/proporcionales, PDF y permisos.
- Frontend: lógica de pantallas Vue compiladas, SSR, revisión previa y decisión final, referencias de origen, aislamiento por empresa y navegación de las etapas posteriores.
- Compilación NestJS y Vue TypeScript/Vite.

Las equivalencias de presentaciones, condiciones y cambios monetarios deben registrarse con información válida. Los cargos desconocidos mantienen la comparación parcial. La búsqueda de recomendaciones tiene un máximo de 100.000 nodos y señala cuando no puede garantizar un óptimo global. La comprobación visual se realiza mediante compilación y SSR; no se afirma navegación en navegador.

## Registro de cargos y revisión de la oferta

Cotizaciones registra los cargos adicionales que el proveedor cobrará a la empresa, como flete o seguro facturado aparte; no solicita sus gastos internos. Un importe incluido en el precio del producto no se añade otra vez. Los gastos propios de la adquisición se presupuestan en la orden y los reales se registran en recepción para el retaceo.

Las casillas son una revisión de Compras: cargos de la oferta y condiciones comerciales. Los campos existentes `costsConfirmed` y `conditionsConfirmed` mantienen su compatibilidad y no representan una declaración del proveedor sobre su estructura de costos. Se permite guardar sin completar la revisión; el comparativo conserva la advertencia de comparación parcial.

La referencia de la oferta es opcional en el registro habitual y se presenta en un apartado desplegable. Si la cantidad cotizada difiere de la consultada, se despliega y exige identificar la cotización, correo o mensaje recibido que respalda esa cantidad y precio. No se exige una comunicación adicional para registrar una oferta que conserva la cantidad consultada. Frontend y backend validan este requisito.

## Cantidades de productos enteras

Las cantidades solicitadas, propuestas, cotizadas, disponibles, mínimas, ordenadas, recibidas, trasladadas y ajustadas son números enteros. Las unidades por presentación también son enteras. La pantalla usa incrementos de una unidad y el backend rechaza fracciones, sin redondear `1.2` a una o dos piezas. Se permite cero donde significa no disponible, sin mínimo o excluir un producto de la propuesta; solicitar, comprar, recibir y trasladar requieren cantidades positivas.

Los importes, precios por unidad, descuentos, impuestos, tasas de cambio y costos del retaceo conservan sus decimales. La sugerencia de distribución solo propone piezas completas que caben en un espacio; una capacidad libre fraccionaria no divide un producto. No se modifican ni redondean registros históricos. Se conserva la posibilidad de revertir movimientos históricos con su cantidad exacta para no alterar saldos previos.

`product-quantities.test.ts` comprueba las validaciones de cada fase y que los importes siguen aceptando decimales; las pruebas de comparador y distribución comprueban que no se pueden adjudicar ni despachar fracciones.
