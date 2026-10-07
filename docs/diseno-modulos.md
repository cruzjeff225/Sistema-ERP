# Diseño común de módulos

Operaciones, Compras, Ventas y Configuración comparten una pantalla de accesos mediante `ModuleDirectory.vue`. Presenta títulos, descripciones breves, iconos discretos y opciones agrupadas sobre tarjetas con bordes suaves. Las opciones de apoyo se despliegan al solicitarlas y se muestran abiertas cuando son lo único autorizado.

Cada módulo conserva su configuración de destinos y permisos. El directorio no consulta registros ni carga formularios de sus secciones; estas se abren al seleccionar un acceso.

Ventas comienza con el acceso a Clientes, autorizado mediante `customers.view`. Su directorio y ficha separan búsqueda, contacto y ubicación; el registro se realiza en un formulario lateral. Los filtros de estado y la búsqueda sustituyen listados completos. [Detalles y verificación de esta etapa](ventas-clientes.md).

`ModuleSectionNav.vue` proporciona un enlace para volver al centro y un selector compacto de secciones. Los destinos se filtran por permisos y el selector restaura la sección real si un formulario cancela la navegación.

Compras se organiza en:

- **Solicitudes y cotizaciones:** Solicitudes, Cotizaciones y Comparar ofertas.
- **Órdenes y recepción:** Órdenes de compra, Recepciones y Retaceo y costos.
- **Directorio de proveedores:** Proveedores.

El centro de Compras está en `/purchases`. Se conservan las rutas de sus documentos y sus filtros semanales. La gestión de cotizaciones mantiene su contexto dentro de Cotizaciones; los tipos de gasto se configuran desde Retaceo. Al cambiar de sección mediante el selector se limpian los parámetros de documento, porque los identificadores tienen significados diferentes en cada pantalla. Los enlaces de continuación de cada proceso conservan sus correspondencias específicas.

El acceso del dashboard a Compras abre el centro, incluido para cuentas que sólo pueden consultar recepciones, retaceos o proveedores. La página de seguridad personal utiliza el mismo lenguaje visual de tarjetas, iconos y espaciado.

Proveedores carga sus contactos sólo con el permiso correspondiente. Sus solicitudes y mutaciones capturan la empresa original; cambiar de empresa limpia la selección, filas y paneles e impide que las respuestas anteriores se muestren en el nuevo contexto.

El diseño utiliza los colores existentes de los temas claro y oscuro. No se realizó verificación visual en navegador en este cambio.

Validación: TypeScript y compilación de Vite; 65 pruebas existentes; permisos individuales y rutas del centro de Compras; selector ante navegación cancelada, fallida y destinos ocultos; renderizado del HTML de los tres centros en ambos temas con opciones autorizadas; cinco escenarios simulados de Proveedores, incluidos cambios de empresa y respuestas fuera de orden. Estas comprobaciones no insertan datos en la base de datos.

## Organización interior de Compras

Las pantallas de documentos usan un encabezado común y controles compactos para cambiar de vista. Solicitudes, ofertas, órdenes, recepciones y retaceos separan la bandeja del documento seleccionado. La búsqueda y los filtros están en la bandeja; «Esta semana» presenta el período actual y «Anteriores» permite consultar todos los registros y filtrar fechas. Los enlaces directos a documentos históricos abren el período correspondiente.

La acción para continuar el proceso permanece junto al código y estado del documento. Las fechas requeridas, la vigencia de las ofertas y las entregas esperadas están visibles. Los productos, las entregas a sucursal, las recepciones, los gastos y la información de origen se consultan en vistas locales, sin volver a cargar el documento ni alterar sus cantidades. Cambiar de documento restablece la vista de productos.

La gestión de cotizaciones ofrece accesos directos a productos, proveedores, ofertas y órdenes. El comparativo presenta los proveedores lado a lado para el producto activo, muestra disponibilidad y entrega, y mantiene separada la selección por proveedor. Las condiciones y el desglose se despliegan al consultarlos. Cambiar de compra con productos seleccionados requiere confirmar el descarte; cancelar conserva la selección.

Recepciones permite revisar la factura antes de verificar y separa ubicación confirmada, importes y documentos. Retaceo concentra el detalle monetario en Gastos y mantiene explícito que el IVA de importación está excluido del costo. Sus recepciones elegibles siguen disponibles aunque sean anteriores a la semana actual. Los tipos de gasto se configuran desde Retaceo.

Esta reorganización no cambia los centros de módulos, las rutas, los permisos ni los cálculos del proceso de compras. Usa los colores existentes de ambos temas y componentes `PurchaseSectionHeader.vue` y `PurchaseTabs.vue`.

Validación: TypeScript, compilación de producción y 65 pruebas existentes correctas; renderizado SSR de las tres clases de documento con sus vistas y permisos; acceso histórico y contexto de recepción del retaceo; cambios de compra, período y vista ante selección o edición sin guardar. El servidor de desarrollo entrega las cinco vistas y la API responde correctamente. No se insertaron datos ni se realizó revisión visual en navegador.
