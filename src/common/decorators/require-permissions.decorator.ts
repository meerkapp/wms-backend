import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';
export const ALL_PERMISSIONS_KEY = 'allPermissions';

export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const RequireAllPermissions = (...permissions: string[]) =>
  SetMetadata(ALL_PERMISSIONS_KEY, permissions);
