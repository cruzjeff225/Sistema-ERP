# Atlas Roofing: empresa unica

Fecha: 2026-09-25. Cambio de alcance autorizado por el usuario: ampliar inventario y operar exclusivamente para Atlas Roofing.

## Configuracion

- `erp_configuration` conserva una unica fila con FK hacia Atlas Roofing (registro existente, ID 3 en esta instalacion).
- No se eliminan empresas ni se migran proveedores, productos, compras o saldos entre empresas.
- La API resuelve la empresa desde esta configuracion. Una cabecera `X-Company-Id` distinta se rechaza incluso para superadministradores.
- Se elimina el selector del encabezado y la asignacion multiempresa en el formulario de usuarios. Nuevos usuarios se asocian a la empresa configurada desde servidor.
- Se conserva el acceso de usuarios previamente asignados a Atlas y de superadministradores; no se otorga acceso automaticamente a usuarios exclusivos de otras empresas.
- No se permite crear una segunda empresa ni desactivar la empresa operativa. Sus datos comerciales siguen siendo editables.
- Los IDs y relaciones de empresa permanecen en la BD para conservar integridad e historia; no implican que la aplicacion siga ofreciendo operacion multiempresa.
- La bitacora historica administrativa y los catalogos globales se conservan; no se han purgado historiales anteriores.

## Compras e inventario

- Compras tiene tres entradas principales: Solicitudes, Cotizaciones y Ordenes de compra.
- Comparacion es seccion de Cotizaciones; Recepciones, Retaceo y Tipos de gasto son secciones de Ordenes.
- Inventario incluye existencias por producto/ubicacion, filtros, paginacion, kardex y ajustes con motivo, actor y confirmacion.
- Cantidades en unidad de compra, precision de dos decimales. No incluye conversiones de unidades, lotes, series, ventas o valorizacion contable.
- Nuevas recepciones generan movimientos y saldos dentro de la transaccion de compra. Cancelaciones revierten solo entradas registradas por esta integracion y se rechazan si causarian saldo negativo.
- Ajustes tienen clave idempotente. Kardex no ofrece editar ni eliminar movimientos.
- Saldos previos quedan como apertura; no se vuelven a contabilizar recepciones historicas.

## Migraciones

- `20260925120000_inventory_movements`: kardex, constraint de saldo no negativo, apertura de saldos existentes, permisos inventory.view e inventory.adjust.
- `20260925140000_single_company_atlas`: configuracion singleton. Requiere exactamente una empresa activa cuyo nombre comercial sea Atlas Roofing. Para una instalacion nueva debe existir antes de aplicar esta migracion especifica de datos.

## Verificacion

- `scripts/verify-single-company.ts`: login devuelve solo Atlas, APIs rechazan otras empresas, empresa no desactivable, ajustes idempotentes, cantidades invalidas rechazadas, saldo y auditoria comprobados.
- Flujo probado bajo configuracion actual: solicitud aprobada, cotizacion seleccionada, orden aprobada, recepcion parcial, entrada en stock, cancelacion y restitucion unica de pendiente/saldo.
- Los fixtures son temporales, identificados por sus IDs; limpieza sin eliminar documentos operativos.
- La suite anterior de 15 grupos paso antes de activar empresa unica. Su fixture multiempresa ya no es compatible con esta configuracion: no se presenta como ejecutada despues del cambio. La suite vigente es verify-single-company.ts; falta trasladar los restantes casos monetarios y concurrencia a fixtures de empresa unica.
- No se certifica ausencia absoluta de bugs ni cumplimiento del 100% de todos los modulos por este cambio.

La ampliacion de inventario sustituye la decision anterior de dejarlo solo preparado en ERS v0.9. Los pendientes fiscales/subtotales/gastos del informe ERS anterior siguen pendientes; este cambio no los marca como resueltos.

## Mejora funcional posterior

- Un bloqueo transaccional compartido coordina compras, inventario y cambios de producto/estructura.
- Unidad de compra protegida cuando hay solicitudes, compras o stock asociado; evita reinterpretar cantidades historicas.
- Ubicaciones con historial no pueden cambiar de almacen; almacenes con inventario u ordenes no pueden cambiar de sucursal.
- Producto, ubicacion, almacen y sucursal con existencias positivas no pueden desactivarse. La comprobacion se hace dentro de la misma transaccion que el cambio.
- Kardex filtrable por tipo y rango de fechas inclusivo en zona de El Salvador; rechaza fechas invalidas o invertidas.
- Ajustes muestran saldo actual y proyectado; salidas superiores al saldo se advierten antes de enviar y se rechazan tambien en backend.
- Si no hay ubicaciones activas, se muestra la causa y acceso a Organizacion. No se crean registros ficticios para ocultar faltantes.
- Suite actual: seis grupos PASS, incluyendo usuario lector real sin permiso de ajuste, salidas simultaneas con saldo insuficiente y el flujo de compra/recepcion/reversion. Fixtures limpiados.
