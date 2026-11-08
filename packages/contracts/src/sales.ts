import { z } from 'zod';

/** Where a firm is. The first seven are a pipeline (a firm only moves forward through them); the last two end it. */
export const SALES_STAGES = [
  'not_contacted',
  'contacted',
  'replied',
  'conversation',
  'demo',
  'pilot',
  'paying',
  'not_interested',
  'do_not_contact',
] as const;
export const salesStageSchema = z.enum(SALES_STAGES);
export type SalesStage = z.infer<typeof salesStageSchema>;

/** What kind of business it is, which decides how it may be contacted (a limited company's mailbox, or by phone only). */
export const LEGAL_FORMS = ['limited', 'sole_trader_or_partnership', 'unknown'] as const;
export const legalFormSchema = z.enum(LEGAL_FORMS);
export type LegalForm = z.infer<typeof legalFormSchema>;

/** `warm` is someone the owner already knows; `new` is a cold contact. */
export const RELATIONSHIPS = ['warm', 'new'] as const;
export const relationshipSchema = z.enum(RELATIONSHIPS);
export type Relationship = z.infer<typeof relationshipSchema>;

export const CONTACT_HOWS = ['phone', 'email', 'facebook', 'in_person', 'other'] as const;
export const contactHowSchema = z.enum(CONTACT_HOWS);
export type ContactHow = z.infer<typeof contactHowSchema>;

/** What came of it. `sent` is "reached out, no reply yet". */
export const CONTACT_RESULTS = [
  'sent',
  'replied',
  'conversation',
  'demo',
  'pilot',
  'not_interested',
  'opted_out',
] as const;
export const contactResultSchema = z.enum(CONTACT_RESULTS);
export type ContactResult = z.infer<typeof contactResultSchema>;

/** The one problem a message or call led with. Kept to a short list so the page can show which one gets replies. */
export const PITCHES = [
  'checks',
  'maintenance',
  'proof_of_delivery',
  'fuel_costs',
  'jobs',
  'routes_parking',
  'other',
] as const;
export const pitchSchema = z.enum(PITCHES);
export type Pitch = z.infer<typeof pitchSchema>;

const text = (max: number) => z.string().trim().max(max);

export const prospectSchema = z.object({
  id: z.string(),
  name: z.string(),
  town: z.string().optional(),
  /** About how many lorries. */
  fleetSize: z.number().int().optional(),
  haulageType: z.string().optional(),
  website: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  contactPerson: z.string().optional(),
  legalForm: legalFormSchema,
  relationship: relationshipSchema,
  stage: salesStageSchema,
  nextStep: z.string().optional(),
  /** `YYYY-MM-DD`. */
  nextStepOn: z.iso.date().optional(),
  notes: z.string().optional(),
  createdAt: z.iso.datetime(),
});
export type ProspectDto = z.infer<typeof prospectSchema>;

export const entrySchema = z.object({
  id: z.string(),
  prospectId: z.string(),
  at: z.iso.datetime(),
  how: contactHowSchema,
  result: contactResultSchema,
  pitch: pitchSchema.optional(),
  note: z.string().optional(),
});
export type EntryDto = z.infer<typeof entrySchema>;

/** `GET /staff/sales` (WagonWise staff only): every firm and every contact entry; the page works out the rest. */
export const salesResponseSchema = z.object({
  prospects: z.array(prospectSchema),
  entries: z.array(entrySchema),
});
export type SalesResponse = z.infer<typeof salesResponseSchema>;

export const prospectIdParamsSchema = z.object({ id: z.uuid() });
export const entryIdParamsSchema = z.object({ id: z.uuid() });

/** `POST /staff/sales/prospects`: add a firm. An empty string means "not given". */
export const createProspectRequestSchema = z.object({
  name: text(120).min(1),
  town: text(80).optional(),
  fleetSize: z.number().int().min(0).max(10_000).optional(),
  haulageType: text(200).optional(),
  website: text(200).optional(),
  phone: text(60).optional(),
  email: text(254).optional(),
  contactPerson: text(80).optional(),
  legalForm: legalFormSchema.optional(),
  relationship: relationshipSchema.optional(),
  nextStep: text(300).optional(),
  nextStepOn: z.iso.date().optional(),
  notes: text(2000).optional(),
});
export type CreateProspectRequest = z.infer<typeof createProspectRequestSchema>;

/** `PUT /staff/sales/prospects/:id`: change the fields sent; `null` clears one. */
export const updateProspectRequestSchema = z.object({
  name: text(120).min(1).optional(),
  town: text(80).nullable().optional(),
  fleetSize: z.number().int().min(0).max(10_000).nullable().optional(),
  haulageType: text(200).nullable().optional(),
  website: text(200).nullable().optional(),
  phone: text(60).nullable().optional(),
  email: text(254).nullable().optional(),
  contactPerson: text(80).nullable().optional(),
  legalForm: legalFormSchema.optional(),
  relationship: relationshipSchema.optional(),
  stage: salesStageSchema.optional(),
  nextStep: text(300).nullable().optional(),
  nextStepOn: z.iso.date().nullable().optional(),
  notes: text(2000).nullable().optional(),
});
export type UpdateProspectRequest = z.infer<typeof updateProspectRequestSchema>;

/** `POST /staff/sales/prospects/:id/entries`: log a contact. It moves the firm's stage on, and may set the next step. */
export const addEntryRequestSchema = z.object({
  /** When it happened; now if left out. */
  at: z.iso.datetime().optional(),
  how: contactHowSchema,
  result: contactResultSchema,
  pitch: pitchSchema.optional(),
  note: text(1000).optional(),
  nextStep: text(300).nullable().optional(),
  nextStepOn: z.iso.date().nullable().optional(),
});
export type AddEntryRequest = z.infer<typeof addEntryRequestSchema>;

export const addEntryResponseSchema = z.object({ prospect: prospectSchema, entry: entrySchema });
export type AddEntryResponse = z.infer<typeof addEntryResponseSchema>;

export const IMPORT_MAX_ROWS = 200;

/** A row of a spreadsheet, every cell as text; the server reads each one and skips those it cannot use. */
export const importRowSchema = z.object({
  name: z.string().max(200),
  town: z.string().max(200).optional(),
  fleetSize: z.string().max(20).optional(),
  haulageType: z.string().max(500).optional(),
  website: z.string().max(500).optional(),
  phone: z.string().max(200).optional(),
  email: z.string().max(500).optional(),
  contactPerson: z.string().max(200).optional(),
  legalForm: z.string().max(60).optional(),
  relationship: z.string().max(60).optional(),
  nextStep: z.string().max(500).optional(),
  notes: z.string().max(3000).optional(),
});
export type ImportRow = z.infer<typeof importRowSchema>;

/** `POST /staff/sales/import`. */
export const importRequestSchema = z.object({
  rows: z.array(importRowSchema).min(1).max(IMPORT_MAX_ROWS),
});
export type ImportRequest = z.infer<typeof importRequestSchema>;

export const IMPORT_SKIP_REASONS = ['already_listed', 'invalid'] as const;
export const importResponseSchema = z.object({
  added: z.number().int(),
  skipped: z.array(z.object({ name: z.string(), reason: z.enum(IMPORT_SKIP_REASONS) })),
});
export type ImportResponse = z.infer<typeof importResponseSchema>;
