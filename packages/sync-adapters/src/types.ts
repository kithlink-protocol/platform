export type SyncProviderName = 'petfinder' | 'adoptapet';

export interface AnimalPayload {
  localId: string;
  externalId: string | null;
  name: string;
  species: string;
  breed: string | null;
  description: string | null;
  status: 'draft' | 'available' | 'pending' | 'adopted' | 'unavailable';
  photoUrls: (string | null)[];
}

export interface AdapterCredentials {
  clientId: string;
  clientSecret: string;
}

/** Per-target context; credentials are decrypted in-memory only (doc05 §1). */
export interface TenantCtx {
  credentials: AdapterCredentials;
  mode: 'dry_run' | 'live';
}

export interface PushResult {
  localId: string;
  externalId?: string;
  status: 'pushed' | 'skipped' | 'failed';
  decision?: string;
}

export interface SyncAdapter {
  readonly provider: SyncProviderName;
  readonly capabilities: { push: boolean; pull: boolean; photos: boolean; remove: boolean };
  pushAnimals(t: TenantCtx, animals: AnimalPayload[]): Promise<PushResult[]>;
  removeAnimal(t: TenantCtx, externalId: string): Promise<void>;
  fetchOne(t: TenantCtx, externalId: string): Promise<{ status: string } | null>;
}
