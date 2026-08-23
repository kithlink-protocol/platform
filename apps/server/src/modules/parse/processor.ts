import { z } from 'zod';
import { Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../../common/audit.service';
import { CryptoUtil } from '../../common/crypto.util';
import { TenantService } from '../db.module';
import { S3Service } from '../s3/s3.module';
import { makeLlmProvider, makeOcrProvider, type LlmProvider, type OcrProvider } from './providers';
import { computeConfidence } from './score';

const PENDING_REVIEW_THRESHOLD = 0.55;

const leaseExtractSchema = z.object({
  landlord_name: z.string().nullish(),
  landlord_phone_e164: z.string().nullish(),
  property_address: z.string().nullish(),
  pet_policy: z.record(z.unknown()).nullish(),
  lease_start: z.string().nullish(),
  lease_end: z.string().nullish(),
  tenant_names: z.array(z.string()).nullish(),
  document_type_guess: z.string().nullish(),
});

const vetExtractSchema = z.object({
  clinic_name: z.string().nullish(),
  clinic_phone_e164: z.string().nullish(),
  issued_on: z.string().nullish(),
  patient_name: z.string().nullish(),
  visits: z.array(z.record(z.unknown())).nullish(),
  vaccinations: z.array(z.record(z.unknown())).nullish(),
  spay_neuter: z.boolean().nullish(),
  microchip_id: z.string().nullish(),
});

const E164 = /^\+[1-9]\d{6,14}$/;

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function bigrams(value: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < value.length - 1; i++) out.add(value.slice(i, i + 2));
  return out;
}

/** Sørensen–Dice similarity over normalized bigrams (doc04 §V3 fuzzy ≥ 0.85). */
export function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb || nb.includes(na)) return 1;
  const ga = bigrams(na);
  const gb = bigrams(nb);
  let overlap = 0;
  for (const g of ga) if (gb.has(g)) overlap++;
  return (2 * overlap) / (ga.size + gb.size);
}

export function redactForLlm(text: string): string {
  const luhnValid = (digits: string): boolean => {
    let sum = 0;
    let dbl = false;
    for (let i = digits.length - 1; i >= 0; i--) {
      let d = Number(digits[i]);
      if (dbl) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      sum += d;
      dbl = !dbl;
    }
    return sum % 10 === 0;
  };
  return text
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED_SSN]')
    .replace(/\b\d{13,19}\b/g, m => (luhnValid(m) ? '[REDACTED_FIN]' : m));
}

interface GroundingResult {
  extracted: Record<string, unknown>;
  groundedRatio: number;
}

function collectStrings(node: unknown, path: string[], out: { path: string[]; value: string }[]): void {
  if (typeof node === 'string') {
    out.push({ path, value: node });
  } else if (Array.isArray(node)) {
    node.forEach((item, i) => collectStrings(item, [...path, String(i)], out));
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) collectStrings(v, [...path, k], out);
  }
}

function nullAtPath(obj: Record<string, unknown>, path: string[]): void {
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]!;
    const next = cur[key];
    if (!next || typeof next !== 'object') return;
    cur = next as Record<string, unknown>;
  }
  cur[path[path.length - 1]!] = null;
}

function groundFields(extracted: Record<string, unknown>, sourceText: string): GroundingResult {
  const strings: { path: string[]; value: string }[] = [];
  collectStrings(extracted, [], strings);
  const groundable = strings.filter(s => s.value.length >= 4 && !s.value.startsWith('[REDACTED'));
  if (groundable.length === 0) return { extracted, groundedRatio: sourceText.trim() ? 1 : 0 };
  let grounded = 0;
  const result = structuredClone(extracted);
  for (const s of groundable) {
    if (similarity(s.value, sourceText) >= 0.85) {
      grounded++;
    } else {
      nullAtPath(result, s.path);
    }
  }
  return { extracted: result, groundedRatio: grounded / groundable.length };
}

function requiredKeys(type: string): string[][] {
  switch (type) {
    case 'lease_addendum':
      return [['landlord_name'], ['property_address'], ['lease_start'], ['lease_end']];
    case 'vet_record':
      return [['clinic_name'], ['issued_on'], ['patient_name']];
    default:
      return [];
  }
}

