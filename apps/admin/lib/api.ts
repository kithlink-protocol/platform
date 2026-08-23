import type { Problem } from '@kithlink/contracts';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers,
      credentials: 'include',
    });
  } catch {
    throw new ApiError('Could not reach the Kithlink API. Please try again later.', 0);
  }

  if (!res.ok) {
    throw new ApiError(await extractProblemMessage(res), res.status);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

async function extractProblemMessage(res: Response): Promise<string> {
  try {
    const problem = (await res.json()) as Partial<Problem>;
    if (typeof problem.detail === 'string') return problem.detail;
    if (typeof problem.title === 'string') return problem.title;
  } catch {
  }
  if (res.status === 401) {
    return 'You are not signed in.';
  }
  return `Something went wrong (HTTP ${res.status}). Please try again later.`;
}
