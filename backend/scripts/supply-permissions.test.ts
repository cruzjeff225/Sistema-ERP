import assert from 'node:assert/strict';
import test from 'node:test';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { PermissionsGuard } from '../src/common/guards/permissions.guard';
import { PurchaseOrdersController } from '../src/modules/purchases/presentation/purchases.controller';
import { SupplyWorkflowController } from '../src/modules/purchases/presentation/supply-workflow.controller';
import { RetaceosController } from '../src/modules/purchases/presentation/retaceos.controller';
import { PurchaseReceiptsController } from '../src/modules/purchases/presentation/purchase-receipts.controller';

const guard = new PermissionsGuard(new Reflector());
function allowed(controller: any, method: string, permissions: string[]) {
  assert.equal(typeof controller.prototype[method], 'function');
  const context = { getHandler: () => controller.prototype[method], getClass: () => controller, switchToHttp: () => ({ getRequest: () => ({ user: { roles: ['qa'], permissions } }) }) } as ExecutionContext;
  return guard.canActivate(context);
}
for (const [method, permissions] of [
  ['create', ['purchase_quotations.create', 'purchase_requests.view']],
  ['line', ['purchase_quotations.update']], ['rfq', ['purchase_quotations.create']],
  ['submitQuantities', ['purchase_quotations.update']],
  ['approveQuantities', ['purchase_orders.approve']],
  ['returnQuantities', ['purchase_orders.approve']],
  ['award', ['purchase_quotations.select', 'purchase_orders.create']],
  ['awardAndSubmit', ['purchase_quotations.select', 'purchase_orders.create', 'purchase_orders.update']],
  ['place', ['inventory.adjust']], ['dispatch', ['inventory.adjust', 'purchase_requests.view']],
  ['receive', ['inventory.adjust']], ['expense', ['purchase_expenses.create']],
] as const) {
  test('compras: ' + method + ' exige permisos de operación y bloquea consulta', () => {
    assert.throws(() => allowed(SupplyWorkflowController, method, ['purchase_requests.view', 'purchase_quotations.view', 'purchase_orders.view', 'purchases.view', 'inventory.view']), (error: any) => error.getStatus() === 403);
    assert.equal(allowed(SupplyWorkflowController, method, [...permissions]), true);
    for (const permission of permissions) assert.throws(() => allowed(SupplyWorkflowController, method, permissions.filter(value => value !== permission)), (error: any) => error.getStatus() === 403);
  });
}
test('compras: verificar/cerrar recepción y retaceo tienen permisos separados', () => {
  for (const [controller, method, permission] of [[PurchaseReceiptsController, 'verify', 'purchases.update'], [PurchaseReceiptsController, 'close', 'purchases.close'], [RetaceosController, 'verify', 'retaceos.verify'], [RetaceosController, 'close', 'retaceos.close']] as const) {
    assert.throws(() => allowed(controller, method, ['purchases.view', 'retaceos.view']), (error: any) => error.getStatus() === 403);
    assert.equal(allowed(controller, method, [permission]), true);
  }
});

test('comparación de ofertas permite consulta sin conceder adjudicación', () => {
  assert.equal(allowed(SupplyWorkflowController, 'compare', ['purchase_quotations.view']), true);
  assert.throws(() => allowed(SupplyWorkflowController, 'compare', ['purchase_requests.view']), (error: any) => error.getStatus() === 403);
});
test('aprobación, rechazo y devolución exigen Gerencia; editar exige permiso independiente', () => {
  for (const method of ['approve','reject','returnForChanges']) {
    assert.throws(() => allowed(PurchaseOrdersController, method, ['purchase_orders.update','purchase_orders.view']), (error: any) => error.getStatus() === 403);
    assert.equal(allowed(PurchaseOrdersController, method, ['purchase_orders.approve']), true);
  }
  assert.throws(() => allowed(PurchaseOrdersController, 'update', ['purchase_orders.approve']), (error: any) => error.getStatus() === 403);
  assert.equal(allowed(PurchaseOrdersController, 'update', ['purchase_orders.update']), true);
});

test('centro general se consulta por compras o por administración; editar sigue reservado a almacenes', () => {
  assert.equal(allowed(SupplyWorkflowController, 'configuration', ['purchase_requests.view']), true);
  assert.equal(allowed(SupplyWorkflowController, 'configuration', ['warehouses.update']), true);
  assert.throws(() => allowed(SupplyWorkflowController, 'configuration', ['inventory.view']), (error:any) => error.getStatus() === 403);
  assert.throws(() => allowed(SupplyWorkflowController, 'configure', ['purchase_requests.view']), (error:any) => error.getStatus() === 403);
  assert.equal(allowed(SupplyWorkflowController, 'configure', ['warehouses.update']), true);
});

test('Gerencia revisa cantidades sin permisos de edición de cotizaciones y Compras no puede autorizarlas', () => {
  for (const method of ['list','one','line','approveQuantities','returnQuantities']) {
    assert.equal(allowed(SupplyWorkflowController,method,['purchase_orders.approve']),true);
  }
  for (const method of ['approveQuantities','returnQuantities']) {
    assert.throws(()=>allowed(SupplyWorkflowController,method,['purchase_quotations.update']),(e:any)=>e.getStatus()===403);
  }
  assert.throws(()=>allowed(SupplyWorkflowController,'submitQuantities',['purchase_orders.approve']),(e:any)=>e.getStatus()===403);
});
