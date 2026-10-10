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
import { purchasingActiveRoutes, purchasingPermissions, purchasingRoute } from './purchasing.config';
import { salesActiveRoutes, salesPermissions, salesRoute } from './sales.config';

export interface NavigationItem {
  label: string;
  route: string;
  icon: Component;
  permission: string | null;
  permissionsAny?: readonly string[];
  activeRoutes?: readonly string[];
  /** Dynamic screens (with route params) that belong to this item. */
  activePrefixes?: readonly string[];
  sections?: { label: string; route: string; permission: string }[];
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
      },
    ],
  },
  {
    label: "Ventas",
    items: [
      { label: "Ventas", route: salesRoute, icon: Handshake, permission: null, permissionsAny: salesPermissions, activeRoutes: salesActiveRoutes },
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
      },
    ],
  },
];
