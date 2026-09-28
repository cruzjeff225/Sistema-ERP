# Inventario: mapa y asignacion de ubicaciones

## Consulta

En Existencias pulsa el nombre del producto para abrir su detalle y luego **Ver ubicacion**. El icono de ubicacion de la fila abre el mismo mapa directamente. Se abre la bodega de esa existencia, se selecciona el espacio exacto y se resaltan todas las posiciones con saldo de ese producto en la bodega.

El mapa dispone de busqueda, ampliacion, centrado del producto y navegacion entre espacios con teclado. Los niveles conservan sus columnas de posicion; un hueco sin registro no se convierte en un espacio seleccionable. La leyenda combina colores e iconos: disponible (vacio activo), ocupado, lleno (alcanza o supera la capacidad nominal) e inactivo. Los inactivos sin stock tambien se muestran si no estan eliminados. Si las unidades no son comparables, no se calcula una ocupacion total ni se declara lleno a partir de esa suma.

**Ver movimientos**, en el detalle o junto a un producto del espacio seleccionado, abre el kardex filtrado por producto y ubicacion. El filtro se identifica sobre el listado y puede quitarse con la X; cambiar de bodega tambien lo retira. Esta navegacion no modifica cantidades ni genera movimientos.

En Inventario abre Mapa de bodega. Selecciona la bodega y busca un producto, SKU o codigo de espacio. Las coincidencias permanecen resaltadas sin cambiar el orden de los estantes. Selecciona un espacio para consultar sus productos, cantidades y unidad, junto con pasillo, estante, nivel y posicion.

El mapa se construye con los espacios registrados en Organizacion y las existencias de la base de datos. Incluye espacios vacios e inactivos; los eliminados solo se conservan visibles si todavia tienen stock. Los niveles se ordenan de arriba hacia abajo; las posiciones y estantes usan orden natural (2 antes de 10). Es una vista logica sin escala, no un plano arquitectonico ni una lectura de sensores.

Actualizar vuelve a consultar la base. No se inventan estantes ni se redistribuye el inventario existente. Si solo hay dos espacios configurados, el mapa mostrara esos dos espacios.

## Recepcion automatica

En Ordenes de compra, al recibir mercaderia, el selector Ubicacion ofrece Asignacion automatica de forma predeterminada. Tambien conserva la seleccion manual.

Al confirmar, el servidor decide el destino de cada linea dentro del almacen de la orden:

1. Prefiere un espacio activo con ese mismo producto y capacidad disponible.
2. Si no lo encuentra, busca un espacio activo vacio que admita toda la cantidad de la linea.
3. Desempata por pasillo, estante, nivel, posicion y codigo.
4. Reserva las cantidades de las otras lineas de esa recepcion antes de continuar. Las ubicaciones elegidas manualmente se reservan primero.
5. Registra la ubicacion en la recepcion, las existencias y el kardex en una misma transaccion. Las operaciones de inventario de la empresa se serializan para evitar asignaciones simultaneas incompatibles.

Si no hay un espacio compatible con capacidad suficiente, la operacion se rechaza sin crear una recepcion parcial accidental. Puede configurarse otro espacio o seleccionarse un destino manual tras revisarlo fisicamente. Una linea no se divide automaticamente entre varios espacios: se puede recibir una cantidad menor y registrar otra recepcion posteriormente.

La ubicacion definitiva se consulta en Recepciones y en el mapa despues de confirmar. El personal debe colocar fisicamente la mercaderia en el destino registrado. La asignacion digital no mueve objetos ni confirma que el operador ya los haya acomodado.

## Capacidad y compatibilidad

La capacidad existente en el modelo es una cantidad nominal de unidades de compra, no peso ni volumen. Para asignar automaticamente a un espacio ocupado, debe contener el mismo producto y todas sus existencias deben usar la misma unidad de compra. No se suman cajas y cartuchos para estimar capacidad. Si las unidades estan mezcladas, el mapa indica Unidades mixtas y la asignacion automatica evita ese espacio.

Un espacio con productos distintos pero la misma unidad solo puede reutilizarse automaticamente para un producto que ya este alli. Un producto nuevo se coloca en un espacio vacio. La seleccion manual conserva su comportamiento anterior y no constituye una certificacion de capacidad fisica.

Antes de usarlo en una bodega real deben verificarse dimensiones, peso admisible, compatibilidad del material y capacidades configuradas. Estos atributos no existen aun en el modelo, por lo que el algoritmo no puede garantizar que una lamina de tres metros quepa fisicamente en cualquier estante vacio. No utiliza inteligencia artificial ni genera coordenadas supuestas.

## Acceso a seguridad

La llave se retiro del encabezado. Seguridad de mi cuenta permanece junto al nombre y correo del usuario, al pie del menu lateral. No se eliminaron el cambio de contrasena ni sus validaciones.

## Verificacion

- Compilacion del backend y comprobacion de tipos del frontend.
- Script verify-location-allocation.ts: prioridad del producto, espacio vacio, capacidad, reservas por linea, orden natural, rechazo de unidades mixtas y ausencia de espacios.
- Script verify-location-map.ts: estados y capacidad, decimales, sobrecapacidad, inactividad heredada y unidades mixtas.
- Script verify-single-company.ts: empresa, permisos, ajustes, concurrencia, historial, recepcion automatica, rechazo por capacidad sin escrituras parciales, consulta de mapa y reversion.
- Comprobacion visual del encabezado, mapa, busqueda y detalle de las existencias en pantalla estrecha y escritorio.
