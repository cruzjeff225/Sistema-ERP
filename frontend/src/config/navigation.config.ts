import type { Component } from "vue";
import { LayoutDashboard, Users, ShieldCheck, KeyRound } from "lucide-vue-next";

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
    label: "Administración",
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
    ],
  },
];
