import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../../../infrastructure/database/prisma/prisma.service";
import { CreatePermissionDto } from "../dto/create-permission.dto";
import { UpdatePermissionDto } from "../dto/update-permission.dto";

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  // Define los campos que se devolverán en las consultas de permisos
  private readonly select = {
    id: true,
    action: true,
    name: true,
    description: true,
    isActive: true,
    isSystem: true,
    createdAt: true,
    updatedAt: true,
    module: { select: { id: true, name: true } },
  };

  // Obtiene todos los permisos activos, con filtro opcional por módulo
  async findAll(moduleId?: number) {
    return this.prisma.permission.findMany({
      where: {
        deletedAt: null,
        ...(moduleId ? { moduleId } : {}),
      },
      select: this.select,
      orderBy: { action: "asc" },
    });
  }

  // Obtiene un permiso específico por su identificador
  async findOne(id: number) {
    const permission = await this.prisma.permission.findFirst({
      where: { id, deletedAt: null },
      select: this.select,
    });

    // Informa si el permiso no existe o fue eliminado
    if (!permission) {
      throw new NotFoundException("Permiso no encontrado");
    }

    return permission;
  }

  // Crea un permiso después de validar su código y módulo asociado
  async create(dto: CreatePermissionDto) {
    const existing = await this.prisma.permission.findFirst({
      where: { action: dto.action, deletedAt: null },
    });

    // Evita registrar permisos con códigos duplicados
    if (existing) {
      throw new ConflictException("Ya existe un permiso con ese código");
    }

    // Verifica que el módulo asociado exista
    const moduleExists = await this.prisma.module.findFirst({
      where: { id: dto.moduleId, deletedAt: null },
    });

    if (!moduleExists) {
      throw new BadRequestException("El módulo indicado no existe");
    }

    return this.prisma.permission.create({
      data: {
        action: dto.action,
        name: dto.name,
        description: dto.description,
        moduleId: dto.moduleId,
      },
      select: this.select,
    });
  }

  // Actualiza los datos editables de un permiso
  async update(id: number, dto: UpdatePermissionDto) {
    await this.assertExistsAndEditable(id);

    // Valida el nuevo módulo cuando se proporciona
    if (dto.moduleId) {
      const moduleExists = await this.prisma.module.findFirst({
        where: { id: dto.moduleId, deletedAt: null },
      });

      if (!moduleExists) {
        throw new BadRequestException("El módulo indicado no existe");
      }
    }

    return this.prisma.permission.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        moduleId: dto.moduleId,
      },
      select: this.select,
    });
  }

  // Activa o desactiva un permiso editable
  async updateStatus(id: number, isActive: boolean) {
    await this.assertExistsAndEditable(id);

    return this.prisma.permission.update({
      where: { id },
      data: { isActive },
      select: this.select,
    });
  }

  // Realiza la eliminación lógica de un permiso sin roles asociados
  async remove(id: number) {
    await this.assertExistsAndEditable(id);

    // Cuenta los roles que tienen asignado el permiso
    const rolesCount = await this.prisma.rolePermission.count({
      where: { permissionId: id },
    });

    // Impide eliminar permisos que todavía están asignados a roles
    if (rolesCount > 0) {
      throw new BadRequestException(
        "No se puede eliminar un permiso que está asignado a uno o más roles",
      );
    }

    // Marca el permiso como eliminado e inactivo
    await this.prisma.permission.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    return { id };
  }

  // Verifica que el permiso exista y no esté protegido por el sistema
  private async assertExistsAndEditable(id: number) {
    const permission = await this.prisma.permission.findFirst({
      where: { id, deletedAt: null },
    });

    if (!permission) {
      throw new NotFoundException("Permiso no encontrado");
    }

    // Evita modificaciones sobre permisos internos del sistema
    if (permission.isSystem) {
      throw new ForbiddenException(
        "Este permiso es un permiso protegido del sistema y no puede modificarse",
      );
    }

    return permission;
  }
}