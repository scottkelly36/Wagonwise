import {
  createItemTypeRequestSchema,
  itemTypeBodySchema,
  bookRepairRequestSchema,
  importDatesRequestSchema,
  completeRepairRequestSchema,
  maintenanceCompanyParamsSchema,
  maintenanceItemParamsSchema,
  maintenanceVehicleItemParamsSchema,
  maintenanceVehicleParamsSchema,
  markDoneRequestSchema,
  myRemindersSchema,
  repairParamsSchema,
  repairsQuerySchema,
  setDueRequestSchema,
} from '@wagonwise/contracts/maintenance';
import {
  checkResultParamsSchema,
  checkResultPhotoParamsSchema,
  checkResultsQuerySchema,
  checkTemplateIdParamsSchema,
  checksCompanyParamsSchema,
  createCheckTemplateRequestSchema,
  defectIdParamsSchema,
  defectsQuerySchema,
  setDefectStatusRequestSchema,
  updateCheckSettingsRequestSchema,
  updateCheckTemplateRequestSchema,
} from '@wagonwise/contracts/checks';
import {
  addCostRequestSchema,
  addInvoiceLineRequestSchema,
  changeCostRequestSchema,
  costIdParamsSchema,
  financeQuerySchema,
  generateInvoicesRequestSchema,
  invoiceIdParamsSchema,
  invoiceLineParamsSchema,
  planCompanyParamsSchema,
  scheduleCapacityRequestSchema,
  setPriceRequestSchema,
  stopCostRequestSchema,
  updateBillingDetailsRequestSchema,
} from '@wagonwise/contracts/billing';
import {
  companySettingsParamsSchema,
  createCompanyRequestSchema,
  updateCompanySettingsRequestSchema,
} from '@wagonwise/contracts/companies';
import {
  createFleetVehicleRequestSchema,
  driverLinkIdParamsSchema,
  fleetCompanyIdParamsSchema,
  fleetVehicleIdParamsSchema,
  inviteDriverRequestSchema,
  updateFleetVehicleRequestSchema,
} from '@wagonwise/contracts/fleet';
import {
  hazardReportIdParamsSchema,
  moderateHazardRequestSchema,
} from '@wagonwise/contracts/hazards';
import {
  assignJobRequestSchema,
  createJobRequestSchema,
  jobCompanyIdParamsSchema,
  jobIdParamsSchema,
  jobReportRequestSchema,
  previewJobRouteRequestSchema,
  proofOfDeliveryQuerySchema,
} from '@wagonwise/contracts/jobs';
import {
  markPlaceRequestSchema,
  placeIdParamsSchema,
  placesCompanyParamsSchema,
  updatePlaceRequestSchema,
} from '@wagonwise/contracts/places';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticateOrReject } from './auth/authenticate.js';
import type { CoreMethod } from './core-client.js';
import type { StaffRouteDeps } from './staff-routes.js';

const noParams = z.object({});

interface Forward {
  readonly method: CoreMethod;
  /** Fastify's pattern; core serves the same path, with the validated params filled in. */
  readonly path: string;
  readonly params: z.ZodType<Record<string, string>>;
  readonly body?: z.ZodType;
  /** The query string, when the route takes one: validated, and passed on to core. */
  readonly query?: z.ZodType<Record<string, unknown>>;
}

