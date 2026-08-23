'use client';

import type { Problem } from '@kithlink/contracts';

const API_BASE = '/api'; // same-origin proxy (next.config.mjs rewrites) keeps session cookies first-party

export class ClientApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ClientApiError';
    this.status = status;
  }
}

async function extractProblemMessage(res: Response): Promise<string> {
  try {
    const problem = (await res.json()) as Partial<Problem>;
    if (typeof problem.detail === 'string') return problem.detail;
    if (typeof problem.title === 'string') return problem.title;
  } catch {
  }
  return `Something went wrong (HTTP ${res.status}). Please try again later.`;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, credentials: 'include', headers });
  } catch {
    throw new ClientApiError(0, 'Could not reach the Kithlink API. Please try again later.');
  }
  if (!res.ok) throw new ClientApiError(res.status, await extractProblemMessage(res));
  if (res.status === 204) return undefined as T;
  try {
    return (await res.json()) as T;
  } catch {
    return undefined as T;
  }
}
