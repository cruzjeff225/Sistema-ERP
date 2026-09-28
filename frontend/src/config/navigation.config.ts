import type { Component } from "vue";
import {
  Building2,
  ClipboardList,
  FileSearch,
  KeyRound,
  LayoutDashboard,
  Package,
  ShoppingCart,
  Truck,
  ShieldCheck,
  Users,
} from "lucide-vue-next";

export interface NavigationItem {
  label: string;
  route: string;
  icon: Component;
  permission: string | null;
  sections?: { label: string; route: string; permission: string }[];
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
      { label: "Inventario", route: "/inventory", icon: Package, permission: "inventory.view" },
      {
        label: "Bitacora",
        route: "/audit",
        icon: ClipboardList,
        permission: "logs.view",
      },
    ],
  },
  {
    label: "Compras",
    items: [
      {
        label: "Solicitudes",
        route: "/purchases/requests",
        icon: ClipboardList,
        permission: "purchase_requests.view",
      },
      {
        label: "Cotizaciones",
        route: "/purchases/quotations",
        icon: FileSearch,
        permission: "purchase_quotations.view",
        sections: [
          { label: "Cotizaciones", route: "/purchases/quotations", permission: "purchase_quotations.view" },
          { label: "Comparacion de ofertas", route: "/purchases/comparison", permission: "purchase_quotations.view" },
        ],
      },
      {
        label: "Órdenes de compra",
        route: "/purchases/orders",
        icon: ShoppingCart,
        permission: "purchase_orders.view",
        sections: [
          { label: "Ordenes", route: "/purchases/orders", permission: "purchase_orders.view" },
          { label: "Recepciones", route: "/purchases/receipts", permission: "purchases.view" },
          { label: "Retaceo", route: "/purchases/retaceos", permission: "retaceos.view" },
          { label: "Tipos de gasto", route: "/purchases/expense-types", permission: "expense_types.view" },
        ],
      },
    ],
  },
];
