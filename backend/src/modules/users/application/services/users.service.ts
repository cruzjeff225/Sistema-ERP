import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import * as argon2 from "argon2";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../../infrastructure/database/prisma/prisma.service";
import { CreateUserDto } from "../dto/create-user.dto";
import { UpdateUserDto } from "../dto/update-user.dto";
import { QueryUsersDto } from "../dto/query-users.dto";

// Nombre del rol con privilegios totales en el sistema
const SUPERADMIN_ROLE = "superadmin";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // Define los campos seguros que se devolverán en las consultas de usuarios
  private readonly safeSelect = {
    id: true,
    username: true,
    email: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
    userRoles: {
      select: {
        role: { select: { id: true, name: true } },
      },
    },
  } satisfies Prisma.UserSelect;

  // Transforma la respuesta de Prisma al formato utilizado por el servicio
  private formatUser(user: any) {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      roles: user.userRoles.map((ur: any) => ur.role),
    };
  }

  // Obtiene usuarios paginados aplicando filtros, búsqueda y ordenamiento
  async findAll(query: QueryUsersDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    // Construye dinámicamente los filtros de la consulta
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(query.search
        ? {
            OR: [
              { username: { contains: query.search, mode: "insensitive" } },
              { email: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(query.isActive !== undefined
        ? { isActive: query.isActive === "true" }
        : {}),
      ...(query.roleId
        ? { userRoles: { some: { roleId: query.roleId } } }
        : {}),
    };

    // Obtiene los usuarios y el total de registros en una sola transacción
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: this.safeSelect,
        skip,
        take: limit,
        orderBy: { [query.sortBy ?? "createdAt"]: query.sortOrder ?? "desc" },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: items.map((u) => this.formatUser(u)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Obtiene un usuario específico por su identificador
  async findOne(id: number) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: this.safeSelect,
    });

    if (!user) {
      throw new NotFoundException("Usuario no encontrado");
    }

    return this.formatUser(user);
  }

  // Crea un usuario después de validar sus datos y roles
  async create(dto: CreateUserDto) {
    // Verifica que el correo y el nombre de usuario no estén registrados
    const existing = await this.prisma.user.findFirst({
      where: {
        deletedAt: null,
        OR: [{ email: dto.email }, { username: dto.username }],
      },
    });

    if (existing) {
      throw new ConflictException(
        existing.email === dto.email
          ? "El correo ya está registrado"
          : "El nombre de usuario ya está en uso",
      );
    }

    // Valida los roles proporcionados antes de asignarlos
    if (dto.roleIds?.length) {
      await this.assertRolesExist(dto.roleIds);
    }

    // Genera un hash seguro de la contraseña
    const passwordHash = await argon2.hash(dto.password);

    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        email: dto.email,
        passwordHash,
        userRoles: dto.roleIds?.length
          ? { create: dto.roleIds.map((roleId) => ({ roleId })) }
          : undefined,
      },
      select: this.safeSelect,
    });

    return this.formatUser(user);
  }

  // Actualiza los datos editables de un usuario
  async update(id: number, dto: UpdateUserDto) {
    await this.findOne(id);

    // Comprueba que el nuevo correo o usuario no pertenezca a otro registro
    if (dto.email || dto.username) {
      const conflict = await this.prisma.user.findFirst({
        where: {
          id: { not: id },
          deletedAt: null,
          OR: [
            ...(dto.email ? [{ email: dto.email }] : []),
            ...(dto.username ? [{ username: dto.username }] : []),
          ],
        },
      });

      if (conflict) {
        throw new ConflictException(
          conflict.email === dto.email
            ? "El correo ya está registrado"
            : "El nombre de usuario ya está en uso",
        );
      }
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: { username: dto.username, email: dto.email },
      select: this.safeSelect,
    });

    return this.formatUser(user);
  }

  // Activa o desactiva un usuario.
  async updateStatus(id: number, isActive: boolean) {
    const user = await this.findOne(id);

    // Evita desactivar al último superadministrador activo
    if (!isActive) {
      await this.assertNotLastSuperadmin(id);
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { isActive },
      select: this.safeSelect,
    });

    return this.formatUser(updated);
  }

  // Realiza la eliminación lógica de un usuario
  async remove(id: number) {
    await this.findOne(id);

    // Evita eliminar al último superadministrador activo
    await this.assertNotLastSuperadmin(id);

    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    return { id };
  }

  // Reemplaza los roles actualmente asignados al usuario
  async assignRoles(id: number, roleIds: number[]) {
    await this.findOne(id);

    // Verifica que todos los roles proporcionados existan
    if (roleIds.length) {
      await this.assertRolesExist(roleIds);
    }

    // Obtiene los roles actuales para validar cambios de superadministrador
    const currentRoles = await this.prisma.userRole.findMany({
      where: { userId: id },
      include: { role: true },
    });

    // Determina si se está retirando el rol de superadministrador
    const isRemovingSuperadmin =
      currentRoles.some((ur) => ur.role.name === SUPERADMIN_ROLE) &&
      !(await this.roleIdBelongsToSuperadmin(roleIds));

    if (isRemovingSuperadmin) {
      await this.assertNotLastSuperadmin(id);
    }

    // Elimina las asignaciones actuales y registra los nuevos roles
    await this.prisma.$transaction([
      this.prisma.userRole.deleteMany({ where: { userId: id } }),
      this.prisma.userRole.createMany({
        data: roleIds.map((roleId) => ({ userId: id, roleId })),
        skipDuplicates: true,
      }),
    ]);

    return this.findOne(id);
  }

  // Cambia la contraseña y revoca las sesiones activas del usuario
  async changePassword(id: number, newPassword: string) {
    await this.findOne(id);

    // Genera el hash de la nueva contraseña.
    const passwordHash = await argon2.hash(newPassword);

    await this.prisma.user.update({
      where: { id },
      data: { passwordHash },
    });

    // Revoca todas las sesiones activas tras el cambio de contraseña
    await this.prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { id };
  }

  // Verifica si alguno de los roles pertenece al superadministrador
  private async roleIdBelongsToSuperadmin(roleIds: number[]): Promise<boolean> {
    if (!roleIds.length) return false;

    const superadminRole = await this.prisma.role.findUnique({
      where: { name: SUPERADMIN_ROLE },
    });

    return !!superadminRole && roleIds.includes(superadminRole.id);
  }

  // Verifica que todos los roles proporcionados existan
  private async assertRolesExist(roleIds: number[]) {
    const count = await this.prisma.role.count({
      where: { id: { in: roleIds }, deletedAt: null },
    });

    if (count !== roleIds.length) {
      throw new BadRequestException("Uno o más roles no existen");
    }
  }

  // Impide modificar al último superadministrador activo del sistema
  private async assertNotLastSuperadmin(userId: number) {
    const superadminRole = await this.prisma.role.findUnique({
      where: { name: SUPERADMIN_ROLE },
    });

    if (!superadminRole) return;

    // Comprueba si el usuario posee el rol de superadministrador
    const isSuperadmin = await this.prisma.userRole.findFirst({
      where: { userId, roleId: superadminRole.id },
    });

    if (!isSuperadmin) return;

    // Cuenta los superadministradores activos que permanecen en el sistema
    const superadminCount = await this.prisma.userRole.count({
      where: {
        roleId: superadminRole.id,
        user: { isActive: true, deletedAt: null },
      },
    });

    if (superadminCount <= 1) {
      throw new ForbiddenException(
        "No se puede modificar al último superadministrador del sistema",
      );
    }
  }
}
