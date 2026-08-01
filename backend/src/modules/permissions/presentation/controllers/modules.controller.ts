import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../../../../common/decorators/permissions.decorator";
import { MODULE_PERMISSIONS } from "../../../../common/constants/permission-permissions.constant";
import { ModulesService } from "../../application/services/modules.service";
import { CreateModuleDto } from "../../application/dto/create-module.dto";

// Agrupa los endpoints relacionados con la gestión de módulos
@ApiTags("modules")
// Indica que los endpoints requieren autenticación mediante token Bearer
@ApiBearerAuth()
@Controller("modules")
export class ModulesController {
  constructor(private readonly modulesService: ModulesService) {}

  // Lista todos los módulos disponibles
  @RequirePermissions(MODULE_PERMISSIONS.VIEW)
  @Get()
  @ApiOperation({ summary: "Listar módulos" })
  async findAll() {
    const modules = await this.modulesService.findAll();

    return {
      success: true,
      message: "Módulos obtenidos correctamente",
      data: modules,
    };
  }

  // Crea un nuevo módulo
  @RequirePermissions(MODULE_PERMISSIONS.CREATE)
  @Post()
  @ApiOperation({ summary: "Crear módulo" })
  async create(@Body() dto: CreateModuleDto) {
    const mod = await this.modulesService.create(dto);

    return {
      success: true,
      message: "Módulo creado correctamente",
      data: mod,
    };
  }

  // Actualiza parcialmente un módulo por su identificador
  @RequirePermissions(MODULE_PERMISSIONS.UPDATE)
  @Patch(":id")
  @ApiOperation({ summary: "Actualizar módulo" })
  async update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: Partial<CreateModuleDto>,
  ) {
    const mod = await this.modulesService.update(id, dto);

    return {
      success: true,
      message: "Módulo actualizado correctamente",
      data: mod,
    };
  }

  // Elimina lógicamente un módulo por su identificador
  @RequirePermissions(MODULE_PERMISSIONS.DELETE)
  @Delete(":id")
  @ApiOperation({ summary: "Eliminar módulo (soft delete)" })
  async remove(@Param("id", ParseIntPipe) id: number) {
    await this.modulesService.remove(id);

    return {
      success: true,
      message: "Módulo eliminado correctamente",
      data: null,
    };
  }
}
