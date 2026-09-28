# Atlas Roofing: guia de funcionamiento y demostracion

Datos preparados el 25 de septiembre de 2026. Los codigos corresponden a esta base local.

## Antes de empezar

Abre http://localhost:5173 e inicia sesion con tu cuenta. La empresa del encabezado debe ser Atlas roofing. Usa una cuenta con permisos para las acciones que presentaras; los botones disponibles dependen del rol y del estado del documento.

Todos los registros nuevos de esta demostracion llevan DEMO. Son ejemplos ficticios, no proveedores, ubicaciones, precios, documentos fiscales ni compras reales. Los correos example.invalid no son operativos. Se conservaron los registros anteriores y los datos de las otras empresas, sin mezclarlos con Atlas.

Los registros DEMO estan guardados en la misma base de Atlas: sus cantidades y documentos pueden aparecer en indicadores y listados generales. Busca DEMO o filtra por Bodega de cubiertas - DEMO para distinguirlos. No los uses para una operacion comercial real.

## Explicacion inicial para la exposicion

"Este ERP centraliza las operaciones de Atlas Roofing, una empresa de materiales para techos. Primero organiza sus sucursales, almacenes y ubicaciones; luego relaciona productos con proveedores. El proceso de compra comienza con una solicitud, compara ofertas y genera una orden autorizada. Las recepciones actualizan las existencias y el kardex permite revisar cada movimiento. En una importacion, el retaceo distribuye los gastos para obtener el costo de la mercaderia recibida."

## Recorrido por los modulos

| Pantalla | Que explicar | Ejemplo que puedes abrir |
| --- | --- | --- |
| Dashboard | Resumen de la actividad; no es un estado financiero ni una demostracion de procesos de venta. | Revisar indicadores y accesos disponibles. |
| Organizacion | Empresa fija con varias sucursales; cada almacen pertenece a una sucursal y cada espacio a un almacen. | Centro de distribucion Atlas - DEMO, Bodega de cubiertas - DEMO. |
| Proveedores | Datos generales, pais y ubicacion nacional; contactos separados para compras y reparto. | Suministros de Cubiertas SV - DEMO y Cubiertas Regionales GT - DEMO. |
| Productos | Categoria, subcategoria, unidades, codigo interno, SKU y proveedores de abastecimiento. | Buscar DEMO; cada producto tiene dos proveedores relacionados. |
| Solicitudes | Registrar una necesidad y someterla a aprobacion. No aumenta inventario. | PR-00024 aprobada y PR-00025 pendiente. |
| Cotizaciones | Registrar ofertas, revisar precio, plazo, disponibilidad y condiciones, y seleccionar una. | COT-00043 y COT-00044. |
| Ordenes de compra | Formalizar la oferta seleccionada y autorizar la compra; controlar cantidades recibidas y pendientes. | OC-00039, recibida parcialmente. |
| Recepciones | Registrar lo que realmente llego y la ubicacion donde se almacena. Subseccion de Ordenes. | RC-00031. |
| Retaceos | Distribuir costos de importacion sobre los productos recibidos. Subseccion de Ordenes. | RET-00024, calculado, aun sin verificar ni cerrar. |
| Inventario | Consultar existencias por ubicacion, kardex y ajustes justificados. | Filtrar Bodega de cubiertas - DEMO. |
| Usuarios, Roles y Permisos | La cuenta identifica a la persona; el rol agrupa autorizaciones; cada permiso habilita una operacion. | Mostrar configuracion sin conceder permisos durante la exposicion. |
| Bitacora | Consultar quien hizo una operacion y cuando. | Buscar operaciones de la carga DEMO. |

## Datos cargados

Una sucursal de demostracion, un almacen y dos espacios: DEMO-METAL-01 para piezas metalicas y DEMO-ACCES-01 para accesorios. Dos proveedores ficticios, uno de El Salvador y otro de Guatemala, con un contacto de Compras y un Repartidor cada uno.

