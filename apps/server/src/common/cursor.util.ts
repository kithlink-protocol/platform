export interface CursorPayload {
  createdAt: string;
  id: string;
}

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify([payload.createdAt, payload.id]), 'utf8').toString('base64url');
}

export function decodeCursor(value: string): CursorPayload | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!Array.isArray(parsed) || parsed.length !== 2) return null;
    const [createdAt, id] = parsed as unknown[];
    if (typeof createdAt !== 'string' || typeof id !== 'string') return null;
    if (!Number.isFinite(Date.parse(createdAt))) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}
