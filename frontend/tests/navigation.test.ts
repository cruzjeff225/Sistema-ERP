import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activeSectionRoute, navigationGroups } from '../src/config/navigation.config';

const item = (label: string) => navigationGroups.flatMap(group => group.items).find(entry => entry.label === label)!;

test('cada módulo del menú lleva sus páginas debajo', () => {
  assert.deepEqual(item('Compras').sections!.map(section => section.label), ['Seguimiento', 'Solicitudes', 'Cotizaciones', 'Órdenes de compra', 'Recepciones', 'Retaceo y costos', 'Proveedores']);
  assert.deepEqual(item('Ventas').sections!.map(section => section.label), ['Clientes']);
  assert.ok(item('Operaciones').sections!.some(section => section.label === 'Bodega'));
  assert.ok(item('Configuración').sections!.some(section => section.label === 'Usuarios'));
  assert.equal(item('Inicio').sections, undefined);
});

test('las páginas de un módulo conservan el permiso que pide cada una', () => {
  const sections = item('Compras').sections!;
  assert.equal(sections.find(section => section.label === 'Retaceo y costos')!.permission, 'retaceos.view');
  assert.equal(sections.find(section => section.label === 'Órdenes de compra')!.permission, 'purchase_orders.view');
});

test('se resalta la página más específica y sigue resaltada en sus pantallas internas', () => {
  const purchases = item('Compras').sections, operations = item('Operaciones').sections;
  assert.equal(activeSectionRoute(purchases, '/purchases/tracking/request/12'), '/purchases/tracking');
  assert.equal(activeSectionRoute(purchases, '/purchases/quotations/manage'), '/purchases/quotations/manage');
  assert.equal(activeSectionRoute(purchases, '/purchases/quotations'), '/purchases/quotations/manage', 'las ofertas anteriores pertenecen a Cotizaciones');
  assert.equal(activeSectionRoute(purchases, '/purchases/comparison'), '/purchases/quotations/manage');
  assert.equal(activeSectionRoute(purchases, '/purchases/requests/24'), '/purchases/requests');
  assert.equal(activeSectionRoute(operations, '/inventory/warehouse'), '/inventory/warehouse', 'Bodega y no Existencias');
  assert.equal(activeSectionRoute(operations, '/inventory'), '/inventory');
  assert.equal(activeSectionRoute(operations, '/organization/branches'), '/organization/branches');
  assert.equal(activeSectionRoute(purchases, '/dashboard'), null);
  assert.equal(activeSectionRoute(undefined, '/purchases'), null);
});
