import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("La variable de entorno DATABASE_URL no esta configurada en el archivo .env");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const MODULES = [
  "users",
  "roles",
  "permissions",
  "modules",
  "companies",
  "branches",
  "warehouse_categories",
  "warehouses",
  "locations",
  "logs",
  "suppliers",
  "supplier_contacts",
  "dashboard",
] as const;

type ModuleName = (typeof MODULES)[number];

const REMOVED_MODULES = [
  "customers",
  "products",
  "inventory",
  "purchases",
  "quotations",
  "sales",
  "transfers",
  "vehicles",
  "drivers",
];

const REMOVED_PERMISSION_ACTIONS = [
  "customers.view",
  "customers.create",
  "customers.update",
  "products.view",
  "products.create",
  "products.update",
  "inventory.view",
  "inventory.update",
  "purchases.view",
  "purchases.create",
  "quotations.view",
  "quotations.create",
  "sales.view",
  "sales.create",
  "transfers.view",
  "transfers.create",
  "vehicles.view",
  "vehicles.create",
  "vehicles.update",
  "drivers.view",
  "drivers.create",
  "drivers.update",
];

const PERMISSIONS: Array<{
  action: string;
  name: string;
  description: string;
  module: ModuleName;
  isSystem: boolean;
}> = [
  ["users.view", "Ver usuarios", "Permite listar y consultar usuarios", "users"],
  ["users.create", "Crear usuarios", "Permite crear nuevos usuarios", "users"],
  ["users.update", "Actualizar usuarios", "Permite editar usuarios existentes", "users"],
  ["users.delete", "Eliminar usuarios", "Permite eliminar usuarios", "users"],
  ["users.assign_roles", "Asignar roles a usuarios", "Permite gestionar los roles de un usuario", "users"],
  ["users.change_password", "Cambiar contrasena de usuarios", "Permite cambiar la contrasena de un usuario", "users"],
  ["roles.view", "Ver roles", "Permite listar y consultar roles", "roles"],
  ["roles.create", "Crear roles", "Permite crear nuevos roles", "roles"],
  ["roles.update", "Actualizar roles", "Permite editar roles existentes", "roles"],
  ["roles.delete", "Eliminar roles", "Permite eliminar roles", "roles"],
  ["roles.assign_permissions", "Asignar permisos a roles", "Permite gestionar los permisos de un rol", "roles"],
  ["permissions.view", "Ver permisos", "Permite listar y consultar permisos", "permissions"],
  ["permissions.create", "Crear permisos", "Permite crear nuevos permisos", "permissions"],
  ["permissions.update", "Actualizar permisos", "Permite editar permisos existentes", "permissions"],
  ["permissions.delete", "Eliminar permisos", "Permite eliminar permisos", "permissions"],
  ["modules.view", "Ver modulos", "Permite listar y consultar modulos", "modules"],
  ["modules.create", "Crear modulos", "Permite crear nuevos modulos", "modules"],
  ["modules.update", "Actualizar modulos", "Permite editar modulos existentes", "modules"],
  ["modules.delete", "Eliminar modulos", "Permite eliminar modulos", "modules"],
  ["companies.view", "Ver empresas", "Permite consultar empresas", "companies"],
  ["companies.create", "Crear empresas", "Permite registrar empresas", "companies"],
  ["companies.update", "Actualizar empresas", "Permite modificar empresas", "companies"],
  ["companies.activate", "Activar empresas", "Permite activar empresas", "companies"],
  ["companies.deactivate", "Desactivar empresas", "Permite desactivar empresas", "companies"],
  ["branches.view", "Ver sucursales", "Permite consultar sucursales", "branches"],
  ["branches.create", "Crear sucursales", "Permite registrar sucursales", "branches"],
  ["branches.update", "Actualizar sucursales", "Permite modificar sucursales", "branches"],
  ["branches.activate", "Activar sucursales", "Permite activar sucursales", "branches"],
  ["branches.deactivate", "Desactivar sucursales", "Permite desactivar sucursales", "branches"],
  ["warehouse_categories.view", "Ver categorias de almacen", "Permite consultar categorias de almacen", "warehouse_categories"],
  ["warehouse_categories.create", "Crear categorias de almacen", "Permite registrar categorias de almacen", "warehouse_categories"],
  ["warehouse_categories.update", "Actualizar categorias de almacen", "Permite modificar categorias de almacen", "warehouse_categories"],
  ["warehouse_categories.deactivate", "Desactivar categorias de almacen", "Permite desactivar categorias de almacen", "warehouse_categories"],
  ["warehouses.view", "Ver almacenes", "Permite consultar almacenes", "warehouses"],
  ["warehouses.create", "Crear almacenes", "Permite registrar almacenes", "warehouses"],
  ["warehouses.update", "Actualizar almacenes", "Permite modificar almacenes", "warehouses"],
  ["warehouses.activate", "Activar almacenes", "Permite activar almacenes", "warehouses"],
  ["warehouses.deactivate", "Desactivar almacenes", "Permite desactivar almacenes", "warehouses"],
  ["locations.view", "Ver espacios", "Permite consultar ubicaciones o espacios", "locations"],
  ["locations.create", "Crear espacios", "Permite registrar ubicaciones o espacios", "locations"],
  ["locations.update", "Actualizar espacios", "Permite modificar ubicaciones o espacios", "locations"],
  ["locations.activate", "Activar espacios", "Permite activar ubicaciones o espacios", "locations"],
  ["locations.deactivate", "Desactivar espacios", "Permite desactivar ubicaciones o espacios", "locations"],
  ["logs.view", "Ver bitacora", "Permite consultar la bitacora", "logs"],
  ["logs.detail", "Ver detalle de bitacora", "Permite consultar el detalle de un evento", "logs"],
  ["logs.export", "Exportar bitacora", "Permite exportar registros de auditoria", "logs"],
  ["suppliers.view", "Ver proveedores", "Permite consultar proveedores", "suppliers"],
  ["suppliers.create", "Crear proveedores", "Permite registrar proveedores", "suppliers"],
  ["suppliers.update", "Actualizar proveedores", "Permite modificar proveedores", "suppliers"],
  ["suppliers.activate", "Activar proveedores", "Permite activar proveedores", "suppliers"],
  ["suppliers.deactivate", "Desactivar proveedores", "Permite desactivar proveedores", "suppliers"],
  ["supplier_contacts.view", "Ver contactos de proveedores", "Permite consultar contactos de proveedores", "supplier_contacts"],
  ["supplier_contacts.create", "Crear contactos de proveedores", "Permite registrar contactos de proveedores", "supplier_contacts"],
  ["supplier_contacts.update", "Actualizar contactos de proveedores", "Permite modificar contactos de proveedores", "supplier_contacts"],
  ["supplier_contacts.activate", "Activar contactos de proveedores", "Permite activar contactos de proveedores", "supplier_contacts"],
  ["supplier_contacts.deactivate", "Desactivar contactos de proveedores", "Permite desactivar contactos de proveedores", "supplier_contacts"],
  ["dashboard.view", "Ver dashboard", "Permite consultar indicadores del dashboard", "dashboard"],
].map(([action, name, description, module]) => ({
  action,
  name,
  description,
  module: module as ModuleName,
  isSystem: true,
}));

