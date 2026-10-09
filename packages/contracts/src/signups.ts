import { z } from 'zod';

export const SIGNUP_ROLES = ['driver', 'company', 'both', 'other'] as const;
export const signupRoleSchema = z.enum(SIGNUP_ROLES);
export const FLEET_SIZES = ['1-5', '6-15', '16-40', '40+'] as const;
export const fleetSizeSchema = z.enum(FLEET_SIZES);

/**
 * `POST /signups` (public, from the landing page): someone registers their email to test WagonWise. `consent` must be true:
 * they ticked the box agreeing to be contacted about testing. `website` is a trap field a person never fills in; a bot does.
 */
export const signupRequestSchema = z.object({
  email: z.string().max(254),
  name: z.string().max(80).optional(),
  role: signupRoleSchema,
  company: z.string().max(120).optional(),
  fleetSize: fleetSizeSchema.optional(),
  consent: z.boolean(),
  website: z.string().max(200).optional(),
});
export type SignupRequest = z.infer<typeof signupRequestSchema>;

/** `POST /signups/remove` (public): take an address off the list. */
export const removeSignupRequestSchema = z.object({ email: z.string().max(254) });

export const testerSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().optional(),
  role: signupRoleSchema,
  company: z.string().optional(),
  fleetSize: fleetSizeSchema.optional(),
  createdAt: z.iso.datetime(),
});
export type TesterDto = z.infer<typeof testerSchema>;

/** `GET /staff/signups` (WagonWise staff only): newest first. */
export const listTestersResponseSchema = z.object({
  testers: z.array(testerSchema),
  total: z.number().int(),
});

export type ListTestersResponse = z.infer<typeof listTestersResponseSchema>;

export const testerIdParamsSchema = z.object({ id: z.string().min(1) });
