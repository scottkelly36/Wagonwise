import { z } from 'zod';
import type { HazardParser, ParsedVoiceReport } from '../application/ports/hazard-parser.js';

const DEFAULT_ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

// Haiku, not a larger model — design doc §7's own cost note ("a sentence in, a short JSON object
// out — pennies at Phase 1 volumes") names exactly this class of call.
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

const TOOL_NAME = 'file_hazard_report';

const SYSTEM_PROMPT = `You turn a UK HGV driver's spoken, in-cab transcript into a structured hazard report.
Always call ${TOOL_NAME} exactly once with your best interpretation — never ask a clarifying question, never reply in plain text.
"type" must be the single closest match from the fixed list, even if imperfect; use "other" only when nothing fits.
"measurement" is only for a stated height, width or weight limit (e.g. "three and a half metres", "seven and a half tonnes") — omit it if the driver didn't give a number.
"positionHint" is a short phrase for where the hazard is, in the driver's own words (e.g. "just past the roundabout"), if they said one — omit it otherwise.
"note" is a short, plain-English summary of what the driver reported, suitable for another driver to read at a glance.`;

// Mirrors ParsedVoiceReport structurally (hazards/domain/hazard-report.ts has no npm deps, so it
// can't export a zod schema itself — same reasoning as decision 46/52's "structurally identical,
// no cross-module import" precedent, applied here across the domain/infrastructure boundary
// instead of across modules).
const parsedVoiceReportSchema = z.object({
  type: z.enum([
    'low_bridge',
    'weight_limit',
    'width_restriction',
    'tight_bend',
    'roadworks',
    'flooding',
    'no_hgv',
    'other',
  ]),
  note: z.string().min(1).optional(),
  measurement: z
    .object({
      kind: z.enum(['height', 'width', 'weight']),
      value: z.number().positive(),
      unit: z.enum(['m', 't']),
    })
    .optional(),
  positionHint: z.string().min(1).optional(),
});

const TOOL_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    type: {
      type: 'string',
      enum: [
        'low_bridge',
        'weight_limit',
        'width_restriction',
        'tight_bend',
        'roadworks',
        'flooding',
        'no_hgv',
        'other',
      ],
    },
    note: { type: 'string' },
    measurement: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['height', 'width', 'weight'] },
        value: { type: 'number' },
        unit: { type: 'string', enum: ['m', 't'] },
      },
      required: ['kind', 'value', 'unit'],
    },
    positionHint: { type: 'string' },
  },
  required: ['type'],
} as const;

interface AnthropicContentBlock {
  readonly type: string;
  readonly name?: string;
  readonly input?: unknown;
}

interface AnthropicMessagesResponse {
  readonly content: readonly AnthropicContentBlock[];
}

function isAnthropicMessagesResponse(body: unknown): body is AnthropicMessagesResponse {
  return (
    typeof body === 'object' &&
    body !== null &&
    Array.isArray((body as { content?: unknown }).content)
  );
}

const FALLBACK: Pick<ParsedVoiceReport, 'type'> = { type: 'other' };

/**
 * Real LLM-backed parsing via Anthropic's Messages API (design doc §7 step 3) — hand-rolled HTTP
 * (decision 6/51's "hand-roll small, well-understood things"), no SDK: one request, one forced
 * tool call, one response to read back. `tool_choice` forces the model to call `file_hazard_report`
 * rather than reply in free text, so there's no separate "find the JSON in the prose" step — but
 * the tool's `input` is still just a model's guess at matching the schema, so it's zod-validated
 * before being trusted, not assumed correct because the API accepted the request.
 *
 * "Invalid output" (no tool call, or a tool call whose `input` fails validation) is retried once;
 * still invalid after the retry falls back to `{ type: 'other', note: transcript }` (design doc
 * §7 step 3, verbatim). A non-2xx response or an unparseable response body is a genuine infra
 * fault and throws, same convention as `ValhallaRoutingEngine`/`ExpoPushNotifier`.
 */
export class AnthropicHazardParser implements HazardParser {
  constructor(
    private readonly apiKey: string,
    private readonly apiUrl: string = DEFAULT_ANTHROPIC_URL,
    private readonly model: string = DEFAULT_MODEL,
  ) {}

  async parse(transcript: string): Promise<ParsedVoiceReport> {
    const first = await this.attempt(transcript);
    if (first) {
      return first;
    }
    const retry = await this.attempt(transcript);
    if (retry) {
      return retry;
    }
    return { ...FALLBACK, note: transcript };
  }

  /** One request/response round trip. Returns `undefined` for "invalid output" (retry or fall
   *  back); throws for a genuine infra fault. */
  private async attempt(transcript: string): Promise<ParsedVoiceReport | undefined> {
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: transcript }],
        tools: [
          {
            name: TOOL_NAME,
            description: "Extract a structured hazard report from the driver's transcript.",
            input_schema: TOOL_INPUT_SCHEMA,
          },
        ],
        tool_choice: { type: 'tool', name: TOOL_NAME },
      }),
    });
    const parsed: unknown = await response.json();

    if (!response.ok || !isAnthropicMessagesResponse(parsed)) {
      throw new Error(
        `Anthropic Messages API returned ${response.status} with an unrecognised body: ${JSON.stringify(parsed)}`,
      );
    }

    const toolUse = parsed.content.find(
      (block): boolean => block.type === 'tool_use' && block.name === TOOL_NAME,
    );
    if (!toolUse) {
      return undefined;
    }

    const validated = parsedVoiceReportSchema.safeParse(toolUse.input);
    return validated.success ? validated.data : undefined;
  }
}
