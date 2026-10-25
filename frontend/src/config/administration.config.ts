export type AdministrationSectionId = 'users' | 'roles' | 'permissions' | 'audit' | 'trash' | 'warehouse';

export const administrationRoute = '/administration/settings';

export const administrationGroups = [
  { id: 'access', label: 'Personas y accesos', description: 'Quién entra al sistema y qué puede hacer.' },
  { id: 'control', label: 'Actividad y recuperación', description: 'Consulta los cambios y recupera registros.' },
] as const;

export const administrationSections = [
  { id: 'users', label: 'Usuarios', description: 'Gestiona las cuentas de tu equipo.', permission: 'users.view', group: 'access', route: `${administrationRoute}/users`, previousRoute: '/users' },
  { id: 'roles', label: 'Roles y accesos', description: 'Define los accesos de cada puesto.', permission: 'roles.view', group: 'access', route: `${administrationRoute}/roles`, previousRoute: '/roles' },
  { id: 'audit', label: 'Bitácora', description: 'Revisa quién hizo cada cambio.', permission: 'logs.view', group: 'control', route: `${administrationRoute}/audit`, previousRoute: '/audit' },
  { id: 'trash', label: 'Papelera', description: 'Recupera registros eliminados durante 30 días.', permission: 'trash.view', group: 'control', route: `${administrationRoute}/trash`, previousRoute: '/administration/trash' },
  { id: 'warehouse', label: 'Centro de recepción de compras', description: 'Define el almacén general donde llegan las compras.', permission: 'warehouses.update', group: 'advanced', route: `${administrationRoute}/warehouse`, previousRoute: '/administration/warehouse-settings' },
  { id: 'permissions', label: 'Permisos del sistema', description: 'Configura las acciones disponibles por módulo.', permission: 'permissions.view', group: 'advanced', route: `${administrationRoute}/permissions`, previousRoute: '/permissions' },
] as const;

export const administrationPermissions = administrationSections.map(section => section.permission);

export function visibleAdministrationSections(can: (permission: string) => boolean) {
  return administrationSections.filter(section => can(section.permission));
}
