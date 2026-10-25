# Compras de Atlas Roofing

## Que se compra

Una solicitud de compra expresa una necesidad interna para adquirir bienes a un proveedor. No es una venta, una cotizacion para un cliente ni una salida de bodega.

- Reposicion para reventa: comprar mercaderia que Atlas posteriormente vendera.
- Insumos para operacion / instalacion: comprar materiales para el trabajo de Atlas.
- Mixta: la necesidad incluye ambos destinos; detallar el motivo y las observaciones.

El mismo articulo del catalogo puede comprarse para distintos usos. La finalidad corresponde a la solicitud, no se deduce del nombre del producto ni cambia automaticamente el tipo del articulo.

Ejemplos: reponer laminas para reventa; comprar sellador y tornillos para instalar una cubierta. El catalogo de productos representa los bienes que se administran, no exclusivamente los que se venden. Solo se ofrecen productos activos con unidad de compra valida.

## Recorrido

1. Solicitudes: elegir sucursal, bodega destino, finalidad, fecha, motivo y cantidades a comprar. Guardar borrador, revisar y solicitar aprobacion.
2. Un usuario autorizado aprueba o rechaza. Una solicitud aprobada no puede editarse.
3. Cotizaciones: registrar las ofertas de proveedores sobre las solicitudes aprobadas. Registrar costo ofertado, descuento, impuesto, disponibilidad, entrega y gastos. Comparar ofertas y seleccionar.
4. Ordenes: generar una orden desde la oferta seleccionada. Cada orden corresponde a un solo proveedor. Si se eligen dos proveedores, generar dos ordenes. Autorizarla y marcar su envio cuando se haya enviado realmente; el boton no envia correo.
5. Gastos: asociar cada comprobante a su gasto dentro de la orden, no a un documento generico.
6. Recepcion: abrir la orden y registrar exclusivamente lo entregado. Revisar ordenado, recibido anteriormente, recibido ahora y pendiente. El sistema elige ubicaciones activas con capacidad o permite elegir una ubicacion valida.
7. Inventario: aumenta al confirmar la recepcion, por la cantidad realmente recibida. Solicitar, cotizar y aprobar una orden no agregan existencias.
8. Retaceo: calcular, verificar y cerrar los costos de la recepcion. Reparte costos proporcionales al FOB e incorpora DAI; el IVA de importacion no forma parte del costo. El cierre aporta la referencia de costo real al kardex sin ingresar otra vez la mercaderia.

## Distinciones importantes

- Al salir de una solicitud, cotizacion, orden, recepcion en captura, factura en edicion o retaceo con cambios pendientes, se solicita confirmacion. Volver conserva lo escrito. Al recargar o cerrar la pestana, el navegador puede mostrar su aviso nativo de cambios pendientes.
- Antes de aprobar se identifica el documento y el efecto de la autorizacion. Antes de recibir se muestran los productos realmente capturados y si la orden quedara parcial o completa.
- Los enlaces de origen del retaceo abren los documentos correspondientes. El enlace directo por id conserva el retaceo seleccionado al recargar.
- Un nuevo retaceo solo preselecciona la recepcion indicada por el enlace o una unica opcion disponible; con varias opciones exige elegir.
- Los filtros y el detalle muestran el mismo conjunto de documentos.

- Ordenada completamente significa que toda la solicitud esta cubierta por ordenes, no que todo haya llegado.
- Pendiente actual en una recepcion refleja lo que falta hoy en la orden, incluso si hubo recepciones posteriores.
- Finalidad de operacion no consume materiales automaticamente: comprar y recibir son eventos distintos de usar o vender. No se agregaron ventas ni un modulo de consumo.
- Las solicitudes anteriores al cambio conservan Finalidad sin registrar. Un borrador antiguo debe completarse al editarlo antes de solicitar aprobacion; no se reescribe el historial aprobado.
- Las recepciones anteriores al nuevo snapshot muestran Sin registro historico cuando se desconoce la cantidad recibida previamente. No se inventa ese valor.
