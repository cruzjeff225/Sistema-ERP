import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../../../../common/decorators/permissions.decorator";
import { PERMISSION_PERMISSIONS } from "../../../../common/constants/permission-permissions.constant";
import { PermissionsService } from "../../application/services/permissions.service";
import { CreatePermissionDto } from "../../application/dto/create-permission.dto";
import { UpdatePermissionDto } from "../../application/dto/update-permission.dto";
import { UpdateStatusDto } from "../../application/dto/update-status.dto";

// Agrupa los endpoints relacionados con la gestión de permisos
@ApiTags("permissions")
// Indica que los endpoints requieren autenticación mediante token Bearer
@ApiBearerAuth()
@Controller("permissions")
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  // Lista los permisos disponibles con filtro opcional por módulo
  @RequirePermissions(PERMISSION_PERMISSIONS.VIEW)
  @Get()
  @ApiOperation({
    summary: "Listar permisos, opcionalmente filtrados por módulo",
  })
  async findAll(@Query("moduleId") moduleId?: string) {
    const permissions = await this.permissionsService.findAll(
      moduleId ? parseInt(moduleId, 10) : undefined,
    );

    return {
      success: true,
      message: "Permisos obtenidos correctamente",
      data: permissions,
    };
  }

  // Obtiene un permiso específico por su identificador
  @RequirePermissions(PERMISSION_PERMISSIONS.VIEW)
  @Get(":id")
  @ApiOperation({ summary: "Obtener un permiso por ID" })
  async findOne(@Param("id", ParseIntPipe) id: number) {
    const permission = await this.permissionsService.findOne(id);

    return {
      success: true,
      message: "Permiso obtenido correctamente",
      data: permission,
    };
  }

  // Crea un nuevo permiso
  @RequirePermissions(PERMISSION_PERMISSIONS.CREATE)
  @Post()
  @ApiOperation({ summary: "Crear permiso" })
  async create(@Body() dto: CreatePermissionDto) {
    const permission = await this.permissionsService.create(dto);

    return {
      success: true,
      message: "Permiso creado correctamente",
      data: permission,
    };
  }

  // Actualiza los datos editables de un permiso
  @RequirePermissions(PERMISSION_PERMISSIONS.UPDATE)
  @Patch(":id")
  @ApiOperation({ summary: "Actualizar permiso" })
  async update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdatePermissionDto,
  ) {
    const permission = await this.permissionsService.update(id, dto);

    return {
      success: true,
      message: "Permiso actualizado correctamente",
      data: permission,
    };
  }

  // Activa o desactiva un permiso por su identificador
  @RequirePermissions(PERMISSION_PERMISSIONS.UPDATE)
  @Patch(":id/status")
  @ApiOperation({ summary: "Activar o desactivar permiso" })
  async updateStatus(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateStatusDto,
  ) {
    const permission = await this.permissionsService.updateStatus(
      id,
      dto.isActive,
    );

    return {
      success: true,
      message: "Estado actualizado correctamente",
      data: permission,
    };
  }

  // Elimina lógicamente un permiso por su identificador
  @RequirePermissions(PERMISSION_PERMISSIONS.DELETE)
  @Delete(":id")
  @ApiOperation({ summary: "Eliminar permiso (soft delete)" })
  async remove(@Param("id", ParseIntPipe) id: number) {
    await this.permissionsService.remove(id);

    return {
      success: true,
      message: "Permiso eliminado correctamente",
      data: null,
    };
  }
}