async function cleanupRemovedModules() {
  await prisma.rolePermission.deleteMany({
    where: { permission: { action: { in: REMOVED_PERMISSION_ACTIONS } } },
  });
  await prisma.permission.deleteMany({
    where: { action: { in: REMOVED_PERMISSION_ACTIONS } },
  });
  await prisma.module.deleteMany({
    where: { name: { in: REMOVED_MODULES } },
  });
}

async function seedModulesAndPermissions() {
  const moduleMap = new Map<string, number>();

  for (const name of MODULES) {
    const moduleRecord = await prisma.module.upsert({
      where: { name },
      update: { description: `Modulo ${name}`, isActive: true, deletedAt: null },
      create: { name, description: `Modulo ${name}` },
    });
    moduleMap.set(name, moduleRecord.id);
  }

  const createdPermissions = [];

  for (const permission of PERMISSIONS) {
    const moduleId = moduleMap.get(permission.module);
    if (!moduleId) throw new Error(`No se encontro el modulo ${permission.module}`);

    const createdPermission = await prisma.permission.upsert({
      where: { action: permission.action },
      update: {
        name: permission.name,
        description: permission.description,
        moduleId,
        isSystem: permission.isSystem,
        isActive: true,
        deletedAt: null,
      },
      create: {
        action: permission.action,
        name: permission.name,
        description: permission.description,
        moduleId,
        isSystem: permission.isSystem,
      },
    });
    createdPermissions.push(createdPermission);
  }

  return createdPermissions;
}

async function seedRoles(createdPermissions: Array<{ id: number }>) {
  const superadminRole = await prisma.role.upsert({
    where: { name: "superadmin" },
    update: { description: "Acceso total al sistema", isSystem: true, isActive: true, deletedAt: null },
    create: { name: "superadmin", description: "Acceso total al sistema", isSystem: true },
  });

  await prisma.role.upsert({
    where: { name: "admin" },
    update: { description: "Administrador con acceso a la gestion operativa", isSystem: false, isActive: true, deletedAt: null },
    create: { name: "admin", description: "Administrador con acceso a la gestion operativa", isSystem: false },
  });

  for (const permission of createdPermissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: superadminRole.id, permissionId: permission.id } },
      update: {},
      create: { roleId: superadminRole.id, permissionId: permission.id },
    });
  }

  return superadminRole;
}

