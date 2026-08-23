import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
  Inject,
} from '@nestjs/common';
import { addStaffMemberSchema, updateStaffMemberSchema, type StaffRole } from '@kithlink/contracts';
import { AuditService } from '../../common/audit.service';
import { Principal } from '../../common/principal';
import { RequireStaffRole, StaffRoleGuard } from '../../common/roles';
import { SessionGuard } from '../../common/session.guard';
import { TenantService } from '../db.module';

interface StaffRow {
  user_id: string;
  role: StaffRole;
  created_at: Date;
}

interface UserEmailRow {
  id: string;
  email: string;
}

function staffCtx(principal: Principal, shelterId: string) {
  return { userId: principal.user.id, shelterId, roleClass: 'staff' as const };
}

@UseGuards(SessionGuard, StaffRoleGuard)
@RequireStaffRole('admin', 'owner')
@Controller('admin/v1/shelters/:shelterId/staff-members')
export class AdminStaffController {
  constructor(
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Get()
  async list(@Principal() principal: Principal, @Param('shelterId') shelterId: string) {
    const rows = await this.tenants.withTenant(staffCtx(principal, shelterId), async sql => {
      return (await sql`
        select sm.user_id, sm.role, sm.created_at
        from staff_members sm
        where sm.shelter_id = ${shelterId}::uuid
        order by sm.created_at`) as unknown as StaffRow[];
    });
    // users_self RLS hides joined users under staff ctx, so resolve emails in a service-context read.
    const ids = rows.map(r => r.user_id);
    const emails = await this.tenants.service(async sql => {
      const found = ids.length
        ? ((await sql`select id, email from users where id = any(${ids}::uuid[])`) as unknown as UserEmailRow[])
        : [];
      return new Map(found.map(u => [u.id, u.email]));
    });
    return rows.map(r => ({ userId: r.user_id, email: emails.get(r.user_id) ?? '', role: r.role }));
  }

  @Post()
  async add(
    @Principal() principal: Principal,
    @Param('shelterId') shelterId: string,
    @Body() body: unknown,
  ) {
    const input = addStaffMemberSchema.parse(body);
    const requester = principal.memberships.find(m => m.shelterId === shelterId);
    if (!requester) throw new ForbiddenException('No membership for this shelter');
    if (input.role === 'owner' && requester.role !== 'owner') {
      throw new ForbiddenException('Only an owner can add another owner');
    }
    const targetUserId = await this.tenants.service(async sql => {
      const existing = (await sql`
        select id from users where email = ${input.email} and deleted_at is null limit 1`) as unknown as UserEmailRow[];
      if (existing[0]) return existing[0].id;
      const created = (await sql`insert into users (email) values (${input.email}) returning id`) as unknown as UserEmailRow[];
      return created[0]!.id;
    });
    const inserted = await this.tenants.withTenant(staffCtx(principal, shelterId), async sql => {
      const rows = (await sql`
        insert into staff_members (shelter_id, user_id, role)
        values (${shelterId}::uuid, ${targetUserId}::uuid, ${input.role})
        on conflict do nothing
        returning user_id, role`) as unknown as { user_id: string; role: StaffRole }[];
      if (rows[0]) {
        await this.audit.append(sql, principal.user.id, shelterId, 'staff.added', 'staff_member', targetUserId, {
          email: input.email,
          role: input.role,
        });
      }
      return rows[0] ?? null;
    });
    if (!inserted) throw new ConflictException('User is already a staff member here');
    return { userId: targetUserId, email: input.email, role: inserted.role };
  }

  @Patch(':userId')
  async update(
    @Principal() principal: Principal,
    @Param('shelterId') shelterId: string,
    @Param('userId') userId: string,
    @Body() body: unknown,
  ) {
    const input = updateStaffMemberSchema.parse(body);
    const requester = principal.memberships.find(m => m.shelterId === shelterId);
    if (!requester) throw new ForbiddenException('No membership for this shelter');
    const updated = await this.tenants.withTenant(staffCtx(principal, shelterId), async sql => {
      const targets = (await sql`
        select role from staff_members
        where shelter_id = ${shelterId}::uuid and user_id = ${userId}::uuid
        limit 1`) as unknown as { role: StaffRole }[];
      const target = targets[0];
      if (!target) throw new NotFoundException('Staff member not found');
      if (target.role === 'owner' && requester.role !== 'owner') {
        throw new ForbiddenException('Only an owner can change an owner');
      }
      const rows = (await sql`
        update staff_members set role = ${input.role}
        where shelter_id = ${shelterId}::uuid and user_id = ${userId}::uuid
        returning user_id, role`) as unknown as { user_id: string; role: StaffRole }[];
      await this.audit.append(sql, principal.user.id, shelterId, 'staff.role_changed', 'staff_member', userId, {
        from: target.role,
        to: input.role,
      });
      return rows[0] ?? null;
    });
    if (!updated) throw new NotFoundException('Staff member not found');
    return { userId: updated.user_id, role: updated.role };
  }
}
