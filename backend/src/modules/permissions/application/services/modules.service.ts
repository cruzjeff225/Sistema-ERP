import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { TrashService } from "../../../trash/trash.service";
import { PrismaService } from "../../../../infrastructure/database/prisma/prisma.service";
import { CreateModuleDto } from "../dto/create-module.dto";

@Injectable()
export class ModulesService {
  constructor(private readonly prisma: PrismaService, private readonly trash: TrashService) {}

  // Obtiene todos los módulos activos que no han sido eliminados
  async findAll() {
    return this.prisma.module.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        description: true,
        isActive: true,
        _count: { select: { permissions: true } },
      },
      orderBy: { name: "asc" },
    });
  }

  // Crea un módulo después de validar que el nombre no esté registrado
  async create(dto: CreateModuleDto) {
    const existing = await this.prisma.module.findFirst({
      where: { name: dto.name, deletedAt: null },
    });

    // Evita registrar módulos duplicados
    if (existing) {
      throw new ConflictException("Ya existe un módulo con ese nombre");
    }

    return this.prisma.module.create({
      data: { name: dto.name, description: dto.description },
    });
  }

  // Actualiza la información de un módulo existente
  async update(id: number, dto: Partial<CreateModuleDto>) {
    await this.assertExists(id);

    return this.prisma.module.update({
      where: { id },
      data: { name: dto.name, description: dto.description },
    });
  }

  async remove(id: number, userId: number) {
    return this.trash.trash('modules', id, userId, await this.trash.primaryCompany());
  }

  // Verifica que el módulo exista y no haya sido eliminado
  private async assertExists(id: number) {
    const mod = await this.prisma.module.findFirst({
      where: { id, deletedAt: null },
    });

    if (!mod) {
      throw new NotFoundException("Módulo no encontrado");
    }

    return mod;
  }
}