async function seedOrganizationCatalogs() {
  const sanSalvador = await prisma.department.upsert({
    where: { id: 1 },
    update: { name: "San Salvador", isActive: true },
    create: { id: 1, name: "San Salvador" },
  });
  const sanMiguel = await prisma.department.upsert({
    where: { id: 2 },
    update: { name: "San Miguel", isActive: true },
    create: { id: 2, name: "San Miguel" },
  });
  const laUnion = await prisma.department.upsert({
    where: { id: 3 },
    update: { name: "La Union", isActive: true },
    create: { id: 3, name: "La Union" },
  });

  const sanSalvadorMunicipality = await prisma.municipality.upsert({
    where: { id: 1 },
    update: { name: "San Salvador Centro", departmentId: sanSalvador.id, isActive: true },
    create: { id: 1, name: "San Salvador Centro", departmentId: sanSalvador.id },
  });
  const sanMiguelMunicipality = await prisma.municipality.upsert({
    where: { id: 2 },
    update: { name: "San Miguel Centro", departmentId: sanMiguel.id, isActive: true },
    create: { id: 2, name: "San Miguel Centro", departmentId: sanMiguel.id },
  });
  const laUnionMunicipality = await prisma.municipality.upsert({
    where: { id: 3 },
    update: { name: "La Union Norte", departmentId: laUnion.id, isActive: true },
    create: { id: 3, name: "La Union Norte", departmentId: laUnion.id },
  });

  for (const district of [
    [1, "San Salvador", sanSalvadorMunicipality.id],
    [2, "San Miguel", sanMiguelMunicipality.id],
    [3, "La Union", laUnionMunicipality.id],
  ] as const) {
    await prisma.district.upsert({
      where: { id: district[0] },
      update: { name: district[1], municipalityId: district[2], isActive: true },
      create: { id: district[0], name: district[1], municipalityId: district[2] },
    });
  }

  for (const category of [
    ["Producto Terminado", "Almacen para producto listo para venta"],
    ["Materia Prima", "Almacen para insumos o materia prima"],
    ["Devoluciones", "Almacen para devoluciones de clientes"],
    ["Cuarentena", "Almacen para productos en revision"],
    ["Transito", "Almacen para mercancia en traslado"],
  ] as const) {
    await prisma.warehouseCategory.upsert({
      where: { name: category[0] },
      update: { description: category[1], isActive: true, deletedAt: null },
      create: { name: category[0], description: category[1] },
    });
  }
}

async function seedCountries() {
  for (const country of [
    [1, "El Salvador", "SV"],
    [2, "Guatemala", "GT"],
    [3, "Honduras", "HN"],
    [4, "Nicaragua", "NI"],
    [5, "Costa Rica", "CR"],
    [6, "Panama", "PA"],
    [7, "Estados Unidos", "US"],
  ] as const) {
    await prisma.country.upsert({
      where: { id: country[0] },
      update: { name: country[1], isoCode: country[2], isActive: true },
      create: { id: country[0], name: country[1], isoCode: country[2] },
    });
  }
}

async function seedAdminUser(superadminRole: { id: number }) {
  const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const adminUsername = process.env.SEED_ADMIN_USERNAME?.trim();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  if (!adminEmail || !adminUsername || !adminPassword) {
    throw new Error("Faltan SEED_ADMIN_EMAIL, SEED_ADMIN_USERNAME o SEED_ADMIN_PASSWORD");
  }
  if (adminPassword.length < 8) {
    throw new Error("SEED_ADMIN_PASSWORD debe contener al menos 8 caracteres");
  }

  const passwordHash = await argon2.hash(adminPassword);
  const existingEmployee = await prisma.employee.findFirst({
    where: { OR: [{ email: adminEmail }, { code: "EMP-ADMIN" }] },
  });
  const employee = existingEmployee
    ? await prisma.employee.update({
        where: { id: existingEmployee.id },
        data: { fullName: "Administrador del sistema", email: adminEmail, isActive: true, deletedAt: null },
      })
    : await prisma.employee.create({
        data: { code: "EMP-ADMIN", fullName: "Administrador del sistema", email: adminEmail },
      });

  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      username: adminUsername,
      passwordHash,
      employeeId: employee.id,
      isActive: true,
      failedLoginAttempts: 0,
      lockedAt: null,
      deletedAt: null,
    },
    create: { username: adminUsername, email: adminEmail, passwordHash, employeeId: employee.id, isActive: true },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: adminUser.id, roleId: superadminRole.id } },
    update: {},
    create: { userId: adminUser.id, roleId: superadminRole.id },
  });

  return adminUser;
}

async function main(): Promise<void> {
  console.log("Iniciando seed...");
  await cleanupRemovedModules();
  const createdPermissions = await seedModulesAndPermissions();
  const superadminRole = await seedRoles(createdPermissions);
  await seedOrganizationCatalogs();
  await seedCountries();
  const adminUser = await seedAdminUser(superadminRole);

  console.log(`Modulos asegurados: ${MODULES.join(", ")}`);
  console.log(`Permisos asegurados: ${createdPermissions.length}`);
  console.log(`Usuario administrador asegurado: ${adminUser.email}`);
  console.log("Seed completado exitosamente.");
}

main()
  .catch((error: unknown) => {
    console.error("Error ejecutando el seed:");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
