# Administración y configuración

Administración presenta un único acceso a Configuración. La pantalla inicial contiene opciones agrupadas, sin consultar ni desplegar listas de registros hasta que se abre una sección:

- **Personas y accesos:** Usuarios y Roles y accesos.
- **Actividad y recuperación:** Bitácora y Papelera.
- **Opciones avanzadas:** Permisos del sistema, en un bloque desplegable. Si es la única opción autorizada, aparece abierto.

Cada sección ofrece un enlace para volver a Configuración y un selector con las demás secciones autorizadas. Los colores utilizan los mismos tokens del sistema para los temas claro y oscuro.

El centro está en `/administration/settings`, con las secciones en `/users`, `/roles`, `/audit`, `/trash` y `/permissions` dentro de esa ruta. Las direcciones anteriores (`/users`, `/roles`, `/permissions`, `/audit`, `/administration/trash`) redirigen a sus nuevas ubicaciones conservando filtros y fragmentos. Los nombres de ruta se mantienen.

El acceso al centro requiere al menos un permiso de consulta de sus secciones. Cada sección conserva su permiso propio y los controles de escritura existentes. Este cambio no modifica los módulos de Compras, Inventario u Organización.

Los listados de Usuarios, Roles y Permisos no requieren acceso a sus catálogos secundarios para consultarse. Crear y editar requieren poder consultar el catálogo necesario; los controles independientes de estado, contraseñas, desbloqueo y eliminación mantienen sus permisos. El filtro por módulo puede usar los módulos que ya vienen incluidos en los permisos visibles.

La Papelera conserva la recuperación durante 30 días y el comportamiento de mantener los movimientos de inventario al retirar documentos de la gestión.

Verificación: compilación de TypeScript y Vite; 65 pruebas existentes; navegación con el enrutador en memoria para cada permiso individual, enlaces anteriores con filtros y fragmentos, superadministrador y sesión anónima; carga de los tres listados con respuestas simuladas y permiso individual. No se realizó revisión visual en navegador en este cambio.

## Centro de recepción de compras

La selección del centro general se encuentra en Configuración → Opciones avanzadas → Centro de recepción de compras. Usa los almacenes y permisos existentes, sin un módulo de negocio adicional. El cambio sigue validado por el backend: centro activo de la empresa y ausencia de existencias, recepciones sin colocar y órdenes abiertas en el centro anterior. La ruta antigua de Bodega con `tab=configuration` redirige aquí.

Bodega inicia con Ubicar productos y Trasladar a sucursales; los gastos de recepción aparecen como acceso secundario. Los enlaces por recepción o solicitud mantienen su documento y los cambios de tarea pasan por el control existente de datos sin guardar. La vista inicial no carga formularios ni listados financieros.
