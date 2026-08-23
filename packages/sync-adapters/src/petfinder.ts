import type { AdapterCredentials, AnimalPayload, PushResult, SyncAdapter, TenantCtx } from './types';

const API_BASE = process.env.PETFINDER_API_BASE ?? 'https://api.petfinder.com/v2';
const DRY_RUN = 'dry-run would push';
const DRY_REMOVE = 'dry-run would remove';

export function mapSpecies(species: string): string {
  const lowered = species.toLowerCase();
  if (lowered === 'dog' || lowered === 'cat' || lowered === 'rabbit') return lowered;
  return 'other';
}

type PetfinderStatus = 'adoptable' | 'pending' | 'remove';

export function mapStatus(status: string): PetfinderStatus {
  switch (status) {
    case 'available':
      return 'adoptable';
    case 'pending':
      return 'pending';
    default:
      return 'remove';
  }
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
}

interface PetfinderAnimalResponse {
  animal?: { id?: number | string; status?: string };
  id?: number | string;
  status?: string;
}

export class PetfinderAdapter implements SyncAdapter {
  readonly provider = 'petfinder' as const;
  readonly capabilities = { push: true, pull: false, photos: true, remove: true };

  private accessToken: string | null = null;
  private tokenExpiresAt = 0;
  private readonly forceDryRun: boolean;

  constructor(opts: { dryRun?: boolean } = {}) {
    this.forceDryRun = opts.dryRun ?? false;
  }

  private isDryRun(t: TenantCtx): boolean {
    return this.forceDryRun || t.mode === 'dry_run' || process.env.PETFINDER_MODE === 'dry_run';
  }

  private async ensureToken(t: TenantCtx): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) return this.accessToken;
    const creds: AdapterCredentials = t.credentials;
    const res = await fetch(`${API_BASE}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
      }),
    });
    if (!res.ok) throw new Error(`petfinder token request failed with ${res.status}`);
    const body = (await res.json()) as TokenResponse;
    if (!body.access_token) throw new Error('petfinder token response missing access_token');
    this.accessToken = body.access_token;
    this.tokenExpiresAt = Date.now() + (body.expires_in ?? 3600) * 1000 - 60_000;
    return this.accessToken;
  }

  async pushAnimals(t: TenantCtx, animals: AnimalPayload[]): Promise<PushResult[]> {
    const dryRun = this.isDryRun(t);
    const results: PushResult[] = [];
    for (const animal of animals) {
      try {
        results.push(await this.pushOne(t, animal, dryRun));
      } catch (error) {
        results.push({
          localId: animal.localId,
          status: 'failed',
          decision: `push failed: ${(error as Error).message}`,
        });
      }
    }
    return results;
  }

  private async pushOne(t: TenantCtx, animal: AnimalPayload, dryRun: boolean): Promise<PushResult> {
    const type = mapSpecies(animal.species);
    const status = mapStatus(animal.status);
    if (status === 'remove') {
      if (!animal.externalId) {
        return {
          localId: animal.localId,
          status: 'skipped',
          decision: `${DRY_REMOVE} ${animal.name}: no external id`,
        };
      }
      if (!dryRun) await this.removeAnimal(t, animal.externalId);
      return {
        localId: animal.localId,
        externalId: animal.externalId,
        status: 'skipped',
        decision: `${dryRun ? DRY_REMOVE : 'removed'} ${animal.name} (${animal.externalId})`,
      };
    }
    if (dryRun) {
      return {
        localId: animal.localId,
        status: 'pushed',
        decision: `${DRY_RUN} ${animal.name} as type=${type} status=${status}`,
      };
    }
    const token = await this.ensureToken(t);
    const photos = animal.photoUrls
      .filter((url): url is string => Boolean(url))
      .map(url => ({ photo: { full: url } }));
    const res = await fetch(`${API_BASE}/animals`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: animal.name,
        type,
        breed: animal.breed ?? undefined,
        age: 'adult',
        status,
        description: animal.description ?? undefined,
        photos,
      }),
    });
    if (!res.ok) throw new Error(`petfinder push failed with ${res.status}`);
    const body = (await res.json()) as PetfinderAnimalResponse;
    const externalId = String(body.animal?.id ?? body.id ?? '');
    return {
      localId: animal.localId,
      externalId: externalId || undefined,
      status: 'pushed',
      decision: `pushed ${animal.name} to petfinder as type=${type} status=${status}`,
    };
  }

  async removeAnimal(t: TenantCtx, externalId: string): Promise<void> {
    if (this.isDryRun(t)) return;
    const token = await this.ensureToken(t);
    await fetch(`${API_BASE}/animals/${encodeURIComponent(externalId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => undefined);
  }

  async fetchOne(t: TenantCtx, externalId: string): Promise<{ status: string } | null> {
    if (this.isDryRun(t)) return null;
    const token = await this.ensureToken(t);
    const res = await fetch(`${API_BASE}/animals/${encodeURIComponent(externalId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`petfinder fetch failed with ${res.status}`);
    const body = (await res.json()) as PetfinderAnimalResponse;
    const raw = body.animal?.status ?? body.status;
    return { status: normalizeExternalStatus(raw) };
  }
}

export function normalizeExternalStatus(raw: string | undefined): string {
  switch ((raw ?? '').toLowerCase()) {
    case 'adoptable':
      return 'available';
    case 'pending':
      return 'pending';
    default:
      return 'unavailable';
  }
}
