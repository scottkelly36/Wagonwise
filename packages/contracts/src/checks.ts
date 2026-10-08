import { z } from 'zod';
import { brandedId } from './brand.js';
import { companyIdSchema } from './companies.js';

/**
 * Walk-round checks: each company builds its own check lists (a "template"), so a firm that wants a
 * different list, or none, can have it. A template is an ordered list of questions.
 */
export const checkTemplateIdSchema = brandedId<'CheckTemplateId'>();
export type CheckTemplateId = z.infer<typeof checkTemplateIdSchema>;

export const TEMPLATE_NAME_MAX = 80;
export const MAX_ITEMS = 60;
export const ITEM_LABEL_MAX = 120;
export const ITEM_HELP_MAX = 300;
export const UNIT_MAX = 20;

/** How serious a defect is. `do_not_drive` is one the vehicle should not go out with. */
export const defectSeveritySchema = z.enum(['advisory', 'do_not_drive']);
export type DefectSeverity = z.infer<typeof defectSeveritySchema>;

const itemBase = {
  /** Chosen by the builder and kept when a list is edited, so a driver's answers stay tied to their question. */
  id: z.string().min(1).max(64),
  label: z.string().trim().min(1).max(ITEM_LABEL_MAX),
  help: z.string().trim().max(ITEM_HELP_MAX).optional(),
  required: z.boolean(),
};

/** Tick if fine, flag if there is a defect. */
export const passFailItemSchema = z.object({
  ...itemBase,
  kind: z.literal('pass_fail'),
  severity: defectSeveritySchema,
  /** Ask for a photo when it is flagged. */
  photoOnDefect: z.boolean(),
});

/** A yes or no question, where one of the answers is a defect. */
export const yesNoItemSchema = z.object({
  ...itemBase,
  kind: z.literal('yes_no'),
  defectWhen: z.enum(['yes', 'no']),
  severity: defectSeveritySchema,
  photoOnDefect: z.boolean(),
});

/** A number such as mileage or a tyre pressure. Outside `min` to `max` (when set) counts as a defect. */
export const numberItemSchema = z.object({
  ...itemBase,
  kind: z.literal('number'),
  unit: z.string().trim().max(UNIT_MAX).optional(),
  min: z.number().finite().optional(),
  max: z.number().finite().optional(),
  severity: defectSeveritySchema,
});

export const noteItemSchema = z.object({ ...itemBase, kind: z.literal('note') });

/** Always asks for a photo (of the load, the trailer, the odometer). */
export const photoItemSchema = z.object({ ...itemBase, kind: z.literal('photo') });

export const checkItemSchema = z.discriminatedUnion('kind', [
  passFailItemSchema,
  yesNoItemSchema,
  numberItemSchema,
  noteItemSchema,
  photoItemSchema,
]);
export type CheckItem = z.infer<typeof checkItemSchema>;
export type CheckItemKind = CheckItem['kind'];

export const checkAppliesToSchema = z.enum(['all', 'selected']);

/** What the builder sends: used for a new list and for changing one. */
export const checkTemplateBodySchema = z.object({
  name: z.string().trim().min(1).max(TEMPLATE_NAME_MAX),
  /** `all`: every vehicle the company has. `selected`: only the vehicles named in `vehicleIds`. */
  appliesTo: checkAppliesToSchema,
  vehicleIds: z.array(z.string().min(1)).max(500),
  items: z.array(checkItemSchema).min(1).max(MAX_ITEMS),
});
export type CheckTemplateBody = z.infer<typeof checkTemplateBodySchema>;

export const checkTemplateSchema = checkTemplateBodySchema.extend({
  id: checkTemplateIdSchema,
  companyId: companyIdSchema,
  /** Goes up by one every time the list is changed. */
  version: z.number().int(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type CheckTemplateDto = z.infer<typeof checkTemplateSchema>;

/** `POST /staff/checks/companies/:companyId/templates`. `id` is chosen by the portal so a retry makes no second list. */
export const createCheckTemplateRequestSchema = checkTemplateBodySchema.extend({
  id: checkTemplateIdSchema,
});
export type CreateCheckTemplateRequest = z.infer<typeof createCheckTemplateRequestSchema>;

/** `PUT /staff/checks/templates/:id` */
export const updateCheckTemplateRequestSchema = checkTemplateBodySchema;

export const checksCompanyParamsSchema = z.object({ companyId: z.string().min(1) });
export const checkTemplateIdParamsSchema = z.object({ id: z.string().min(1) });

export const listCheckTemplatesResponseSchema = z.object({
  templates: z.array(checkTemplateSchema),
});

/** `GET /staff/checks/starter`: an example list to start from, with fresh question ids. */
export const starterTemplateResponseSchema = z.object({
  name: z.string(),
  items: z.array(checkItemSchema),
});

// ---------------------------------------------------------------------------------------------
// The driver's side: doing a check on the vehicle they are about to take out.

export const checkIdSchema = brandedId<'CheckId'>();
export type CheckId = z.infer<typeof checkIdSchema>;

export const checkResultSchema = z.enum(['clear', 'advisory', 'do_not_drive']);
export type CheckResult = z.infer<typeof checkResultSchema>;

export const ANSWER_NOTE_MAX = 500;

/**
 * One answer. `value` is `ok` or `defect` for a tick-or-flag question; `yes` or `no` for a yes-or-no one; a
 * number for a number question; the text for a note; `photo` for a photo question (the photo is sent on its own).
 * `note` is what the driver says about a defect.
 */
export const checkAnswerSchema = z.object({
  itemId: z.string().min(1).max(64),
  value: z.union([z.string().max(ANSWER_NOTE_MAX), z.number().finite()]),
  note: z.string().trim().max(ANSWER_NOTE_MAX).optional(),
});
export type CheckAnswer = z.infer<typeof checkAnswerSchema>;

/** `POST /checks`. `id` is chosen by the app so a retry after a dropped connection makes no second check. */
export const submitCheckRequestSchema = z.object({
  id: checkIdSchema,
  templateId: checkTemplateIdSchema,
  vehicleId: z.string().min(1),
  answers: z.array(checkAnswerSchema).max(MAX_ITEMS),
  /** When the driver finished it on the phone (the phone may have been offline). */
  completedAt: z.iso.datetime().optional(),
});
export type SubmitCheckRequest = z.infer<typeof submitCheckRequestSchema>;

export const submittedCheckSchema = z.object({
  id: checkIdSchema,
  result: checkResultSchema,
  defects: z.array(
    z.object({
      itemId: z.string(),
      label: z.string(),
      severity: defectSeveritySchema,
      detail: z.string(),
    }),
  ),
});
export type SubmittedCheckDto = z.infer<typeof submittedCheckSchema>;

/** `GET /checks/mine`: the check lists for the vehicle on the driver's current job, and which are done today. */
export const checksDueResponseSchema = z.object({
  vehicle: z.object({ id: z.string(), name: z.string() }).nullable(),
  lists: z.array(
    z.object({
      template: checkTemplateSchema,
      /** Someone has already done this list on this vehicle today. */
      doneToday: z.boolean(),
    }),
  ),
});
export type ChecksDueResponse = z.infer<typeof checksDueResponseSchema>;

export const checkPhotoParamsSchema = z.object({
  id: z.string().min(1),
  itemId: z.string().min(1),
});

/** `PUT /checks/:id/photos/:itemId`: a photo for one question; a retake replaces it. */
export const attachCheckPhotoRequestSchema = z.object({
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  dataBase64: z.base64().min(1).max(7_000_000),
});
export type AttachCheckPhotoRequest = z.infer<typeof attachCheckPhotoRequestSchema>;
