# Mejoras de compras

**Actualización del 3 de octubre de 2026:** el flujo vigente se documenta en [flujo-abastecimiento.md](flujo-abastecimiento.md). Los consolidados y solicitudes de cotización son documentos persistentes; las recepciones quedan pendientes de viñeteo y confirmación física antes de ocupar el mapa.

## Continuidad y pantallas de gestión

- Cotizaciones y recepciones abren **Esta semana**, según los días de El Salvador. **Anteriores** permite consultar todos los documentos y filtrar fechas; búsqueda y filtros secundarios se mantienen compactos.
- Recepciones usa lista y detalle de un documento. Al abrirlo solo se muestran productos, cantidad recibida y ubicación confirmada; factura, cantidades de la orden e importes se despliegan cuando se necesitan.
- El siguiente paso de una orden considera sus recepciones abiertas. Una entrega completa con todas sus recepciones cerradas sale de **Solo pendientes**, conservando su estado documental de recibida. Una recepción parcial cerrada nunca oculta otra que requiera atención.
- Los enlaces a bodega conservan la recepción o solicitud de origen. Solo se muestran sus ubicaciones, gastos o entregas, con regreso al documento y acceso explícito a toda la bodega. Un enlace a un documento no disponible no abre otro en su lugar.
- Una nueva recepción debe ubicarse y verificarse antes de retacear; el retaceo debe cerrarse antes del cierre de la recepción. Los resúmenes conservan el efecto de un retaceo en papelera para impedir generar costos duplicados; un retaceo abierto requiere recuperarlo para continuar.

Verificación: pruebas de frontend, proyección de gastos de las órdenes, compilación de Vue/Vite y backend, y ocho grupos de integración de `verify-supply-workflow.ts` con registros temporales. Incluyen límites de fechas y paginación, fases obligatorias, continuidad de solicitudes, documentos archivados, costos e idempotencia. La inserción DEMO documentada en [prueba-completa-compras.md](prueba-completa-compras.md) se conserva.

## Asistencia para comprar y distribuir

El comparativo trabaja un producto a la vez y explica su sugerencia con costo estimado para la misma cantidad y moneda, disponibilidad y plazo. Incluye descuentos, impuestos y gastos ofertados; primero considera ofertas que cubren toda la necesidad. Usar la sugerencia llena la selección para revisarla antes de confirmar.

Una adjudicación parcial puede ampliarse en la misma orden en borrador del proveedor. Actualiza cantidades y gastos originales sin repetir filas; conserva presupuestos modificados o documentados. La fecha prevista respeta el plazo ofrecido. Cada confirmación tiene un UUID conservado ante un error de red: repetir el mismo intento devuelve el resultado sin volver a comprar; reutilizarlo con datos diferentes devuelve conflicto.

La bodega puede preparar un traslado con existencias confirmadas y espacios compatibles, descontando lo que ya está en tránsito. El plan muestra faltantes por producto y requiere revisión antes del despacho. Prepararlo no reserva espacios ni registra movimientos.

## Solicitudes y cotizaciones

- Al enviar y aprobar solicitudes se revalidan sucursal, almacen, productos y unidades activos de la empresa configurada.
- Al crear/editar cotizaciones y al recibir/seleccionar ofertas se revalidan los productos y unidades de compra.
- Cada solicitud vinculada a una cotizacion debe aportar al menos una linea con trazabilidad.
- Al cambiar solicitudes de una cotizacion o cancelarla, se recalculan los estados de las solicitudes afectadas. Sin ofertas activas ni cantidades ordenadas, vuelven a aprobadas. Los cambios de estado quedan auditados.

## Registrar una recepcion

1. Abrir una orden aprobada, enviada o parcialmente recibida y pulsar **Recibir**. Se consultan de nuevo sus cantidades pendientes.
2. Introducir lo recibido. Las cantidades comienzan en cero; **Completar pendientes** carga el saldo de cada linea.
3. Dejar que el sistema sugiera un espacio o proponer uno del almacén general. Es una sugerencia, no una ubicación ocupada.
4. Pulsar **Revisar recepción**, comprobar productos y cantidades y confirmar. Se registra la recepción. Después, en **Ubicar y distribuir**, viñetear y confirmar la ubicación física; esa confirmación registra existencias y kardex en una sola transacción.
5. Desde la orden, **Ver recepcion** abre su detalle. Tambien se puede buscar por compra, orden, factura, proveedor, nombre del producto o SKU.

El detalle muestra el espacio registrado y sus coordenadas: pasillo, estante, nivel y posicion. Los permisos actuales siguen controlando los accesos y acciones.

## Reintentos y correcciones

El formulario genera un UUID por intento de recepcion y lo conserva mientras esta abierto. Si falla la respuesta de red, repetir la misma confirmacion recupera la recepcion ya registrada, sin duplicar cantidades ni movimientos. El servidor serializa las escrituras de la empresa.

Reutilizar el UUID con otros datos, o despues de modificar/cancelar esa recepcion, devuelve conflicto. Esta proteccion no detecta facturas duplicadas entre formularios nuevos: despues de cerrar o recargar una pantalla con resultado incierto, revisar el historial antes de iniciar otra recepcion. Clientes API externos deben enviar `requestId` para obtener esta proteccion.

En recepciones editables, vaciar la fecha de factura ahora elimina efectivamente la fecha guardada. Las restricciones existentes para documentos verificados, cerrados o con retaceo siguen vigentes.

## Verificacion

`backend/scripts/verify-single-company.ts` cubre con registros temporales el flujo solicitud -> cotizacion -> orden -> recepcion -> inventario -> reversion, y elimina sus fixtures al finalizar. Incluye aprobacion con producto inactivo, desvinculacion/cancelacion de ofertas, solicitudes sin lineas, reintentos concurrentes, rechazo de UUID reutilizado con otros datos, busqueda y borrado de fecha de factura.

Ejecutar desde `backend` con la API local y PostgreSQL disponibles:

```powershell
npx tsx scripts/verify-single-company.ts
```

La prueba usa las credenciales de verificacion o de seed configuradas localmente. No constituye una certificacion completa del ERS ni una garantia de ausencia de errores fuera de los escenarios cubiertos.
