import { SetMetadata } from '@nestjs/common';
import { PermissionMode } from '../enums/permission-mode.enum';

// Clave para almacenar los permisos requeridos.
export const PERMISSIONS_KEY = 'permissions';

// Clave para almacenar el modo de validación de permisos.
export const PERMISSIONS_MODE_KEY = 'permissionsMode';

export const STATUS_PERMISSIONS_KEY = 'statusPermissions';

// Requiere que el usuario posea todos los permisos indicados.
export const RequirePermissions = (...permissions: string[]) => {
  return (target: any, key?: any, descriptor?: any) => {
    SetMetadata(PERMISSIONS_KEY, permissions)(target, key, descriptor);
    SetMetadata(PERMISSIONS_MODE_KEY, PermissionMode.ALL)(target, key, descriptor);
    return descriptor;
  };
};

// Requiere que el usuario posea al menos uno de los permisos indicados.
export const RequireAnyPermission = (...permissions: string[]) => {
  return (target: any, key?: any, descriptor?: any) => {
    SetMetadata(PERMISSIONS_KEY, permissions)(target, key, descriptor);
    SetMetadata(PERMISSIONS_MODE_KEY, PermissionMode.ANY)(target, key, descriptor);
    return descriptor;
  };
};

// Requiere que el usuario posea todos los permisos indicados.
export const RequireAllPermissions = (...permissions: string[]) => {
  return (target: any, key?: any, descriptor?: any) => {
    SetMetadata(PERMISSIONS_KEY, permissions)(target, key, descriptor);
    SetMetadata(PERMISSIONS_MODE_KEY, PermissionMode.ALL)(target, key, descriptor);
    return descriptor;
  };
};

// Exige permisos distintos para activar y desactivar según el estado solicitado.
export const RequireStatusPermissions = (activate: string, deactivate: string) =>
  SetMetadata(STATUS_PERMISSIONS_KEY, { activate, deactivate });
