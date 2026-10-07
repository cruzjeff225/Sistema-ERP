# Inventario y espacios

Actualización del 3 de octubre de 2026. La navegación general del sistema conserva su organización anterior; estos cambios se concentran en Inventario, su mapa y la sección Espacios.

## Inventario

La pantalla presenta tres vistas: **Existencias**, **Mapa de bodega** y **Movimientos**. La consulta de existencias se ordena por producto, almacén y espacio. Los filtros de sucursal y almacén se aplican en el servidor, de modo que los resultados y la paginación corresponden al contexto elegido. El total cuenta registros por producto y ubicación, incluidos los saldos en cero; no representa productos únicos ni una suma de unidades.

Movimientos conserva la fecha de El Salvador, el producto, su ubicación, la cantidad que entró o salió y el saldo. Tipo de movimiento y rango de fechas se consultan en Más filtros. Motivo, usuario, recepción y referencia del retaceo se despliegan por registro. Los filtros de fecha y tipo se aplican solamente a movimientos.

La ficha de un producto consulta todas las páginas de sus existencias y las agrupa por almacén. Cada almacén puede desplegar sus ubicaciones. Ver ubicación abre su posición en el mapa; Ver movimientos conserva el producto, el almacén y el espacio de origen, incluidos los históricos. La búsqueda y los filtros se reinician al cambiar de empresa.

**Opciones de inventario** reúne Ajustar existencias, Ubicar y distribuir y Gestionar espacios, según permisos. El ajuste se realiza en un panel aparte y requiere revisar y confirmar antes de registrar el movimiento. No se elige un producto ni un espacio arbitrario cuando hay varias opciones. Se consultan el saldo actual y el saldo previsto; los reintentos conservan su referencia. Salir con cambios pendientes requiere descartarlos explícitamente.

## Mapa

Se elige primero la sucursal y luego su almacén. El mapa agrupa los espacios por pasillo y estante; muestra niveles y posiciones en orden natural. Un hueco sin registro no se convierte en un espacio seleccionable. Es una vista lógica sin escala construida con las coordenadas existentes.

Los filtros permiten buscar producto, SKU, código o coordenadas y acotar por pasillo o estado. El detalle del espacio seleccionado queda separado del mapa e indica coordenadas, estado, capacidad nominal y existencias confirmadas. El mapa conserva la elección de almacén al pasar a las otras vistas y la posición seleccionada al actualizar, si todavía existe.

Los estados son disponible, con existencias, lleno e inactivo. Los espacios eliminados siguen visibles cuando conservan existencias. Cuando hay unidades de compra distintas, la capacidad utilizada y libre no se suman ni se convierten en un porcentaje. El mapa permite ampliar, centrar un producto y navegar entre espacios mediante teclado.

Una ubicación sugerida no ocupa el mapa. La recepción permanece pendiente de viñeteo y colocación física; solo la confirmación del bodeguero genera existencias y el movimiento correspondiente. El proceso completo se describe en [flujo-abastecimiento.md](flujo-abastecimiento.md).

## Espacios

**Organización → Espacios** es un directorio por sucursal y almacén. Sin un almacén válido y explícito no se muestran posiciones de otras sucursales. El listado agrupa pasillos y estantes y mantiene separados código, nivel, posición, estado y capacidad nominal. Permite buscar por coordenadas o notas y filtrar pasillo y estado.

El editor se divide en Almacén, Identificación, Coordenadas y Capacidad. Conserva permisos, historial, papelera y guardas de cambios pendientes. Un usuario autorizado a consultar espacios puede utilizar los nombres de sus padres incluidos en esos registros sin necesitar abrir sus módulos. Los permisos de escritura y la disponibilidad real de los padres siguen siendo validados por el servidor.

La capacidad es una cantidad nominal de unidades de compra; no representa peso, volumen ni dimensiones del material. La pantalla define espacios y no modifica su ocupación.

## Verificación

- Compilación de Nest, tipos Vue y compilación Vite.
- `backend/scripts/verify-inventory-directory.ts`: comprobación de solo lectura de filtros por sucursal, paginación, orden y contexto de mapa mediante API y base de datos.
- `backend/scripts/verify-location-map.ts`: estados, capacidad, decimales, inactividad y unidades mixtas.
- `frontend/tests/location-directory.test.ts`: contexto de sucursal y almacén, filtros, agrupación, orden natural y catálogos heredados.
- `frontend/tests/warehouse-map.test.ts`: selección de almacén, sucursales con el mismo nombre y búsqueda de coordenadas.

La revisión visual en navegador no se realizó en este cambio; las comprobaciones de tipos y datos no sustituyen esa revisión.
