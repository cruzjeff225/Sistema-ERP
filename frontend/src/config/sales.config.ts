export const salesRoute = '/sales';

export const salesGroups = [
  { id: 'customers', label: 'Directorio comercial', description: 'Mantén a mano los datos de tus clientes para atender cada operación.' },
] as const;

export const salesSections = [
  { id: 'customers', label: 'Clientes', description: 'Busca, registra y actualiza los datos de contacto y ubicación.', permission: 'customers.view', group: 'customers', route: '/sales/customers' },
] as const;

export const salesPermissions = [...new Set(salesSections.map(section => section.permission))];
export const salesActiveRoutes = [salesRoute, '/customers', ...salesSections.map(section => section.route)];
export function visibleSalesSections(can: (permission: string) => boolean) {
  return salesSections.filter(section => can(section.permission));
}
