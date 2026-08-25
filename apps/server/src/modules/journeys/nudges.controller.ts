import { Body, Controller, Get, HttpCode, Inject, NotFoundException, Patch, Post, UseGuards } from '@nestjs/common';
import { nudgePreferencesSchema, type NudgePreferences } from '@kithlink/contracts';
import { Principal } from '../../common/principal';
import { SessionGuard } from '../../common/session.guard';
import { TenantService } from '../db.module';

interface NudgeSettingsRow {
  enabled: boolean;
}

/**
 * Ethical-nudge opt-out lives in users.settings.nudgesEnabled (jsonb); default is on.
 * POST mirrors PATCH so the email unsubscribe link works with either verb.
 */
@UseGuards(SessionGuard)
@Controller('app/v1/me/nudge-preferences')
export class NudgePreferencesController {
  constructor(
    @Inject(TenantService) private readonly tenants: TenantService,
  ) {}

  @Get()
  async get(@Principal() principal: Principal): Promise<NudgePreferences> {
    const rows = (await this.tenants.service(async sql => {
      return sql`
        select coalesce(settings->>'nudgesEnabled', 'true') <> 'false' as enabled
        from users
        where id = ${principal.user.id}::uuid and deleted_at is null
        limit 1`;
    })) as unknown as NudgeSettingsRow[];
    if (!rows[0]) throw new NotFoundException('Account not found');
    return nudgePreferencesSchema.parse({ enabled: rows[0].enabled });
  }

  @Patch()
  update(@Principal() principal: Principal, @Body() body: unknown): Promise<NudgePreferences> {
    return this.set(principal.user.id, body);
  }

  @HttpCode(200)
  @Post()
  toggleOff(@Principal() principal: Principal, @Body() body: unknown): Promise<NudgePreferences> {
    return this.set(principal.user.id, body);
  }

  private async set(userId: string, body: unknown): Promise<NudgePreferences> {
    const input = nudgePreferencesSchema.parse(body);
    const rows = (await this.tenants.service(async sql => {
      return sql`
        update users set settings = jsonb_set(
          coalesce(settings, '{}'::jsonb),
          '{nudgesEnabled}',
          ${input.enabled ? 'true' : 'false'}::jsonb)
        where id = ${userId}::uuid and deleted_at is null
        returning coalesce(settings->>'nudgesEnabled', 'true') <> 'false' as enabled`;
    })) as unknown as NudgeSettingsRow[];
    if (!rows[0]) throw new NotFoundException('Account not found');
    return nudgePreferencesSchema.parse({ enabled: rows[0].enabled });
  }
}