| Producto | Codigo interno | Unidad de inventario | Saldo inicial | Recepcion | Existencia preparada |
| --- | --- | --- | ---: | ---: | ---: |
| Lamina galvanizada ondulada 3 m | PRD-003-000027 | Pieza | 40 | 10 | 50 |
| Tornillo autoperforante con arandela | PRD-003-000028 | Caja de 100 | 30 | 0 | 30 |
| Sellador de poliuretano 300 ml | PRD-003-000029 | Cartucho | 18 | 0 | 18 |
| Canaleta galvanizada 3 m | PRD-003-000030 | Pieza | 12 | 0 | 12 |
| Cumbrera galvanizada 2 m | PRD-003-000031 | Pieza | 20 | 5 | 25 |

Importante: 30 cajas de tornillos son 30 unidades de inventario de tipo Caja de 100, no 30 tornillos. No hay conversion automatica de cajas a piezas. Los saldos iniciales se registraron como ajustes de capacitacion, identificados en el kardex; no representan compras anteriores.

## Demostracion de compras paso a paso

### 1. Mostrar la necesidad

En Solicitudes abre PR-00024. Solicita 20 laminas y 10 cumbreras para el almacen DEMO. Ya esta aprobada. Explica que el borrador puede prepararse antes de enviarlo y que la aprobacion autoriza continuar el proceso, pero todavia no agrega existencias.

Para demostrar la aprobacion en vivo, abre PR-00025: pide 5 cajas de tornillos y 6 cartuchos de sellador. Esta enviada y pendiente. Si deseas avanzar realmente este ejemplo, pulsa Aprobar y confirma la accion. Esta operacion cambia su estado; no estara pendiente para la siguiente exposicion.

### 2. Comparar proveedores

En Cotizaciones abre las ofertas asociadas a PR-00024 o la subseccion de comparacion:

| Oferta | Proveedor ficticio | Precio lamina | Precio cumbrera | Total mercaderia | Entrega |
| --- | --- | ---: | ---: | ---: | --- |
| COT-00043 | Suministros de Cubiertas SV - DEMO | USD 25 | USD 14 | USD 640 | 3 dias |
| COT-00044 | Cubiertas Regionales GT - DEMO | USD 22 | USD 12 | USD 560 | 7 dias |

Ambas ofrecen la cantidad completa. COT-00044 ya esta seleccionada para construir el ejemplo. Explica que el menor precio no decide automaticamente: tambien cuentan entrega, disponibilidad y gastos adicionales. Estas ofertas usan impuesto cero solo para simplificar el ejemplo; no son una configuracion tributaria validada.

La comparacion muestra el importe cotizado, no necesariamente el costo final puesto en bodega. No presentes USD 560 como costo final de importacion.

### 3. Revisar la orden autorizada

En Ordenes de compra abre OC-00039, derivada de COT-00044. La orden paso por borrador y aprobacion antes de recibir mercaderia. Muestra los 20 y 10 solicitados y el seguimiento de la recepcion parcial. Registrar una orden no equivale a enviar un correo al proveedor ni a efectuar un pago.

### 4. Explicar la recepcion parcial

En la subseccion Recepciones abre RC-00031, con referencia ficticia DEMO-IMPORT-ATLAS-01. Entraron 10 laminas y 5 cumbreras a DEMO-METAL-01. Quedan pendientes otras 10 laminas y 5 cumbreras de OC-00039.

Si quieres completar la recepcion en vivo, vuelve a la orden y usa Recibir: introduce una referencia nueva claramente DEMO, la fecha y solo las cantidades pendientes, con la ubicacion DEMO-METAL-01. Revisa antes de confirmar. Esto aumentaria los saldos a 60 laminas y 30 cumbreras y cambiaria el estado de la orden; no lo repitas como si fuera una accion de consulta.

No agregues un ajuste manual por esa misma mercaderia: la recepcion ya registra la entrada automaticamente.

### 5. Explicar el retaceo

En Ordenes de compra > Retaceos abre RET-00024. Corresponde exclusivamente a RC-00031, no a toda la orden:

| Concepto de demostracion | Monto |
| --- | ---: |
| FOB: 10 laminas x USD 22 + 5 cumbreras x USD 12 | USD 280.00 |
| Flete | USD 30.00 |
| Otros gastos | USD 8.00 |
| DAI simulado | USD 12.00 |
| Costo total distribuido | USD 330.00 |
| IVA de importacion registrado por separado | USD 42.90 |

Explica la distribucion proporcional sobre FOB y muestra el costo unitario calculado de cada producto. Los montos de impuestos son didacticos: no certifican tasas aplicables, obligaciones fiscales ni condiciones de una importacion real.

