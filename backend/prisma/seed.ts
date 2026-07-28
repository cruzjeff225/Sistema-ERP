import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "La variable de entorno DATABASE_URL no está configurada en el archivo .env",
  );
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });
const MODULES = ["users", "roles", "permissions", "modules"] as const;
const PERMISSIONS: Array<{
  action: string;
  name: string;
  description: string;
  module: (typeof MODULES)[number];
  isSystem: boolean;
}> = [
  {
    action: "users.view",
    name: "Ver usuarios",
    description: "Permite listar y consultar usuarios",
    module: "users",
    isSystem: true,
  },
  {
    action: "users.create",
    name: "Crear usuarios",
    description: "Permite crear nuevos usuarios",
    module: "users",
    isSystem: true,
  },
  {
    action: "users.update",
    name: "Actualizar usuarios",
    description: "Permite editar usuarios existentes",
    module: "users",
    isSystem: true,
  },
  {
    action: "users.delete",
    name: "Eliminar usuarios",
    description: "Permite eliminar usuarios",
    module: "users",
    isSystem: true,
  },
  {
    action: "users.assign_roles",
    name: "Asignar roles a usuarios",
    description: "Permite gestionar los roles de un usuario",
    module: "users",
    isSystem: true,
  },
  {
    action: "users.change_password",
    name: "Cambiar contraseña de usuarios",
    description: "Permite cambiar la contraseña de un usuario",
    module: "users",
    isSystem: true,
  },
  {
    action: "roles.view",
    name: "Ver roles",
    description: "Permite listar y consultar roles",
    module: "roles",
    isSystem: true,
  },
  {
    action: "roles.create",
    name: "Crear roles",
    description: "Permite crear nuevos roles",
    module: "roles",
    isSystem: true,
  },
  {
    action: "roles.update",
    name: "Actualizar roles",
    description: "Permite editar roles existentes",
    module: "roles",
    isSystem: true,
  },
  {
    action: "roles.delete",
    name: "Eliminar roles",
    description: "Permite eliminar roles",
    module: "roles",
    isSystem: true,
  },
  {
    action: "roles.assign_permissions",
    name: "Asignar permisos a roles",
    description: "Permite gestionar los permisos de un rol",
    module: "roles",
    isSystem: true,
  },
  {
    action: "permissions.view",
    name: "Ver permisos",
    description: "Permite listar y consultar permisos",
    module: "permissions",
    isSystem: true,
  },
  {
    action: "permissions.create",
    name: "Crear permisos",
    description: "Permite crear nuevos permisos",
    module: "permissions",
    isSystem: true,
  },
  {
    action: "permissions.update",
    name: "Actualizar permisos",
    description: "Permite editar permisos existentes",
    module: "permissions",
    isSystem: true,
  },
  {
    action: "permissions.delete",
    name: "Eliminar permisos",
    description: "Permite eliminar permisos",
    module: "permissions",
    isSystem: true,
  },
  {
    action: "modules.view",
    name: "Ver módulos",
    description: "Permite listar y consultar módulos",
    module: "modules",
    isSystem: true,
  },
  {
    action: "modules.create",
    name: "Crear módulos",
    description: "Permite crear nuevos módulos",
    module: "modules",
    isSystem: true,
  },
  {
    action: "modules.update",
    name: "Actualizar módulos",
    description: "Permite editar módulos existentes",
    module: "modules",
    isSystem: true,
  },
  {
    action: "modules.delete",
    name: "Eliminar módulos",
    description: "Permite eliminar módulos",
    module: "modules",
    isSystem: true,
  },
];
async function main(): Promise<void> {
  console.log("Iniciando seed...");
  /** * Módulos base */
  const moduleMap = new Map<string, number>();
  for (const name of MODULES) {
    const moduleRecord = await prisma.module.upsert({
      where: { name },
      update: { description: `Módulo ${name}` },
      create: { name, description: `Módulo ${name}` },
    });
    moduleMap.set(name, moduleRecord.id);
  }
  console.log(`Módulos asegurados: ${MODULES.join(", ")}`);
  /** * Permisos base */
  const createdPermissions = [];
  for (const permission of PERMISSIONS) {
    const moduleId = moduleMap.get(permission.module);
    if (!moduleId) {
      throw new Error(
        `No se encontró el módulo "${permission.module}" para el permiso "${permission.action}"`,
      );
    }
    const createdPermission = await prisma.permission.upsert({
      where: { action: permission.action },
      update: {
        name: permission.name,
        description: permission.description,
        moduleId,
        isSystem: permission.isSystem,
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
  console.log(`Permisos asegurados: ${createdPermissions.length}`);
  /** * Rol superadministrador protegido */
  const superadminRole = await prisma.role.upsert({
    where: { name: "superadmin" },
    update: { description: "Acceso total al sistema", isSystem: true },
    create: {
      name: "superadmin",
      description: "Acceso total al sistema",
      isSystem: true,
    },
  });
  /** * Rol administrador operativo y editable */
  await prisma.role.upsert({
    where: { name: "admin" },
    update: {
      description: "Administrador con acceso a la gestión operativa",
      isSystem: false,
    },
    create: {
      name: "admin",
      description: "Administrador con acceso a la gestión operativa",
      isSystem: false,
    },
  });
  console.log("Roles base asegurados: superadmin, admin");
  /** * Asignar todos los permisos al rol superadmin */
  for (const permission of createdPermissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: superadminRole.id,
          permissionId: permission.id,
        },
      },
      update: {},
      create: { roleId: superadminRole.id, permissionId: permission.id },
    });
  }
  console.log("Permisos asignados al rol superadmin");
  /** * Credenciales del usuario superadministrador inicial */
  const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const adminUsername = process.env.SEED_ADMIN_USERNAME?.trim();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminEmail || !adminUsername || !adminPassword) {
    throw new Error(
      [
        "Faltan variables de entorno para crear el usuario inicial.",
        "Debes configurar:",
        "- SEED_ADMIN_EMAIL",
        "- SEED_ADMIN_USERNAME",
        "- SEED_ADMIN_PASSWORD",
      ].join("\n"),
    );
  }
  if (adminPassword.length < 8) {
    throw new Error("SEED_ADMIN_PASSWORD debe contener al menos 8 caracteres");
  }
  const passwordHash = await argon2.hash(adminPassword);
  /** * Usuario superadministrador inicial * * En cada ejecución se actualizan el username, passwordHash e isActive. * Esto permite recuperar las credenciales iniciales ejecutando nuevamente * el seed con las variables de entorno correspondientes. */
  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { username: adminUsername, passwordHash, isActive: true },
    create: {
      username: adminUsername,
      email: adminEmail,
      passwordHash,
      isActive: true,
    },
  });
  console.log(`Usuario administrador asegurado: ${adminUser.email}`);
  /** * Asignar rol superadmin al usuario inicial */
  await prisma.userRole.upsert({
    where: {
      userId_roleId: { userId: adminUser.id, roleId: superadminRole.id },
    },
    update: {},
    create: { userId: adminUser.id, roleId: superadminRole.id },
  });
  console.log("Rol superadmin asignado al usuario inicial");
  console.log("Seed completado exitosamente.");
}
main()
  .catch((error: unknown) => {
    console.error("Error ejecutando el seed:");
    if (error instanceof Error) {
      console.error(error.message);
      console.error(error.stack);
    } else {
      console.error(error);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
