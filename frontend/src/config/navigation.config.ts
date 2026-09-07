import type { Component } from "vue";
import {
  Building2,
  ClipboardList,
  KeyRound,
  LayoutDashboard,
  Package,
  Truck,
  ShieldCheck,
  Users,
} from "lucide-vue-next";

export interface NavigationItem {
  label: string;
  route: string;
  icon: Component;
  permission: string | null;
}

export interface NavigationGroup {
  label: string;
  items: NavigationItem[];
}

export const navigationGroups: NavigationGroup[] = [
  {
    label: "General",
    items: [
      {
        label: "Dashboard",
        route: "/dashboard",
        icon: LayoutDashboard,
        permission: null,
      },
    ],
  },
  {
    label: "Administracion",
    items: [
      {
        label: "Usuarios",
        route: "/users",
        icon: Users,
        permission: "users.view",
      },
      {
        label: "Roles",
        route: "/roles",
        icon: ShieldCheck,
        permission: "roles.view",
      },
      {
        label: "Permisos",
        route: "/permissions",
        icon: KeyRound,
        permission: "permissions.view",
      },
      {
        label: "Organizacion",
        route: "/organization",
        icon: Building2,
        permission: "companies.view",
      },
      {
        label: "Proveedores",
        route: "/suppliers",
        icon: Truck,
        permission: "suppliers.view",
      },
      {
        label: "Productos",
        route: "/products",
        icon: Package,
        permission: "products.view",
      },
      {
        label: "Clientes",
        route: "/customers",
        icon: Users,
        permission: "customers.view",
      },
      {
        label: "Bitacora",
        route: "/audit",
        icon: ClipboardList,
        permission: "logs.view",
      },
    ],
  },
];
