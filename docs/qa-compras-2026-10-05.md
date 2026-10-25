# QA del flujo de Compras

Revisión terminada el 5 de octubre de 2026. Resultado: **aprobado para el escenario completo y los casos críticos ejecutados**, con verificaciones por API, servicios, base de datos y comportamiento de componentes Vue. No representa una certificación de todos los escenarios posibles ni una prueba visual de navegación en navegador.

## Caso único conservado

`DEMO-20261004-1963682E`, empresa Apex Roofing (ID 3), gestión ID 27. Creado el 4 de octubre, hora de El Salvador. Los datos son ficticios y se identifican con ese prefijo. Hay un solo escenario; sus varios documentos prueban sucursales, proveedores y entregas parciales.

| Requisito | Evidencia verificada |
| --- | --- |
| Solicitud en borrador y envío a Compras | PR-00115 y PR-00116; 100 y 400 tejas; borradores excluidos de la gestión |
| Agrupación por producto y fechas | Gestión 27: 500 tejas originales; detalle 100/400 por sucursal |
| Cantidad decidida independiente | Compras decide 600 tejas y agrega 10 láminas con cero solicitado; originales intactos |
| Solicitudes de cotización por proveedor | A consulta solamente tejas; B consulta tejas y láminas; productos y cantidades cargados del proceso |
| PDF y oferta separados | SC-04CA5605 y SC-233DB2D0; COT-00122 y COT-00123 registran las ofertas |
| Comparación y selección por producto | Tejas de A a $2 y láminas de B a $3; oferta alternativa de tejas de B a $2.40; condiciones, disponibilidad y entrega conservadas |
| Una orden por proveedor | OC-00112 y OC-00113, con referencia a sus ofertas y a la gestión; aprobadas y enviadas antes de recibir |
| Recepciones parciales y fases | RC-00089: 450 tejas; RC-00090: 10 láminas; RC-00091: 150 tejas; todas ubicadas, verificadas y cerradas |
| Gastos y retaceo | Tres retaceos cerrados: $1,050, $42 y $350; gasto real asignado una sola vez; IVA no capitalizable excluido |
| Viñeteo y ubicación real | Sugerencia sin existencias ni ocupación; código interno y confirmación del operador generan el movimiento; mapa final coincide con BD |
| Distribución con solicitud de origen | Norte recibe 30 + 70, Sur recibe 400; dos traslados completados; ambas solicitudes atendidas |

La agrupación sigue dentro de Cotizaciones: no se añadió un módulo independiente de Consolidados. Los destinos de compra siguen fijados al **Almacén General de Recursos e Insumos** (ID 39).

| Producto | Solicitado | Comprado | Recibido | Distribuido | Reserva general |
| --- | ---: | ---: | ---: | ---: | ---: |
| Tejas | 500 | 600 | 600 | 500 | 100 |
| Láminas | 0 | 10 | 10 | 0 | 10 |

Las cuatro existencias nuevas se conciliaron contra ocho movimientos. No hay cantidades en tránsito ni solicitudes pendientes. El espacio general de la prueba registra 110 unidades efectivamente colocadas.

Presupuesto de gastos: **$110**, separado de gastos reales. FOB neto: **$1,230**. Flete real: **$172**; otros gastos: **$30**; DAI: **$10**. Costo final: **$1,442**. Otros $60 de IVA registrados como no capitalizables no se reparten al costo. Las estimaciones no se suman de nuevo a los gastos reales.

## Problemas encontrados y corregidos

1. **Duplicación de entrada por mayúsculas del UUID.** Se reprodujo: recibir 30 unidades y repetir la referencia en mayúsculas registraba 60. Recepciones, ajustes, despachos y entradas de traslados ahora reconocen el mismo UUID sin distinguir mayúsculas, incluyendo referencias históricas. Una referencia reutilizada con otro contenido sigue rechazándose.
2. **Destino de traslado inactivo.** Se exige que espacio, almacén y sucursal destino estén activos y no eliminados, además de pertenecer a la sucursal solicitante.
3. **Solicitud archivada utilizada para avanzar la compra.** Se bloquean nuevas solicitudes a proveedor y generación de órdenes desde solicitudes enviadas a papelera.
4. **Reintento de adjudicación después de fallo de red.** La interfaz conserva la referencia del intento cuando la selección es igual; cambia la referencia solamente cuando cambia el contenido. Evita otra adjudicación tras una respuesta perdida.
5. **Oferta guardada pero confirmación fallida.** La interfaz recuerda el borrador ya creado y lo modifica en el siguiente intento, evitando intentar crear otra oferta para la misma solicitud a proveedor.
6. **Respuestas antiguas al cambiar de empresa.** Las operaciones capturan la empresa y la versión del contexto; sus respuestas no pintan datos antiguos ni desbloquean una operación nueva. Se limpian los catálogos y formularios al cambiar de empresa.
7. **Recepción bloqueada sin espacios configurados.** El formulario permite registrar cantidades reales y dejar la colocación pendiente. No inventa una ubicación ni una existencia. Cero unidades y cantidades superiores al saldo siguen bloqueadas.
8. **Fecha UTC en el PDF.** Se emite la fecha de El Salvador; una solicitud creada a las 01:35 UTC del día 5 muestra correctamente el día 4. Los dos PDFs se descargaron de nuevo y se revisaron renderizados, con acentos y productos correctos.

