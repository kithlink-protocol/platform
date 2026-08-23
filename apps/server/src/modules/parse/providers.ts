export interface OcrResult {
  text: string;
  meanTokenConfidence: number;
}

export interface OcrProvider {
  readonly name: string;
  ocr(buf: Buffer, mime: string): Promise<OcrResult>;
}

export class NoopOcrProvider implements OcrProvider {
  readonly name = 'noop';
  async ocr(): Promise<OcrResult> {
    return { text: '', meanTokenConfidence: 0 };
  }
}

export interface LlmProvider {
  readonly name: string;
  extract(type: string, redactedText: string): Promise<Record<string, unknown> | null>;
}

const TYPE_PROMPTS: Record<string, string> = {
  lease_addendum:
    'Extract lease addendum data. Return JSON with keys: landlord_name, landlord_phone_e164, property_address, pet_policy{allowed,species_limits,max_count,deposit_usd,notes}, lease_start, lease_end, tenant_names[], document_type_guess.',
  vet_record:
    'Extract vet record data. Return JSON with keys: clinic_name, clinic_phone_e164, issued_on, patient_name, visits[{date,items[]}], vaccinations[{type,date,valid_until}], spay_neuter, microchip_id.',
};

export class OpenAiCompatLlmProvider implements LlmProvider {
  readonly name = 'openai-compat';

  constructor(
    private readonly baseUrl: string,
    private readonly model: string = process.env.LLM_MODEL ?? 'gpt-4o-mini',
    private readonly apiKey?: string,
  ) {}

  async extract(type: string, redactedText: string): Promise<Record<string, unknown> | null> {
    if (!redactedText.trim()) return null;
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: TYPE_PROMPTS[type] ?? 'Extract document fields as JSON.' },
            { role: 'user', content: redactedText },
          ],
        }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const content = data.choices?.[0]?.message?.content;
      if (!content) return null;
      const parsed: unknown = JSON.parse(content);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
}

export function makeOcrProvider(): OcrProvider {
  return new NoopOcrProvider();
}

export function makeLlmProvider(): LlmProvider | null {
  const baseUrl = process.env.LLM_BASE_URL;
  return baseUrl
    ? new OpenAiCompatLlmProvider(baseUrl, process.env.LLM_MODEL ?? 'gpt-4o-mini', process.env.LLM_API_KEY)
    : null;
}
