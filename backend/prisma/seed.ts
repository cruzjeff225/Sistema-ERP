import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";
import { EL_SALVADOR_GEOGRAPHY } from "./el-salvador-geography";

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
  "categories",
  "subcategories",
  "units",
  "products",
  "product_images",
  "product_suppliers",
  "purchase_requests",
  "purchase_quotations",
  "purchase_orders",
  "expense_types",
  "purchase_expenses",
  "purchases",
  "retaceos",
  "dashboard",
  "inventory",
  "trash",
  "customers",
] as const;

type ModuleName = (typeof MODULES)[number];

const REMOVED_MODULES = [
  "quotations",
  "sales",
  "transfers",
  "vehicles",
  "drivers",
];

const REMOVED_PERMISSION_ACTIONS = [
  "inventory.update",
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
  ["trash.view", "Consultar papelera", "Recuperación por 30 días", "trash"],
  ["trash.delete", "Enviar a papelera", "Retirar registros de gestión", "trash"],
  ["trash.restore", "Restaurar registros", "Recuperar registros de papelera", "trash"],
  ["trash.purge", "Eliminar definitivamente de papelera", "Eliminar sin recuperación y conservar referencias históricas", "trash"],
  ["inventory.view", "Consultar inventario", "Existencias y kardex por empresa", "inventory"],
  ["inventory.adjust", "Ajustar inventario", "Entradas y salidas justificadas", "inventory"],
  ["customers.view", "Consultar clientes", "Directorio comercial de la empresa", "customers"],
  ["customers.create", "Registrar clientes", "Crear clientes para operaciones de venta", "customers"],
  ["customers.update", "Actualizar clientes", "Editar contacto y ubicación de clientes", "customers"],
  ["customers.activate", "Activar clientes", "Habilitar clientes para nuevas operaciones", "customers"],
  ["customers.deactivate", "Desactivar clientes", "Conservar clientes fuera de la atención activa", "customers"],
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
  ["categories.view", "Ver categorias de productos", "Permite consultar categorias", "categories"],
  ["categories.create", "Crear categorias de productos", "Permite registrar categorias", "categories"],
  ["categories.update", "Actualizar categorias de productos", "Permite modificar categorias", "categories"],
  ["categories.activate", "Activar categorias de productos", "Permite activar categorias", "categories"],
  ["categories.deactivate", "Desactivar categorias de productos", "Permite desactivar categorias", "categories"],
  ["subcategories.view", "Ver subcategorias de productos", "Permite consultar subcategorias", "subcategories"],
  ["subcategories.create", "Crear subcategorias de productos", "Permite registrar subcategorias", "subcategories"],
  ["subcategories.update", "Actualizar subcategorias de productos", "Permite modificar subcategorias", "subcategories"],
  ["subcategories.activate", "Activar subcategorias de productos", "Permite activar subcategorias", "subcategories"],
  ["subcategories.deactivate", "Desactivar subcategorias de productos", "Permite desactivar subcategorias", "subcategories"],
  ["units.view", "Ver unidades", "Permite consultar unidades de compra y venta", "units"],
  ["units.create", "Crear unidades", "Permite registrar unidades", "units"],
  ["units.update", "Actualizar unidades", "Permite modificar unidades", "units"],
  ["units.activate", "Activar unidades", "Permite activar unidades", "units"],
  ["units.deactivate", "Desactivar unidades", "Permite desactivar unidades", "units"],
  ["products.view", "Ver productos", "Permite consultar productos", "products"],
  ["products.create", "Crear productos", "Permite registrar productos", "products"],
  ["products.update", "Actualizar productos", "Permite modificar productos", "products"],
  ["products.activate", "Activar productos", "Permite activar productos", "products"],
  ["products.deactivate", "Desactivar productos", "Permite desactivar productos", "products"],
  ["product_images.view", "Ver imagenes de productos", "Permite consultar imagenes", "product_images"],
  ["product_images.create", "Crear imagenes de productos", "Permite asociar imagenes", "product_images"],
  ["product_images.update", "Actualizar imagenes de productos", "Permite modificar imagenes", "product_images"],
  ["product_images.delete", "Eliminar imagenes de productos", "Permite eliminar imagenes", "product_images"],
  ["product_images.activate", "Activar imagenes de productos", "Permite activar imagenes", "product_images"],
  ["product_images.deactivate", "Desactivar imagenes de productos", "Permite desactivar imagenes", "product_images"],
  ["product_suppliers.view", "Ver abastecimiento de productos", "Permite consultar proveedores asociados", "product_suppliers"],
  ["product_suppliers.create", "Asociar proveedor a producto", "Permite asociar productos y proveedores", "product_suppliers"],
  ["product_suppliers.update", "Actualizar abastecimiento de productos", "Permite modificar asociaciones", "product_suppliers"],
  ["product_suppliers.activate", "Activar abastecimiento de productos", "Permite activar asociaciones", "product_suppliers"],
  ["product_suppliers.deactivate", "Desactivar abastecimiento de productos", "Permite desactivar asociaciones", "product_suppliers"],
  ["purchase_requests.view", "Ver solicitudes de compra", "Permite consultar solicitudes y su trazabilidad", "purchase_requests"],
  ["purchase_requests.create", "Crear solicitudes de compra", "Permite registrar solicitudes con múltiples productos", "purchase_requests"],
  ["purchase_requests.update", "Actualizar solicitudes de compra", "Permite modificar y enviar solicitudes", "purchase_requests"],
  ["purchase_requests.approve", "Aprobar solicitudes de compra", "Permite aprobar solicitudes enviadas", "purchase_requests"],
  ["purchase_requests.reject", "Rechazar solicitudes de compra", "Permite rechazar solicitudes enviadas", "purchase_requests"],
  ["purchase_requests.cancel", "Cancelar solicitudes de compra", "Permite cancelar solicitudes conservando el historial", "purchase_requests"],
  ["purchase_quotations.view", "Ver cotizaciones de compra", "Permite consultar y comparar ofertas", "purchase_quotations"],
  ["purchase_quotations.create", "Registrar cotizaciones de compra", "Permite registrar ofertas de proveedores", "purchase_quotations"],
  ["purchase_quotations.update", "Actualizar cotizaciones de compra", "Permite modificar y evaluar ofertas", "purchase_quotations"],
  ["purchase_quotations.select", "Seleccionar cotizaciones", "Permite seleccionar la oferta que originará una orden", "purchase_quotations"],
  ["purchase_quotations.reject", "Rechazar cotizaciones", "Permite rechazar ofertas conservando el historial", "purchase_quotations"],
  ["purchase_quotations.cancel", "Cancelar cotizaciones", "Permite cancelar ofertas", "purchase_quotations"],
  ["purchase_orders.view", "Ver órdenes de compra", "Permite consultar órdenes y recepciones", "purchase_orders"],
  ["purchase_orders.create", "Crear órdenes de compra", "Permite generar órdenes desde cotizaciones seleccionadas", "purchase_orders"],
  ["purchase_orders.update", "Actualizar órdenes de compra", "Permite editar y enviar órdenes a aprobación", "purchase_orders"],
  ["purchase_orders.approve", "Aprobar órdenes de compra", "Permite autorizar órdenes", "purchase_orders"],
  ["purchase_orders.cancel", "Cancelar órdenes de compra", "Permite cancelar órdenes sin borrar su historial", "purchase_orders"],
  ["purchase_orders.send", "Enviar órdenes de compra", "Permite marcar órdenes como enviadas al proveedor", "purchase_orders"],
  ["purchase_orders.receive", "Recibir órdenes de compra", "Permite registrar recepciones parciales", "purchase_orders"],
  ["expense_types.view", "Ver tipos de gasto", "Permite consultar el catálogo de gastos", "expense_types"],
  ["expense_types.create", "Crear tipos de gasto", "Permite registrar tipos de gasto", "expense_types"],
  ["expense_types.update", "Actualizar tipos de gasto", "Permite modificar tipos de gasto", "expense_types"],
  ["expense_types.activate", "Activar tipos de gasto", "Permite activar tipos de gasto", "expense_types"],
  ["expense_types.deactivate", "Desactivar tipos de gasto", "Permite desactivar tipos de gasto", "expense_types"],
  ["purchase_expenses.view", "Ver gastos de compra", "Permite consultar gastos y sus documentos", "purchase_expenses"],
  ["purchase_expenses.create", "Registrar gastos de compra", "Permite registrar gastos y adjuntar evidencias", "purchase_expenses"],
  ["purchase_expenses.update", "Actualizar gastos de compra", "Permite modificar gastos y administrar evidencias", "purchase_expenses"],
  ["purchases.view", "Ver compras y recepciones", "Permite consultar recepciones y su trazabilidad", "purchases"],
  ["purchases.create", "Registrar compras y recepciones", "Permite registrar mercancía recibida desde una orden", "purchases"],
  ["purchases.update", "Actualizar compras", "Permite modificar datos de recepción", "purchases"],
  ["purchases.cancel", "Cancelar compras", "Permite cancelar una recepción con control de inventario", "purchases"],
  ["purchases.close", "Cerrar compras", "Permite cerrar una recepción", "purchases"],
  ["retaceos.view", "Ver retaceos", "Permite consultar costos reales y porcentajes", "retaceos"],
  ["retaceos.create", "Crear retaceos", "Permite iniciar un retaceo desde una recepción", "retaceos"],
  ["retaceos.update", "Actualizar retaceos", "Permite modificar retaceos en borrador", "retaceos"],
  ["retaceos.calculate", "Calcular retaceos", "Permite distribuir costos proporcionalmente al FOB", "retaceos"],
  ["retaceos.verify", "Verificar retaceos", "Permite validar el cálculo del costo real", "retaceos"],
  ["retaceos.close", "Cerrar retaceos", "Permite cerrar el retaceo y actualizar costos", "retaceos"],
  ["retaceos.cancel", "Cancelar retaceos", "Permite cancelar retaceos conservando el historial", "retaceos"],
  ["dashboard.view", "Ver dashboard", "Permite consultar indicadores del dashboard", "dashboard"],
].map(([action, name, description, module]) => ({
  action,
  name,
  description,
  module: module as ModuleName,
  isSystem: true,
}));

