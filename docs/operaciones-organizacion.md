# Centro de Operaciones

El menú de Operaciones ofrece un único acceso al centro `/operations`. La pantalla agrupa los accesos sin cargar listas de registros, indicadores ni formularios:

- **Inventario y productos:** Existencias y mapa, Ubicar y distribuir y Productos.
- **Organización y espacios:** Empresa, Sucursales, Almacenes y Espacios.
- **Catálogos de apoyo:** Categorías de almacén, en un bloque desplegable. Se abre de entrada si es la única opción autorizada.

Cada pantalla ofrece un enlace de vuelta al centro y un selector con las secciones autorizadas. Los formularios de Organización y el ajuste de inventario conservan sus bloqueos de navegación por cambios pendientes. El selector vuelve a la sección real si se cancela la navegación.

Se conservan los destinos existentes `/inventory`, `/inventory/warehouse`, `/products` y `/organization/*`, sus permisos individuales y los enlaces de compras y del dashboard. El centro requiere al menos un permiso de consulta de estas secciones; cada cuenta sólo ve las opciones que puede consultar.

Al cambiar entre Almacenes y Espacios, se conserva el contexto válido de sucursal. Espacios puede conservar además el almacén elegido. Al ir a Empresa, Sucursales, categorías u otros módulos se limpia el contexto que no corresponde. Se utilizan las claves existentes `branch` y `warehouse`, sin propagar documentos de compras ni otros filtros.

Las categorías de almacén se identifican de forma explícita para distinguirlas de las categorías de productos. Productos mantiene sus categorías, subcategorías y unidades dentro de su propia pantalla. La recepción, ubicación confirmada, retaceo y distribución conservan su lógica operativa.

Productos carga con su permiso de consulta aunque la cuenta no pueda consultar los directorios completos de categorías, subcategorías o unidades. Sus filtros utilizan las opciones activas autorizadas por `/products/catalogs`. Las cuentas con los permisos correspondientes conservan las pestañas y los directorios completos.

Los colores y el foco de teclado utilizan los tokens actuales para los temas claro y oscuro. La revisión visual en navegador sigue pendiente para este cambio.

Verificación: TypeScript, Vite y las 65 pruebas existentes; rutas del sistema con historial en memoria para cada permiso individual, superadministrador y sesión anónima; conservación y limpieza del contexto de sucursal/almacén; carga de Productos con respuestas simuladas y cinco combinaciones de permisos.