/** The dashboard's pages that moved from the driver sign-in to staff accounts (P2-M1.12c). */
const FORWARDS: readonly Forward[] = [
  // WagonWise admins only; core decides.
  { method: 'GET', path: '/staff/companies', params: noParams },
  { method: 'POST', path: '/staff/companies', params: noParams, body: createCompanyRequestSchema },
  // A company's own settings: how long delivery photos are kept. Its managers choose; core decides who may.
  { method: 'GET', path: '/staff/companies/:id/settings', params: companySettingsParamsSchema },
  {
    method: 'PUT',
    path: '/staff/companies/:id/settings',
    params: companySettingsParamsSchema,
    body: updateCompanySettingsRequestSchema,
  },
  // Walk-round check lists a company builds for itself: its staff see them, fleet managers build them. Core decides.
  { method: 'GET', path: '/staff/checks/starter', params: noParams },
  {
    method: 'GET',
    path: '/staff/checks/companies/:companyId/templates',
    params: checksCompanyParamsSchema,
  },
  {
    method: 'POST',
    path: '/staff/checks/companies/:companyId/templates',
    params: checksCompanyParamsSchema,
    body: createCheckTemplateRequestSchema,
  },
  {
    method: 'PUT',
    path: '/staff/checks/templates/:id',
    params: checkTemplateIdParamsSchema,
    body: updateCheckTemplateRequestSchema,
  },
  { method: 'DELETE', path: '/staff/checks/templates/:id', params: checkTemplateIdParamsSchema },
  // What drivers' walk-round checks found, for the office: results, one check in full with its photos, and the
  // defects to work through. Core decides who may see and change them.
  {
    method: 'GET',
    path: '/staff/checks/companies/:companyId/results',
    params: checksCompanyParamsSchema,
    query: checkResultsQuerySchema,
  },
  { method: 'GET', path: '/staff/checks/results/:id', params: checkResultParamsSchema },
  {
    method: 'GET',
    path: '/staff/checks/results/:id/photos/:itemId',
    params: checkResultPhotoParamsSchema,
  },
  {
    method: 'GET',
    path: '/staff/checks/companies/:companyId/defects',
    params: checksCompanyParamsSchema,
    query: defectsQuerySchema,
  },
  {
    method: 'PUT',
    path: '/staff/checks/defects/:id/status',
    params: defectIdParamsSchema,
    body: setDefectStatusRequestSchema,
  },
  // A firm's rules about sending a vehicle out: its staff read them, fleet managers change them. Core decides.
  {
    method: 'GET',
    path: '/staff/checks/companies/:companyId/settings',
    params: checksCompanyParamsSchema,
  },
  {
    method: 'PUT',
    path: '/staff/checks/companies/:companyId/settings',
    params: checksCompanyParamsSchema,
    body: updateCheckSettingsRequestSchema,
  },
  // WagonWise's own billing details, printed on invoices. WagonWise admins only; core decides.
  { method: 'GET', path: '/staff/billing/details', params: noParams },
  {
    method: 'PUT',
    path: '/staff/billing/details',
    params: noParams,
    body: updateBillingDetailsRequestSchema,
  },
  // What each company pays for: price per vehicle and the vehicle capacity. WagonWise admins only; core decides.
  { method: 'GET', path: '/staff/billing/companies', params: noParams },
  {
    method: 'GET',
    path: '/staff/billing/companies/:companyId/capacity',
    params: planCompanyParamsSchema,
  },
  {
    method: 'POST',
    path: '/staff/billing/companies/:companyId/capacity',
    params: planCompanyParamsSchema,
    body: scheduleCapacityRequestSchema,
  },
  {
    method: 'PUT',
    path: '/staff/billing/companies/:companyId/price',
    params: planCompanyParamsSchema,
    body: setPriceRequestSchema,
  },
  // A company's own plan and issued invoices, for its billing managers (`manage_billing`). Core decides.
  { method: 'GET', path: '/staff/billing/my/plan', params: noParams },
  { method: 'GET', path: '/staff/billing/my/invoices', params: noParams },
  // WagonWise's own finances: the costs an admin enters, and the report setting them against invoices. Admins only.
  {
    method: 'GET',
    path: '/staff/billing/finance',
    params: noParams,
    query: financeQuerySchema,
  },
  { method: 'POST', path: '/staff/billing/costs', params: noParams, body: addCostRequestSchema },
  {
    method: 'PUT',
    path: '/staff/billing/costs/:id',
    params: costIdParamsSchema,
    body: changeCostRequestSchema,
  },
  {
    method: 'POST',
    path: '/staff/billing/costs/:id/stop',
    params: costIdParamsSchema,
    body: stopCostRequestSchema,
  },
  { method: 'DELETE', path: '/staff/billing/costs/:id', params: costIdParamsSchema },
  // How the signed-in person who books vehicles in is reminded: email each morning, or only in the portal.
  { method: 'GET', path: '/staff/maintenance/my-reminders', params: noParams },
  {
    method: 'PUT',
    path: '/staff/maintenance/my-reminders',
    params: noParams,
    body: myRemindersSchema,
  },
  // Fleet maintenance: what a company tracks, and when each item is next due on each vehicle. Core decides who may.
  { method: 'GET', path: '/staff/maintenance/starter', params: noParams },
  {
    method: 'GET',
    path: '/staff/maintenance/companies/:companyId/items',
    params: maintenanceCompanyParamsSchema,
  },
  {
    method: 'POST',
    path: '/staff/maintenance/companies/:companyId/items',
    params: maintenanceCompanyParamsSchema,
    body: createItemTypeRequestSchema,
  },
  {
    method: 'PUT',
    path: '/staff/maintenance/items/:id',
    params: maintenanceItemParamsSchema,
    body: itemTypeBodySchema,
  },
  { method: 'DELETE', path: '/staff/maintenance/items/:id', params: maintenanceItemParamsSchema },
  {
    method: 'GET',
    path: '/staff/maintenance/companies/:companyId/overview',
    params: maintenanceCompanyParamsSchema,
  },
  {
    method: 'GET',
    path: '/staff/maintenance/vehicles/:vehicleId',
    params: maintenanceVehicleParamsSchema,
  },
  {
    method: 'PUT',
    path: '/staff/maintenance/vehicles/:vehicleId/items/:itemId/due',
    params: maintenanceVehicleItemParamsSchema,
    body: setDueRequestSchema,
  },
  {
    method: 'POST',
    path: '/staff/maintenance/vehicles/:vehicleId/items/:itemId/done',
    params: maintenanceVehicleItemParamsSchema,
    body: markDoneRequestSchema,
  },
  {
    method: 'POST',
    path: '/staff/maintenance/companies/:companyId/import',
    params: maintenanceCompanyParamsSchema,
    body: importDatesRequestSchema,
  },
  // Repairs: a defect a driver found, booked for fixing, then done (which can mark the defect fixed).
  {
    method: 'POST',
    path: '/staff/maintenance/repairs',
    params: noParams,
    body: bookRepairRequestSchema,
  },
  {
    method: 'GET',
    path: '/staff/maintenance/companies/:companyId/repairs',
    params: maintenanceCompanyParamsSchema,
    query: repairsQuerySchema,
  },
  {
    method: 'POST',
    path: '/staff/maintenance/repairs/:id/done',
    params: repairParamsSchema,
    body: completeRepairRequestSchema,
  },
  { method: 'DELETE', path: '/staff/maintenance/repairs/:id', params: repairParamsSchema },
  // Invoices: draft the month's, adjust a draft, issue, mark paid or void. WagonWise admins only; core decides.
  { method: 'GET', path: '/staff/billing/invoices', params: noParams },
  {
    method: 'POST',
    path: '/staff/billing/invoices/generate',
    params: noParams,
    body: generateInvoicesRequestSchema,
  },
  { method: 'GET', path: '/staff/billing/invoices/:id', params: invoiceIdParamsSchema },
  { method: 'DELETE', path: '/staff/billing/invoices/:id', params: invoiceIdParamsSchema },
  {
    method: 'POST',
    path: '/staff/billing/invoices/:id/lines',
    params: invoiceIdParamsSchema,
    body: addInvoiceLineRequestSchema,
  },
  {
    method: 'DELETE',
    path: '/staff/billing/invoices/:id/lines/:lineId',
    params: invoiceLineParamsSchema,
  },
  { method: 'POST', path: '/staff/billing/invoices/:id/issue', params: invoiceIdParamsSchema },
  { method: 'POST', path: '/staff/billing/invoices/:id/paid', params: invoiceIdParamsSchema },
  { method: 'POST', path: '/staff/billing/invoices/:id/void', params: invoiceIdParamsSchema },
  { method: 'GET', path: '/staff/invite-codes', params: noParams },
  { method: 'POST', path: '/staff/invite-codes', params: noParams },
  { method: 'GET', path: '/staff/hazard-reports', params: noParams },
  // Moderation (P2-M7.1): the queue, a decision, and a report's audit trail.
  { method: 'GET', path: '/staff/hazard-reports/moderation-queue', params: noParams },
  {
    method: 'POST',
    path: '/staff/hazard-reports/:id/moderate',
    params: hazardReportIdParamsSchema,
    body: moderateHazardRequestSchema,
  },
  {
    method: 'GET',
    path: '/staff/hazard-reports/:id/decisions',
    params: hazardReportIdParamsSchema,
  },
  { method: 'DELETE', path: '/staff/hazard-reports/:id', params: hazardReportIdParamsSchema },
  // A company's own vehicles, for "Manage fleet" (or any company, for WagonWise admins).
  {
    method: 'GET',
    path: '/staff/fleet/companies/:companyId/vehicles',
    params: fleetCompanyIdParamsSchema,
  },
  {
    method: 'POST',
    path: '/staff/fleet/companies/:companyId/vehicles',
    params: fleetCompanyIdParamsSchema,
    body: createFleetVehicleRequestSchema,
  },
  {
    method: 'PUT',
    path: '/staff/fleet/vehicles/:id',
    params: fleetVehicleIdParamsSchema,
    body: updateFleetVehicleRequestSchema,
  },
  { method: 'DELETE', path: '/staff/fleet/vehicles/:id', params: fleetVehicleIdParamsSchema },
  // Driver links and the company code (P2-M2.6): a company's own roster, for "Manage fleet".
  {
    method: 'GET',
    path: '/staff/fleet/companies/:companyId/driver-links',
    params: fleetCompanyIdParamsSchema,
  },
  {
    method: 'POST',
    path: '/staff/fleet/companies/:companyId/driver-links',
    params: fleetCompanyIdParamsSchema,
    body: inviteDriverRequestSchema,
  },
  {
    method: 'POST',
    path: '/staff/fleet/driver-links/:id/approve',
    params: driverLinkIdParamsSchema,
  },
  {
    method: 'POST',
    path: '/staff/fleet/driver-links/:id/decline',
    params: driverLinkIdParamsSchema,
  },
  {
    method: 'POST',
    path: '/staff/fleet/driver-links/:id/remove',
    params: driverLinkIdParamsSchema,
  },
  {
    method: 'GET',
    path: '/staff/fleet/companies/:companyId/code',
    params: fleetCompanyIdParamsSchema,
  },
  {
    method: 'POST',
    path: '/staff/fleet/companies/:companyId/code/regenerate',
    params: fleetCompanyIdParamsSchema,
  },
  // Jobs core (P2-M3) surfaced in the portal (P2-M4): list/create for a company, assign/cancel
  // for one job. Status advance/fail stay driver-app territory (M5).
  {
    method: 'GET',
    path: '/staff/jobs/companies/:companyId/jobs',
    params: jobCompanyIdParamsSchema,
  },
  {
    method: 'POST',
    path: '/staff/jobs/companies/:companyId/jobs',
    params: jobCompanyIdParamsSchema,
    body: createJobRequestSchema,
  },
  // Saved places (a farm's real gate, marked once): a company's staff see them; dispatchers edit.
  {
    method: 'GET',
    path: '/staff/places/companies/:companyId/places',
    params: placesCompanyParamsSchema,
  },
  {
    method: 'POST',
    path: '/staff/places/companies/:companyId/places',
    params: placesCompanyParamsSchema,
    body: markPlaceRequestSchema,
  },
  {
    method: 'PUT',
    path: '/staff/places/:id',
    params: placeIdParamsSchema,
    body: updatePlaceRequestSchema,
  },
  { method: 'DELETE', path: '/staff/places/:id', params: placeIdParamsSchema },
  // Met Office weather warnings for the banner and the live map; the same for every company.
  { method: 'GET', path: '/staff/weather/warnings', params: noParams },
  // P2-M8: the jobs report (needs `view_reports`, which core checks).
  {
    method: 'POST',
    path: '/staff/jobs/companies/:companyId/report',
    params: jobCompanyIdParamsSchema,
    body: jobReportRequestSchema,
  },
  {
    method: 'GET',
    path: '/staff/jobs/companies/:companyId/positions',
    params: jobCompanyIdParamsSchema,
  },
  {
    method: 'GET',
    path: '/staff/jobs/companies/:companyId/etas',
    params: jobCompanyIdParamsSchema,
  },
  { method: 'GET', path: '/staff/jobs/:id', params: jobIdParamsSchema },
  {
    method: 'POST',
    path: '/staff/jobs/:id/route-preview',
    params: jobIdParamsSchema,
    body: previewJobRouteRequestSchema,
  },
  {
    method: 'GET',
    path: '/staff/jobs/:id/proof-of-delivery',
    params: jobIdParamsSchema,
    query: proofOfDeliveryQuerySchema,
  },
  {
    method: 'POST',
    path: '/staff/jobs/:id/assign',
    params: jobIdParamsSchema,
    body: assignJobRequestSchema,
  },
  { method: 'POST', path: '/staff/jobs/:id/cancel', params: jobIdParamsSchema },
];

