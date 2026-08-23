import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { StaffRole } from '@kithlink/contracts';
import type { PrincipalRequest } from './principal';

export const STAFF_ROLE_RANK: Record<StaffRole, number> = {
  viewer: 1,
  volunteer: 2,
  coordinator: 3,
  admin: 4,
  owner: 5,
};

export function hasSufficientRole(role: StaffRole, required: StaffRole[]): boolean {
  if (required.length === 0) return true;
  const minRequired = Math.min(...required.map(r => STAFF_ROLE_RANK[r]));
  return STAFF_ROLE_RANK[role] >= minRequired;
}

export const STAFF_ROLES_METADATA_KEY = 'kithlink.staff_roles';

export const RequireStaffRole = (...roles: StaffRole[]) => SetMetadata(STAFF_ROLES_METADATA_KEY, roles);

@Injectable()
export class StaffRoleGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<PrincipalRequest>();
    if (!req.principal) throw new UnauthorizedException();
    const required =
      this.reflector.getAllAndOverride<StaffRole[]>(STAFF_ROLES_METADATA_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    if (required.length === 0) return true;
    const shelterId = req.params.shelterId as string | undefined;
    const membership = shelterId ? req.principal.memberships.find(m => m.shelterId === shelterId) : undefined;
    if (!membership || !hasSufficientRole(membership.role, required)) {
      throw new ForbiddenException('Insufficient role for this shelter');
    }
    return true;
  }
}
