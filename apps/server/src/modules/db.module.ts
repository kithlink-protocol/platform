import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import {
  createDb,
  withTenantContext,
  withTenantTx,
  type AnySql,
  type Db,
  type DbHandles,
  type TenantContext,
} from '@kithlink/db';
import { AuditService } from '../common/audit.service';

export const DB_HANDLES = Symbol('DB_HANDLES');

@Injectable()
export class TenantService implements OnApplicationShutdown {
  constructor(@Inject(DB_HANDLES) private readonly handles: DbHandles) {}

  withTenant<T>(ctx: TenantContext, fn: (sql: AnySql) => Promise<T>): Promise<T> {
    return withTenantContext(this.handles, ctx, fn);
  }

  withTenantTx<T>(ctx: TenantContext, fn: (tx: Db) => Promise<T>): Promise<T> {
    return withTenantTx(this.handles, ctx, fn);
  }

  service<T>(fn: (sql: AnySql) => Promise<T>): Promise<T> {
    return withTenantContext(this.handles, { roleClass: 'service' }, fn);
  }

  onApplicationShutdown(): Promise<void> {
    return this.handles.sql.end({ timeout: 5 }).then(
      () => undefined,
      () => undefined,
    );
  }
}

@Global()
@Module({
  providers: [
    {
      provide: DB_HANDLES,
      useFactory: () => {
        const url = process.env.DATABASE_URL;
        if (!url) throw new Error('DATABASE_URL is required');
        return createDb(url);
      },
    },
    TenantService,
    AuditService,
  ],
  exports: [DB_HANDLES, TenantService, AuditService],
})
export class DbModule {}