## Limpieza de datos anteriores

Se retiraron de gestión **66 registros anteriores** usando la papelera de 30 días: 9 solicitudes, 9 cotizaciones, 7 órdenes, 4 recepciones, 4 retaceos, 2 gestiones, 3 solicitudes a proveedor, 8 gastos reales, 2 traslados, 3 proveedores, 5 contactos y 10 tipos de gasto. No se purgaron físicamente.

Se respaldaron los datos y se comprobó, antes y después, que las **14 existencias y 20 movimientos históricos** no cambiaron. Otra comprobación después de finalizar la prueba confirmó los mismos hashes. Los maestros compartidos de productos, organización, clientes y usuarios se conservaron. Los movimientos antiguos siguen visibles en el historial de inventario por la política acordada de borrar documentos sin cancelar movimientos.

Respaldo local: `backend/tmp/purchase-backups/2026-10-05T01-34-41-091Z/before.json` y `archived.json`. La carpeta usa fecha UTC. Se verificó que las 66 entradas conservan plazo de 30 días y no están restauradas ni purgadas. Los históricos mantienen su relación y los documentos dependientes pueden necesitar restaurar primero sus referencias desde Administración → Configuración → Papelera.

La consulta independiente confirmó que **solo este escenario** tiene documentos activos: 2 solicitudes, 2 ofertas, 2 órdenes, 3 recepciones, 3 retaceos, 1 gestión, 2 solicitudes a proveedor, 2 traslados, 2 proveedores, 1 tipo de gasto y 9 gastos reales.

## Pruebas y alcance

- `verify-supply-workflow.ts`: nueve grupos por API y BD; fases, fechas, adjudicación parcial y ampliación, concurrencia, idempotencia, destinos inválidos, código interno, capacidad, gastos, costos, traslados y papelera. Sus registros temporales se eliminan al terminar.
- `verify-supply-edge-cases.ts`: recepción sin espacios; cancelación de recepción colocada con reversión única; reparto exacto de centavos en varios productos; cancelación/reemplazo de retaceo; inmutabilidad de cierres. Todo se revierte en una transacción, sin dejar otra prueba activa.
- `verify-retained-supply.ts`: conciliación independiente de los registros conservados, saldos, gastos, origen de adjudicaciones, mapa, históricos y conteos. Se repitieron **seis llamadas HTTP** de recepción/traslado con los UUID en mayúsculas sobre documentos ya completados; documentos, existencias y movimientos no cambiaron.
- Backend: **14 pruebas automatizadas aprobadas**, de permisos, proyección de gastos y PDF.
- Frontend: **70 pruebas automatizadas aprobadas**: 68 de reglas existentes y dos sobre el comportamiento real de los componentes de cotizaciones y recepción. Se compila el componente real; las respuestas de red se simulan para comprobar fallos y cambios de empresa. El formulario de recepción se renderiza por SSR. Esto no equivale a hacer clic en el navegador.
- Tipado de backend y frontend: aprobado. Compilación Vite: aprobada. Se conserva un aviso de empaquetado del almacén de autenticación que no impide la compilación.
- PDFs: extracción y renderizado de ambas páginas; contenido por proveedor, cantidades, fecha local, acentos y márgenes comprobados.

Evidencia local: `backend/tmp/demos/DEMO-20261004-1963682E/resultado.json`, `verificacion-independiente.json` y `verificacion-pdfs.json`; sin contraseñas ni tokens. Códigos completos en `docs/prueba-completa-compras.md`.

No se ejecutó una prueba visual de navegación con navegador: la aprobación automática rechazó ese acceso en esta sesión. Se usaron las verificaciones de API, BD, componentes y PDFs descritas arriba. La ergonomía visual en navegador y las integraciones externas reales quedan fuera de este resultado.

Para repetir controles sin borrar el caso conservado:

```powershell
# Desde backend, con la API iniciada:
npm run test:supply
npm run verify:supply-edges
npm run verify:supply-retained -- --run=DEMO-20261004-1963682E --backup=tmp/purchase-backups/2026-10-05T01-34-41-091Z --replay
# Desde frontend:
npm test
```

**No repetir** el archivado ni `demo:supply` para consultar la prueba: el primero la retiraría y el segundo crearía otro escenario. Si por la fecha ya pertenece a una semana anterior, se encuentra en **Anteriores** con su código o prefijo DEMO.