El retaceo quedo Calculado para que puedas mostrar Verificar y luego Cerrar. Cerrar lo deja sin edicion; no pulses esta accion si quieres conservarlo disponible para practicar. El retaceo no agrega unidades otra vez ni sustituye automaticamente el costo maestro del producto. No se presenta como un motor de valuacion contable de inventario.

## Demostracion de inventario

Actualizacion: tambien esta disponible **Mapa de bodega**, con busqueda y detalle de pasillo, estante, nivel y posicion. Las nuevas recepciones ofrecen **Asignacion automatica**; consulta [reglas y funcionamiento](inventario-ubicaciones.md). Los nombres de sucursales y almacenes pueden haber sido editados despues de preparar esta guia; los codigos de documentos son los indicados al momento de la carga.

1. Entra a Inventario, pulsa Actualizar y elige Bodega de cubiertas - DEMO. Pulsa Buscar si cambias filtros.
2. En Existencias muestra producto, unidad, ubicacion y saldo. Contrasta las 50 laminas con 40 iniciales mas 10 recibidas.
3. En Kardex busca DEMO-AT-LAM-01. Muestra el ajuste inicial y la recepcion, sus cantidades, saldos, responsables y referencias. Puedes filtrar por tipo y fechas.
4. Para practicar un ajuste, pulsa Ajuste, elige sellador, el almacen DEMO y DEMO-ACCES-01. Selecciona Salida, cantidad 1 y motivo "DEMO - Diferencia detectada en conteo de capacitacion". La vista previa debe pasar de 18 a 17 si nadie modifico ese saldo. Puedes cancelar sin guardar para mantener el ejemplo original.
5. Si confirmas, se guarda un movimiento real en esta base de demostracion. Comprueba el nuevo saldo y su registro en Kardex. Una correccion posterior se documenta con otro ajuste justificado; no se borra el historial para ocultarla.

Para demostrar una validacion sin alterar datos, intenta una salida mayor al saldo disponible y revisa el mensaje. El sistema no debe permitir existencias negativas. Tampoco debe permitir desactivar un producto o ubicacion con stock positivo, ni cambiar la unidad de un producto que ya tiene historial.

## Que hacer si una accion no aparece

- Confirma que estas en Atlas roofing y que elegiste el almacen DEMO, no el almacen antiguo sin espacios.
- Si no aparecen los nuevos datos, pulsa Actualizar o recarga la pagina; limpia filtros de busqueda y fechas.
- Si falta un boton, revisa los permisos del usuario y el estado del documento. Aprobar, recibir y cerrar no son acciones disponibles en cualquier estado.
- Si la cotizacion esta vencida en una demostracion futura, crea una nueva oferta con fechas validas; no cambies el reloj ni el historial para forzarla.
- Si falla un guardado, lee el mensaje y revisa si el documento ya quedo registrado antes de volver a intentar. No repitas recepciones mediante ajustes.

## Cierre sugerido

"Podemos seguir una necesidad desde su solicitud hasta la ubicacion fisica del material. La aprobacion controla el proceso; las cotizaciones documentan la decision; la recepcion modifica cantidades y el retaceo explica costos. El kardex conserva la trazabilidad y los permisos limitan lo que cada usuario puede hacer."

## Verificacion y mantenimiento

La carga se hizo mediante las APIs del ERP, respetando sus validaciones y auditoria. Se ejecuto dos veces y devolvio los mismos documentos y existencias, sin duplicarlos. Se verificaron visualmente los cinco productos en Inventario.

Pasaron seis grupos de pruebas de empresa fija, ajustes e idempotencia, proteccion del historial, concurrencia y filtros, permisos de consulta y flujo de compra con recepcion y reversion. Estas pruebas no certifican ausencia absoluta de errores en todos los modulos.

El script backend/scripts/seed-atlas-demo.ts permite preparar este mismo escenario con las credenciales de entorno existentes; no contiene contrasenas. No es un reinicio de la demostracion: conserva registros y puede avanzar documentos DEMO que encuentre en estados previos. No lo ejecutes automaticamente en produccion ni despues de modificar el ejemplo sin revisar su estado. No se eliminaron productos antiguos ajenos al giro de techado; su depuracion requiere una decision aparte.