async function cleanupRemovedModules() {
  await prisma.permission.updateMany({
    where: { action: { in: REMOVED_PERMISSION_ACTIONS } },
    data: { isActive: false, deletedAt: new Date() },
  });
  await prisma.module.updateMany({
    where: { name: { in: REMOVED_MODULES } },
    data: { isActive: false, deletedAt: new Date() },
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
  for (const entry of EL_SALVADOR_GEOGRAPHY) {
    const department = await prisma.department.upsert({
      where: { name: entry.department },
      update: { isActive: true },
      create: { name: entry.department },
    });
    const municipality = await prisma.municipality.upsert({
      where: { departmentId_name: { departmentId: department.id, name: entry.municipality } },
      update: { isActive: true },
      create: { departmentId: department.id, name: entry.municipality },
    });
    for (const name of entry.districts) {
      await prisma.district.upsert({
        where: { municipalityId_name: { municipalityId: municipality.id, name } },
        update: { isActive: true },
        create: { municipalityId: municipality.id, name },
      });
    }
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

async function seedProductCatalogs() {
  const category = await prisma.productCategory.upsert({
    where: { name: "Sin clasificar" },
    update: { description: "Categoría inicial para productos existentes", isActive: true, deletedAt: null },
    create: { name: "Sin clasificar", description: "Categoría inicial para productos existentes" },
  });

  await prisma.productSubcategory.upsert({
    where: { categoryId_name: { categoryId: category.id, name: "General" } },
    update: { description: "Subcategoría inicial para productos existentes", isActive: true, deletedAt: null },
    create: { categoryId: category.id, name: "General", description: "Subcategoría inicial para productos existentes" },
  });

  for (const unit of [
    ["Unidad", "purchase"],
    ["Unidad", "sale"],
    ["Caja", "purchase"],
    ["Paquete", "sale"],
  ] as const) {
    await prisma.productUnit.upsert({
      where: { name_type: { name: unit[0], type: unit[1] } },
      update: { isActive: true, deletedAt: null },
      create: { name: unit[0], type: unit[1] },
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

async function seedExpenseTypes() {
  const companies = await prisma.company.findMany({ where: { deletedAt: null }, select: { id: true } });
  const types = [
    ["Flete", "Transporte de mercancía"],
    ["Seguro", "Seguro asociado al envío"],
    ["Transporte", "Transporte terrestre o interno"],
    ["Manejo", "Manipulación, carga y descarga"],
    ["Embalaje", "Materiales y servicios de empaque"],
    ["Aduana", "Aranceles y trámites aduanales"],
    ["Documentación", "Documentos y trámites de envío"],
    ["Almacenamiento", "Almacenamiento temporal"],
    ["Otros", "Otros gastos asociados a la compra"],
  ] as const;
  for (const company of companies) {
    for (const [name, description] of types) {
      await prisma.expenseType.upsert({
        where: { companyId_name: { companyId: company.id, name } },
        update: { description, isActive: true, deletedAt: null },
        create: { companyId: company.id, name, description },
      });
    }
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

  const companies = await prisma.company.findMany({ where: { deletedAt: null, isActive: true }, select: { id: true } });
  if (companies.length) {
    await prisma.userCompany.createMany({
      data: companies.map((company) => ({ userId: adminUser.id, companyId: company.id })),
      skipDuplicates: true,
    });
  }

  return adminUser;
}

async function main(): Promise<void> {
  console.log("Iniciando seed...");
  await cleanupRemovedModules();
  const createdPermissions = await seedModulesAndPermissions();
  const superadminRole = await seedRoles(createdPermissions);
  await seedOrganizationCatalogs();
  await seedProductCatalogs();
  await seedCountries();
  await seedExpenseTypes();
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
