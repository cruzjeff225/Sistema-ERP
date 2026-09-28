# Mejoras de compras

## Solicitudes y cotizaciones

- Al enviar y aprobar solicitudes se revalidan sucursal, almacen, productos y unidades activos de la empresa configurada.
- Al crear/editar cotizaciones y al recibir/seleccionar ofertas se revalidan los productos y unidades de compra.
- Cada solicitud vinculada a una cotizacion debe aportar al menos una linea con trazabilidad.
- Al cambiar solicitudes de una cotizacion o cancelarla, se recalculan los estados de las solicitudes afectadas. Sin ofertas activas ni cantidades ordenadas, vuelven a aprobadas. Los cambios de estado quedan auditados.

## Registrar una recepcion

1. Abrir una orden aprobada, enviada o parcialmente recibida y pulsar **Recibir**. Se consultan de nuevo sus cantidades pendientes.
2. Introducir lo recibido. Las cantidades comienzan en cero; **Completar pendientes** carga el saldo de cada linea.
3. Mantener la asignacion automatica de ubicacion o escoger un espacio del almacen destino.
4. Pulsar **Revisar recepcion**, comprobar productos/cantidades y confirmar. Se registran compra, existencias y kardex en una sola transaccion.
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
