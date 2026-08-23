import 'server-only';

import type {
  AnimalPublic,
  Problem,
  ShelterDetail,
  ShelterPublic,
} from '@kithlink/contracts';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {}

async function fetchJson<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { cache: 'no-store' });
  } catch {
    throw new ApiError('Could not reach the Kithlink API. Please try again later.');
  }
  if (!res.ok) {
    throw new ApiError(await extractProblemMessage(res));
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
  return `Something went wrong (HTTP ${res.status}). Please try again later.`;
}

export async function listShelters(): Promise<ShelterPublic[]> {
  const data = await fetchJson<ShelterPublic[] | { items: ShelterPublic[] }>(
    '/public/v1/shelters',
  );
  return Array.isArray(data) ? data : (data.items ?? []);
}

export async function getShelter(slug: string): Promise<ShelterDetail> {
  return fetchJson<ShelterDetail>(`/public/v1/shelters/${encodeURIComponent(slug)}`);
}

export async function listShelterAnimals(slug: string): Promise<AnimalPublic[]> {
  const data = await fetchJson<{ items: AnimalPublic[] }>(
    `/public/v1/shelters/${encodeURIComponent(slug)}/animals?limit=25`,
  );
  return data.items;
}
