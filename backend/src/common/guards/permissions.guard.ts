import {
  ForbiddenException,
  Injectable,
  CanActivate,
  ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  PERMISSIONS_KEY,
  PERMISSIONS_MODE_KEY,
} from "../decorators/permissions.decorator";
import { PermissionMode } from "../enums/permission-mode.enum";
import { AuthenticatedUser } from "../../modules/auth/presentation/decorators/current-user.decorator";

// Nombre del rol con acceso total al sistema.
const SUPERADMIN_ROLE = "superadmin";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Obtiene los permisos requeridos desde el controlador o método.
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Permite el acceso si la ruta no requiere permisos.
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    // Obtiene el modo de validación de permisos (ALL o ANY).
    const mode = this.reflector.getAllAndOverride<PermissionMode>(
      PERMISSIONS_MODE_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Recupera el usuario autenticado desde la petición.
    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;

    // Bloquea el acceso si no existe un usuario autenticado.
    if (!user) {
      throw new ForbiddenException("No autorizado");
    }

    // Omite la validación de permisos para el superadministrador.
    if (user.roles.includes(SUPERADMIN_ROLE)) {
      return true;
    }

    // Convierte los permisos del usuario en un Set para búsquedas rápidas.
    const userPermissions = new Set(user.permissions);

    // Valida los permisos según el modo configurado.
    const hasAccess =
      mode === PermissionMode.ANY
        ? requiredPermissions.some((p) => userPermissions.has(p))
        : requiredPermissions.every((p) => userPermissions.has(p));

    // Deniega el acceso si no cumple con los permisos requeridos.
    if (!hasAccess) {
      throw new ForbiddenException(
        "No tienes permisos suficientes para realizar esta acción",
      );
    }

    // Permite continuar con la ejecución de la solicitud.
    return true;
  }
}