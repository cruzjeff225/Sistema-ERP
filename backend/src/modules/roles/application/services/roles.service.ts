import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../../../infrastructure/database/prisma/prisma.service";
import { CreateRoleDto } from "../dto/create-role.dto";
import { UpdateRoleDto } from "../dto/update-role.dto";

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  // Define los campos que se devolverán en las consultas de roles
  private readonly select = {
    id: true,
    name: true,
    description: true,
    isActive: true,
    isSystem: true,
    createdAt: true,
    updatedAt: true,
    _count: { select: { userRoles: true, rolePermissions: true } },
  };

  // Transforma la respuesta de Prisma al formato utilizado por el servicio
  private format(role: any) {
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      isActive: role.isActive,
      isSystem: role.isSystem,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
      userCount: role._count.userRoles,
      permissionCount: role._count.rolePermissions,
    };
  }

  // Obtiene los roles activos con búsqueda opcional por nombre
  async findAll(search?: string) {
    const roles = await this.prisma.role.findMany({
      where: {
        deletedAt: null,
        ...(search
          ? { name: { contains: search, mode: "insensitive" as const } }
          : {}),
      },
      select: this.select,
      orderBy: { name: "asc" },
    });

    // Formatea cada rol antes de devolver el resultado
    return roles.map((r) => this.format(r));
  }

  // Obtiene un rol específico junto con sus permisos asignados
  async findOne(id: number) {
    const role = await this.prisma.role.findFirst({
      where: { id, deletedAt: null },
      select: {
        ...this.select,
        rolePermissions: {
          select: {
            permission: {
              select: { id: true, action: true, name: true, moduleId: true },
            },
          },
        },
      },
    });

    if (!role) {
      throw new NotFoundException("Rol no encontrado");
    }

    // Agrega al resultado la lista de permisos relacionados con el rol
    return {
      ...this.format(role),
      permissions: (role as any).rolePermissions.map(
        (rp: any) => rp.permission,
      ),
    };
  }

  // Crea un rol después de validar que el nombre no esté registrado
  async create(dto: CreateRoleDto) {
    const existing = await this.prisma.role.findFirst({
      where: { name: dto.name, deletedAt: null },
    });

    // Evita registrar roles con nombres duplicados
    if (existing) {
      throw new ConflictException("Ya existe un rol con ese nombre");
    }

    const role = await this.prisma.role.create({
      data: { name: dto.name, description: dto.description },
      select: this.select,
    });

    return this.format(role);
  }

  // Actualiza los datos editables de un rol
  async update(id: number, dto: UpdateRoleDto) {
    const role = await this.assertExistsAndEditable(id);

    // Valida que el nuevo nombre no pertenezca a otro rol
    if (dto.name && dto.name !== role.name) {
      const conflict = await this.prisma.role.findFirst({
        where: { name: dto.name, deletedAt: null, id: { not: id } },
      });

      if (conflict) {
        throw new ConflictException("Ya existe un rol con ese nombre");
      }
    }

    const updated = await this.prisma.role.update({
      where: { id },
      data: { name: dto.name, description: dto.description },
      select: this.select,
    });

    return this.format(updated);
  }

  // Activa o desactiva un rol editable
  async updateStatus(id: number, isActive: boolean) {
    await this.assertExistsAndEditable(id);

    const updated = await this.prisma.role.update({
      where: { id },
      data: { isActive },
      select: this.select,
    });

    return this.format(updated);
  }

  // Realiza la eliminación lógica de un rol sin usuarios asignados
  async remove(id: number) {
    const role = await this.assertExistsAndEditable(id);

    // Cuenta los usuarios que tienen asignado el rol
    const usersCount = await this.prisma.userRole.count({
      where: { roleId: id },
    });

    // Impide eliminar roles que todavía estén asignados a usuarios
    if (usersCount > 0) {
      throw new BadRequestException(
        "No se puede eliminar un rol que tiene usuarios asignados",
      );
    }

    // Marca el rol como eliminado e inactivo
    await this.prisma.role.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    return { id };
  }

  // Reemplaza los permisos actualmente asignados al rol
  async assignPermissions(id: number, permissionIds: number[]) {
    await this.assertExistsAndEditable(id);

    // Verifica que todos los permisos indicados existan
    if (permissionIds.length) {
      const count = await this.prisma.permission.count({
        where: { id: { in: permissionIds }, deletedAt: null },
      });

      if (count !== permissionIds.length) {
        throw new BadRequestException("Uno o más permisos no existen");
      }
    }

    // Elimina las asignaciones actuales y registra las nuevas
    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId: id } }),
      this.prisma.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({
          roleId: id,
          permissionId,
        })),
        skipDuplicates: true,
      }),
    ]);

    return this.findOne(id);
  }

  // Verifica que el rol exista y no esté protegido por el sistema
  private async assertExistsAndEditable(id: number) {
    const role = await this.prisma.role.findFirst({
      where: { id, deletedAt: null },
    });

    if (!role) {
      throw new NotFoundException("Rol no encontrado");
    }

    // Evita modificaciones sobre roles internos del sistema
    if (role.isSystem) {
      throw new ForbiddenException(
        "Este rol es un rol protegido del sistema y no puede modificarse",
      );
    }

    return role;
  }
}
