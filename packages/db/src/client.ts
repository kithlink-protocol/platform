import postgres from 'postgres';
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema/index';

export type Db = PostgresJsDatabase<typeof schema>;
export type Tx = postgres.TransactionSql;
/** postgres.js session sql OR transaction sql — both support tagged templates. */
export type AnySql = postgres.Sql | postgres.TransactionSql;
export { schema };

export interface DbHandles {
  sql: postgres.Sql;
  db: Db;
}

export function createDb(url: string, max = 10): DbHandles {
  const sql = postgres(url, { max, prepare: false });
  return { sql, db: drizzle(sql, { schema }) };
}

export type RoleClass = 'staff' | 'applicant' | 'service' | 'anonymous';

export interface TenantContext {
  userId?: string | null;
  shelterId?: string | null;
  roleClass?: RoleClass;
}

/**
 * Runs `fn` inside a transaction with RLS session variables set (SET LOCAL
 * semantics via set_config(..., true)). This is the ONLY sanctioned way for
 * request-scoped code to touch tenant tables — the GUCs are what the row
 * level policies key on.
 */
export async function withTenantContext<T>(
  handles: Pick<DbHandles, 'sql'>,
  ctx: TenantContext,
  fn: (tx: AnySql) => Promise<T>,
): Promise<T> {
  const result = await handles.sql.begin(async tx => {
    await tx`select set_config('kithlink.user_id', ${ctx.userId ?? ''}, true)`;
    await tx`select set_config('kithlink.shelter_id', ${ctx.shelterId ?? ''}, true)`;
    await tx`select set_config('kithlink.role_class', ${ctx.roleClass ?? 'staff'}, true)`;
    return fn(tx);
  });
  return result as T;
}

/** Drizzle-flavored transaction with tenant context. */
export async function withTenantTx<T>(
  handles: DbHandles,
  ctx: TenantContext,
  fn: (tx: Db) => Promise<T>,
): Promise<T> {
  return withTenantContext(handles, ctx, async txSql => {
    const txDb = drizzle(txSql as unknown as postgres.Sql, { schema });
    return fn(txDb);
  });
}

export type { PendingQuery, Row, Sql } from 'postgres';
