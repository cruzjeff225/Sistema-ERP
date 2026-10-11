export const purchasingRoute = '/purchases';

export const purchasingGroups = [
  { id: 'overview', label: 'Visión general', description: 'Ve en qué etapa va cada compra y qué sigue.' },
  { id: 'preparation', label: 'Solicitudes y cotizaciones', description: 'Prepara lo que necesitas y elige la mejor oferta.' },
  { id: 'fulfillment', label: 'Órdenes y recepción', description: 'Formaliza la compra, recibe los productos y determina su costo.' },
] as const;

export const purchasingSections = [
  { id: 'tracking', label: 'Seguimiento', description: 'Ve en qué etapa va cada compra y quién debe actuar.', permission: 'purchases.view', group: 'overview', route: '/purchases/tracking' },
  { id: 'requests', label: 'Solicitudes', description: 'Crea y envía las necesidades de cada sucursal.', permission: 'purchase_requests.view', group: 'preparation', route: '/purchases/requests' },
  { id: 'quotations', label: 'Cotizaciones', description: 'Reúne solicitudes, consulta a proveedores, compara ofertas y genera las órdenes.', permission: 'purchase_quotations.view', group: 'preparation', route: '/purchases/quotations/manage' },
  { id: 'orders', label: 'Órdenes de compra', description: 'Autoriza y envía lo que se comprará a cada proveedor.', permission: 'purchase_orders.view', group: 'fulfillment', route: '/purchases/orders' },
  { id: 'receipts', label: 'Recepciones', description: 'Registra lo recibido y continúa con su ubicación.', permission: 'purchases.view', group: 'fulfillment', route: '/purchases/receipts' },
  { id: 'retaceos', label: 'Retaceo y costos', description: 'Distribuye los gastos reales entre los productos recibidos.', permission: 'retaceos.view', group: 'fulfillment', route: '/purchases/retaceos' },
  { id: 'suppliers', label: 'Proveedores', description: 'Gestiona los datos y contactos de tus proveedores.', permission: 'suppliers.view', group: 'support', route: '/suppliers' },
] as const;

export const purchasingPermissions = [...new Set(purchasingSections.map(section => section.permission))];
export const purchasingActiveRoutes = [purchasingRoute, ...purchasingSections.map(section => section.route), '/purchases/quotations', '/purchases/comparison', '/purchases/expense-types'];

export function visiblePurchasingSections(can: (permission: string) => boolean) {
  return purchasingSections.filter(section => can(section.permission));
}

export function purchasingSectionRoute(path: string) {
  if (path.startsWith('/purchases/tracking')) return '/purchases/tracking';
  if (path === '/purchases/quotations' || path === '/purchases/comparison') return '/purchases/quotations/manage';
  if (path === '/purchases/expense-types') return '/purchases/retaceos';
  return path;
}
