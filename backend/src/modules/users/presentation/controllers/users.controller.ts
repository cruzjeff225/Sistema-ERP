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
import { RequirePermissions } from "../../../../common/decorators/permissions.decorator";
import { USER_PERMISSIONS } from "../../../../common/constants/user-permissions.constant";
import { UsersService } from "../../application/services/users.service";
import { CreateUserDto } from "../../application/dto/create-user.dto";
import { UpdateUserDto } from "../../application/dto/update-user.dto";
import { AssignRolesDto } from "../../application/dto/assign-roles.dto";
import { UpdateUserStatusDto } from "../../application/dto/update-status.dto";
import { ChangePasswordDto } from "../../application/dto/change-password.dto";
import { QueryUsersDto } from "../../application/dto/query-users.dto";
import { AuthenticatedUser, CurrentUser } from "../../../auth/presentation/decorators/current-user.decorator";

// Agrupa los endpoints relacionados con la gestión de usuarios
@ApiTags("users")
// Indica que los endpoints requieren autenticación mediante token Bearer
@ApiBearerAuth()
@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // Lista usuarios aplicando filtros, paginación y ordenamiento
  @RequirePermissions(USER_PERMISSIONS.VIEW)
  @Get()
  @ApiOperation({ summary: "Listar usuarios" })
  findAll(@Query() query: QueryUsersDto) {
    return this.usersService.findAll(query).then((result) => ({
      success: true,
      message: "Usuarios obtenidos correctamente",
      data: result.items,
      meta: result.meta,
    }));
  }

  // Obtiene un usuario específico por su identificador
  @RequirePermissions(USER_PERMISSIONS.VIEW)
  @Get(":id")
  @ApiOperation({ summary: "Obtener un usuario por ID" })
  async findOne(@Param("id", ParseIntPipe) id: number) {
    const user = await this.usersService.findOne(id);

    return {
      success: true,
      message: "Usuario obtenido correctamente",
      data: user,
    };
  }

  // Crea un nuevo usuario
  @RequirePermissions(USER_PERMISSIONS.CREATE)
  @Post()
  @ApiOperation({ summary: "Crear usuario" })
  async create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthenticatedUser) {
    const user = await this.usersService.create(dto, actor.sub);

    return {
      success: true,
      message: "Usuario creado correctamente",
      data: user,
    };
  }

  // Actualiza los datos editables de un usuario
  @RequirePermissions(USER_PERMISSIONS.UPDATE)
  @Patch(":id")
  @ApiOperation({ summary: "Actualizar usuario" })
  async update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const user = await this.usersService.update(id, dto, actor.sub);

    return {
      success: true,
      message: "Usuario actualizado correctamente",
      data: user,
    };
  }

  // Elimina lógicamente un usuario por su identificador
  @RequirePermissions(USER_PERMISSIONS.DELETE)
  @Delete(":id")
  @ApiOperation({ summary: "Eliminar usuario (soft delete)" })
  async remove(@Param("id", ParseIntPipe) id: number, @CurrentUser() actor: AuthenticatedUser) {
    await this.usersService.remove(id, actor.sub);

    return {
      success: true,
      message: "Usuario eliminado correctamente",
      data: null,
    };
  }

  // Reemplaza los roles actualmente asignados a un usuario
  @RequirePermissions(USER_PERMISSIONS.ASSIGN_ROLES)
  @Put(":id/roles")
  @ApiOperation({ summary: "Reemplazar los roles asignados a un usuario" })
  async assignRoles(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: AssignRolesDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const user = await this.usersService.assignRoles(id, dto.roleIds, actor.sub);

    return {
      success: true,
      message: "Roles asignados correctamente",
      data: user,
    };
  }

  // Activa o desactiva un usuario por su identificador
  @RequirePermissions(USER_PERMISSIONS.UPDATE)
  @Patch(":id/status")
  @ApiOperation({ summary: "Activar o desactivar usuario" })
  async updateStatus(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const user = await this.usersService.updateStatus(id, dto.isActive, actor.sub);

    return {
      success: true,
      message: "Estado actualizado correctamente",
      data: user,
    };
  }

  // Cambia la contraseña de un usuario
  @RequirePermissions(USER_PERMISSIONS.CHANGE_PASSWORD)
  @Patch(":id/password")
  @ApiOperation({ summary: "Cambiar la contraseña de un usuario" })
  async changePassword(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: ChangePasswordDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    await this.usersService.changePassword(id, dto.newPassword, actor.sub);

    return {
      success: true,
      message: "Contraseña actualizada correctamente",
      data: null,
    };
  }

  @RequirePermissions(USER_PERMISSIONS.UPDATE)
  @Patch(":id/unlock")
  @ApiOperation({ summary: "Desbloquear usuario por intentos fallidos" })
  async unlock(@Param("id", ParseIntPipe) id: number, @CurrentUser() actor: AuthenticatedUser) {
    const user = await this.usersService.unlock(id, actor.sub);
    return { success: true, message: "Usuario desbloqueado correctamente", data: user };
  }
}
