import { z } from 'zod';
import { companyIdSchema } from './companies.js';

const pointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

/**
 * `POST /sos/raise`: the driver pressed and held SOS. `requestId` is chosen by the app for the press, so a retry after a dropped
 * connection does not tell the office twice. The position is where the phone says it is now.
 */
export const raiseSosRequestSchema = z.object({
  requestId: z.uuid(),
  location: pointSchema,
});
export type RaiseSosRequest = z.infer<typeof raiseSosRequestSchema>;

/** What the driver is shown after pressing: the three words (when the lookup answered) and who was told. Nobody told means the
 *  driver has no company: nothing was sent, and the words are for them to read to whoever they call. */
export const raiseSosResponseSchema = z.object({
  requestId: z.uuid(),
  location: pointSchema,
  /** Three words joined by dots, no `///`. Absent when what3words did not answer; the position is still sent. */
  words: z.string().optional(),
  nearestPlace: z.string().optional(),
  notified: z.array(z.object({ companyId: companyIdSchema, name: z.string() })),
});
export type RaiseSosResponse = z.infer<typeof raiseSosResponseSchema>;

/** `POST /sos/cancel`: the driver says it was a mistake or they are all right. Everyone told is told. */
export const cancelSosRequestSchema = z.object({ requestId: z.uuid() });
export type CancelSosRequest = z.infer<typeof cancelSosRequestSchema>;

export const sosStatusSchema = z.enum(['open', 'resolved', 'cancelled']);
export type SosStatus = z.infer<typeof sosStatusSchema>;

/** An alert as the company's office sees it. */
export const sosAlertSchema = z.object({
  id: z.uuid(),
  status: sosStatusSchema,
  driverName: z.string().optional(),
  /** How to ring the driver: the number or email they sign in with. */
  driverContact: z.string().optional(),
  vehicleName: z.string().optional(),
  vehicleRegistration: z.string().optional(),
  jobReference: z.string().optional(),
  location: pointSchema,
  words: z.string().optional(),
  nearestPlace: z.string().optional(),
  createdAt: z.iso.datetime(),
  resolvedAt: z.iso.datetime().optional(),
});
export type SosAlertDto = z.infer<typeof sosAlertSchema>;

/** `GET /staff/sos?status=open|all`. */
export const listSosQuerySchema = z.object({ status: z.enum(['open', 'all']).default('open') });
export type ListSosQuery = z.infer<typeof listSosQuerySchema>;

export const listSosResponseSchema = z.object({ alerts: z.array(sosAlertSchema) });
export type ListSosResponse = z.infer<typeof listSosResponseSchema>;

export const sosIdParamsSchema = z.object({ id: z.uuid() });
