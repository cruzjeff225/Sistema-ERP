import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../../../common/decorators/permissions.decorator";
import { ROLE_PERMISSIONS } from "../../../common/constants/role-permissions.constant";
import { RolesService } from "../application/services/roles.service";
import { CreateRoleDto } from "../application/dto/create-role.dto";
import { UpdateRoleDto } from "../application/dto/update-role.dto";
import { AssignPermissionsDto } from "../application/dto/assign-permissions.dto";
import { UpdateRoleStatusDto } from "../application/dto/update-status.dto";
import { DuplicateRoleDto } from "../application/dto/duplicate-role.dto";
import { AuthenticatedUser, CurrentUser } from "../../auth/presentation/decorators/current-user.decorator";

// Agrupa los endpoints relacionados con la gestión de roles
@ApiTags("roles")
// Indica que los endpoints requieren autenticación mediante token Bearer
@ApiBearerAuth()
@Controller("roles")
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  // Lista los roles con búsqueda opcional por nombre
  @RequirePermissions(ROLE_PERMISSIONS.VIEW)
  @Get()
  @ApiOperation({ summary: "Listar roles" })
  async findAll(@Query("search") search?: string) {
    const roles = await this.rolesService.findAll(search);

    return {
      success: true,
      message: "Roles obtenidos correctamente",
      data: roles,
    };
  }

  // Obtiene un rol específico junto con sus permisos asignados
  @RequirePermissions(ROLE_PERMISSIONS.VIEW)
  @Get(":id")
  @ApiOperation({ summary: "Obtener un rol con sus permisos" })
  async findOne(@Param("id", ParseIntPipe) id: number) {
    const role = await this.rolesService.findOne(id);

    return {
      success: true,
      message: "Rol obtenido correctamente",
      data: role,
    };
  }

  // Crea un nuevo rol
  @RequirePermissions(ROLE_PERMISSIONS.CREATE, ROLE_PERMISSIONS.ASSIGN_PERMISSIONS)
  @Post()
  @ApiOperation({ summary: "Crear rol" })
  async create(@Body() dto: CreateRoleDto, @CurrentUser() user: AuthenticatedUser) {
    const role = await this.rolesService.create(dto, user.sub);

    return {
      success: true,
      message: "Rol creado correctamente",
      data: role,
    };
  }

  // Actualiza los datos editables de un rol
  @RequirePermissions(ROLE_PERMISSIONS.UPDATE, ROLE_PERMISSIONS.ASSIGN_PERMISSIONS)
  @Patch(":id")
  @ApiOperation({ summary: "Actualizar rol" })
  async update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const role = await this.rolesService.update(id, dto, user.sub);

    return {
      success: true,
      message: "Rol actualizado correctamente",
      data: role,
    };
  }

  // Elimina lógicamente un rol por su identificador
  @RequirePermissions(ROLE_PERMISSIONS.DELETE)
  @Delete(":id")
  @ApiOperation({ summary: "Eliminar rol (soft delete)" })
  async remove(@Param("id", ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    await this.rolesService.remove(id, user.sub);

    return {
      success: true,
      message: "Rol eliminado correctamente",
      data: null,
    };
  }

  // Reemplaza los permisos actualmente asignados a un rol
  @RequirePermissions(ROLE_PERMISSIONS.ASSIGN_PERMISSIONS)
  @Put(":id/permissions")
  @ApiOperation({ summary: "Reemplazar los permisos asignados a un rol" })
  async assignPermissions(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: AssignPermissionsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const role = await this.rolesService.assignPermissions(
      id,
      dto.permissionIds,
      user.sub,
    );

    return {
      success: true,
      message: "Permisos asignados correctamente",
      data: role,
    };
  }

  // Activa o desactiva un rol por su identificador
  @RequirePermissions(ROLE_PERMISSIONS.UPDATE)
  @Patch(":id/status")
  @ApiOperation({ summary: "Activar o desactivar rol" })
  async updateStatus(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateRoleStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const role = await this.rolesService.updateStatus(id, dto.isActive, user.sub);

    return {
      success: true,
      message: "Estado actualizado correctamente",
      data: role,
    };
  }

  @RequirePermissions(ROLE_PERMISSIONS.CREATE, ROLE_PERMISSIONS.ASSIGN_PERMISSIONS)
  @Post(":id/duplicate")
  @ApiOperation({ summary: "Duplicar un rol con sus permisos" })
  async duplicate(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: DuplicateRoleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const role = await this.rolesService.duplicate(id, dto.name, user.sub);
    return { success: true, message: "Rol duplicado correctamente", data: role };
  }
}