function atPath(obj: Record<string, unknown>, path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function completenessScore(type: string, extracted: Record<string, unknown>): number {
  const keys = requiredKeys(type);
  if (keys.length === 0) return Object.values(extracted).some(v => v !== null && v !== undefined) ? 1 : 0;
  const present = keys.filter(path => atPath(extracted, path) != null).length;
  return present / keys.length;
}

function isOrderedDateRange(start?: string | null, end?: string | null): boolean | null {
  if (!start || !end) return null;
  const a = Date.parse(start);
  const b = Date.parse(end);
  return Number.isFinite(a) && Number.isFinite(b) ? a <= b : false;
}

function consistencyScore(type: string, extracted: Record<string, unknown>): number {
  const checks: (boolean | null)[] = [];
  const phone = (extracted.landlord_phone_e164 ?? extracted.clinic_phone_e164) as string | undefined;
  if (phone != null) checks.push(E164.test(phone));
  if (type === 'lease_addendum') {
    checks.push(isOrderedDateRange(extracted.lease_start as string, extracted.lease_end as string));
  }
  const vaccines = extracted.vaccinations as Record<string, unknown>[] | undefined;
  if (vaccines?.length) {
    for (const v of vaccines) {
      checks.push(isOrderedDateRange(v.date as string, v.valid_until as string));
    }
  }
  const chip = extracted.microchip_id as string | undefined;
  if (chip != null) checks.push(/^\d{15}$/.test(chip));
  const applicable = checks.filter((c): c is boolean => c !== null);
  if (applicable.length === 0) return 1;
  return applicable.filter(Boolean).length / applicable.length;
}

@Injectable()
export class ParseProcessor {
  private readonly ocr: OcrProvider;
  private readonly llm: LlmProvider | null;

  constructor(
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(S3Service) private readonly s3: S3Service,
    @Inject(CryptoUtil) private readonly crypto: CryptoUtil,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {
    this.ocr = makeOcrProvider();
    this.llm = makeLlmProvider();
  }

  async process(job: { artifactId: string }): Promise<void> {
    try {
      await this.processInner(job.artifactId);
    } catch (error) {
      console.error(`[parse] artifact ${job.artifactId} failed`, error);
      await this.tenants
        .service(async sql => {
          await sql`
            update artifacts set state = 'failed_parse', updated_at = now()
            where id = ${job.artifactId}::uuid`;
        })
        .catch(() => undefined);
    }
  }

  private async processInner(artifactId: string): Promise<void> {
    interface ArtifactJobRow {
      id: string;
      type: string;
      applicant_id: string;
      storage_key: string;
      edek_wrapped: string;
      mime: string;
    }
    const rows = (await this.tenants.service(async sql => {
      return sql`
        select a.id, a.type, a.applicant_id, f.storage_key, f.edek_wrapped, f.mime
        from artifacts a join artifact_files f on f.artifact_id = a.id
        where a.id = ${artifactId}::uuid limit 1`;
    })) as unknown as ArtifactJobRow[];
    const row = rows[0];
    if (!row) return;

    const sealed = (await this.s3.get(row.storage_key)).toString('utf8');
    const plaintext = Buffer.from(this.crypto.open(sealed), 'utf8');

    const ocrResult = await this.ocr.ocr(plaintext, row.mime);
    const redactedText = redactForLlm(ocrResult.text);

    let raw: Record<string, unknown> | null = null;
    if (this.llm) {
      raw = await this.llm.extract(row.type, redactedText);
      if (raw) {
        const validated =
          row.type === 'lease_addendum'
            ? leaseExtractSchema.safeParse(raw)
            : row.type === 'vet_record'
              ? vetExtractSchema.safeParse(raw)
              : { success: true, data: raw } as const;
        if (!validated.success) {
          raw = this.llm ? await this.llm.extract(row.type, redactedText) : null;
          const retried =
            raw && (row.type === 'lease_addendum'
              ? leaseExtractSchema.safeParse(raw)
              : row.type === 'vet_record'
                ? vetExtractSchema.safeParse(raw)
                : { success: true, data: raw } as const);
          raw = retried && retried.success ? (retried.data as Record<string, unknown>) : null;
        } else {
          raw = validated.data as Record<string, unknown>;
        }
      }
    }

    if (!raw) {
      await this.finalize(row.id, artifactId, null, 0, redactedText, 'failed_parse');
      return;
    }

    const { extracted, groundedRatio } = groundFields(raw, redactedText);
    const confidence = computeConfidence({
      ocrMean: ocrResult.meanTokenConfidence,
      groundedRatio,
      completeness: completenessScore(row.type, extracted),
      consistency: consistencyScore(row.type, extracted),
      classifierAgreement:
        typeof extracted.document_type_guess === 'string' &&
        extracted.document_type_guess === row.type
          ? 1
          : 0.5,
    });
    const state = confidence >= PENDING_REVIEW_THRESHOLD ? 'parsed' : 'pending_review';
    await this.finalize(row.id, artifactId, extracted, confidence, redactedText, state);
  }

  private async finalize(
    rowId: string,
    artifactId: string,
    extracted: Record<string, unknown> | null,
    confidence: number,
    redactedText: string,
    state: 'parsed' | 'pending_review' | 'failed_parse',
  ): Promise<void> {
    await this.tenants.service(async sql => {
      await sql`
        update artifacts set
          extracted_json = ${extracted ? JSON.stringify(extracted) : null}::jsonb,
          confidence = ${state === 'failed_parse' ? null : confidence},
          redacted_text = ${redactedText || null},
          state = ${state},
          updated_at = now()
        where id = ${rowId}::uuid`;
      await this.audit.append(sql, null, null, 'artifact.parsed', 'artifact', artifactId, {
        state,
        confidence: state === 'failed_parse' ? null : confidence,
      });
    });
  }
}
