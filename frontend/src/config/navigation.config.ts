import type { Component } from "vue";
import {
  LayoutDashboard,
  ShoppingCart,
  Handshake,
  Settings2,
  Boxes,
} from "lucide-vue-next";
import { administrationPermissions, administrationRoute, administrationSections } from './administration.config';
import { operationsPermissions, operationsRoute, operationsSections } from './operations.config';
import { purchasingActiveRoutes, purchasingPermissions, purchasingRoute, purchasingSections } from './purchasing.config';
import { salesActiveRoutes, salesPermissions, salesRoute, salesSections } from './sales.config';

export interface NavigationItem {
  label: string;
  route: string;
  icon: Component;
  permission: string | null;
  permissionsAny?: readonly string[];
  activeRoutes?: readonly string[];
  /** Dynamic screens (with route params) that belong to this item. */
  activePrefixes?: readonly string[];
  /** The pages of the module, shown under it in the menu. */
  sections?: NavigationSection[];
}

export interface NavigationSection {
  label: string;
  route: string;
  permission: string;
  /** Other screens that belong to this page, so it stays highlighted while the user is in them. */
  also?: readonly string[];
}

const pagesOf = (sections: readonly { label: string; route: string; permission: string }[], also: Record<string, readonly string[]> = {}): NavigationSection[] =>
  sections.map(section => ({ label: section.label, route: section.route, permission: section.permission, also: also[section.route] }));

/** The page of a module that matches the current path: the most specific one, so "/inventory/warehouse" is Warehouse and not Inventory. */
export function activeSectionRoute(sections: readonly NavigationSection[] | undefined, path: string): string | null {
  const matches = (section: NavigationSection) => [section.route, ...(section.also ?? [])].some(route => path === route || path.startsWith(route + '/'));
  const hits = (sections ?? []).filter(matches);
  return hits.sort((a, b) => b.route.length - a.route.length)[0]?.route ?? null;
}

export interface NavigationGroup {
  label: string;
  items: NavigationItem[];
}

export const navigationGroups: NavigationGroup[] = [
  {
    label: "Inicio",
    items: [
      {
        label: "Inicio",
        route: "/dashboard",
        icon: LayoutDashboard,
        permission: null,
      },
    ],
  },
  {
    label: "Operaciones",
    items: [
      {
        label: "Operaciones",
        route: operationsRoute,
        icon: Boxes,
        permission: null,
        permissionsAny: operationsPermissions,
        activeRoutes: [operationsRoute, ...operationsSections.map(section => section.route)],
        sections: pagesOf(operationsSections),
      },
    ],
  },
  {
    label: "Compras",
    items: [
      {
        label: "Compras",
        route: purchasingRoute,
        icon: ShoppingCart,
        permission: null,
        permissionsAny: purchasingPermissions,
        activeRoutes: purchasingActiveRoutes,
        activePrefixes: ['/purchases/tracking/', '/purchases/requests/'],
        sections: pagesOf(purchasingSections, { '/purchases/quotations/manage': ['/purchases/quotations', '/purchases/comparison'] }),
      },
    ],
  },
  {
    label: "Ventas",
    items: [
      { label: "Ventas", route: salesRoute, icon: Handshake, permission: null, permissionsAny: salesPermissions, activeRoutes: salesActiveRoutes, sections: pagesOf(salesSections) },
    ],
  },
  {
    label: "Administración",
    items: [
      {
        label: "Configuración",
        route: administrationRoute,
        icon: Settings2,
        permission: null,
        permissionsAny: administrationPermissions,
        activeRoutes: [administrationRoute, ...administrationSections.map(section => section.route)],
        sections: pagesOf(administrationSections),
      },
    ],
  },
];