function corePath(pattern: string, params: Record<string, string>): string {
  return pattern.replace(/:(\w+)/g, (_, name: string) => encodeURIComponent(params[name] ?? ''));
}

function queryString(query: Record<string, unknown>): string {
  const parts = Object.entries(query)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  return parts.length === 0 ? '' : `?${parts.join('&')}`;
}

/**
 * Same shape as `staff-routes.ts`: a valid staff token (401 without one), the contract's shape
 * checks (400, core never called), then core's answer relayed unchanged. Who may see or change
 * what is core's decision, not this BFF's (AGENTS.md rule 10).
 */
export function registerDashboardRoutes(app: FastifyInstance, deps: StaffRouteDeps): void {
  for (const forward of FORWARDS) {
    app.route({
      method: forward.method,
      url: forward.path,
      handler: async (request, reply) => {
        const token = await authenticateOrReject(request, reply, deps.staffTokenVerifier);
        if (token === undefined) return reply;
        const params = forward.params.safeParse(request.params ?? {});
        const body = forward.body?.safeParse(request.body);
        const query = forward.query?.safeParse(request.query ?? {});
        if (
          !params.success ||
          (body !== undefined && !body.success) ||
          (query !== undefined && !query.success)
        ) {
          return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
        }
        const core = await deps.coreClient.request(
          forward.method,
          corePath(forward.path, params.data) + (query?.success ? queryString(query.data) : ''),
          request.id,
          {
            authorization: `Bearer ${token}`,
            ...(body === undefined ? {} : { body: body.data }),
          },
        );
        return reply.status(core.status).send(core.body);
      },
    });
  }
}
