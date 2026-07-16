import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ALL_PERMISSIONS_KEY, PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { JwtPayload } from '../../modules/auth/strategies/jwt.strategy';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const requiredAll = this.reflector.getAllAndOverride<string[]>(ALL_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if ((!required || required.length === 0) && (!requiredAll || requiredAll.length === 0)) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<{ user: JwtPayload }>();
    const permissions = user?.permissions ?? [];
    const hasAnyRequired =
      !required ||
      required.length === 0 ||
      required.some((permission) => permissions.includes(permission));
    const hasAllRequired =
      !requiredAll ||
      requiredAll.length === 0 ||
      requiredAll.every((permission) => permissions.includes(permission));

    return hasAnyRequired && hasAllRequired;
  }
}
