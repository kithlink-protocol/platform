const PG_UNIQUE_VIOLATION = '23505';
const PG_FOREIGN_KEY_VIOLATION = '23503';
const PG_CHECK_VIOLATION = '23514';

function pgErrorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return undefined;
}

export function isUniqueViolation(error: unknown): boolean {
  return pgErrorCode(error) === PG_UNIQUE_VIOLATION;
}

export function isForeignKeyViolation(error: unknown): boolean {
  return pgErrorCode(error) === PG_FOREIGN_KEY_VIOLATION;
}

export function isCheckViolation(error: unknown): boolean {
  return pgErrorCode(error) === PG_CHECK_VIOLATION;
}
