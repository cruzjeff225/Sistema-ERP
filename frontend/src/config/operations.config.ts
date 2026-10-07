export const operationsRoute = '/operations';

export const operationsGroups = [
  { id: 'daily', label: 'Inventario y productos', description: 'Consulta existencias y gestiona los recursos de cada día.' },
  { id: 'structure', label: 'Organización y espacios', description: 'Mantén en orden la empresa y sus lugares de almacenamiento.' },
] as const;

export const operationsSections = [
  { id: 'inventory', label: 'Existencias y mapa', description: 'Encuentra productos y revisa sus movimientos.', permission: 'inventory.view', group: 'daily', route: '/inventory' },
  { id: 'warehouse', label: 'Bodega', description: 'Ubica productos recibidos y prepara entregas a sucursales.', permission: 'inventory.view', group: 'daily', route: '/inventory/warehouse' },
  { id: 'products', label: 'Productos', description: 'Artículos, categorías y unidades de medida.', permission: 'products.view', group: 'daily', route: '/products' },
  { id: 'company', label: 'Empresa', description: 'Datos generales e identidad de la empresa.', permission: 'companies.view', group: 'structure', route: '/organization' },
  { id: 'branches', label: 'Sucursales', description: 'Organiza los puntos de operación.', permission: 'branches.view', group: 'structure', route: '/organization/branches' },
  { id: 'warehouses', label: 'Almacenes', description: 'Gestiona las bodegas de cada sucursal.', permission: 'warehouses.view', group: 'structure', route: '/organization/warehouses' },
  { id: 'locations', label: 'Espacios', description: 'Define pasillos, estantes, niveles y posiciones.', permission: 'locations.view', group: 'structure', route: '/organization/locations' },
  { id: 'categories', label: 'Categorías de almacén', description: 'Clasifica los almacenes de la organización.', permission: 'warehouse_categories.view', group: 'support', route: '/organization/categories' },
] as const;

export const operationsPermissions = [...new Set(operationsSections.map(section => section.permission))];

export function visibleOperationsSections(can: (permission: string) => boolean) {
  return operationsSections.filter(section => can(section.permission));
}

/** Retain the chosen branch/warehouse only when navigating within its organization. */
export function operationsSectionQuery(currentPath: string, destination: string, query: { branch?: unknown; warehouse?: unknown }) {
  if (!currentPath.startsWith('/organization') || !destination.startsWith('/organization')) return {};
  const validId = (value: unknown) => typeof value === 'string' && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value));
  const next: { branch?: string; warehouse?: string } = {};
  if ((destination === '/organization/warehouses' || destination === '/organization/locations') && validId(query.branch)) next.branch = query.branch as string;
  if (destination === '/organization/locations' && validId(query.warehouse)) next.warehouse = query.warehouse as string;
  return next;
}
