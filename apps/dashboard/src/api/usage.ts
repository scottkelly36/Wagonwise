import {
  portalEventsRequestSchema,
  portalEventsResponseSchema,
  usageActivitySchema,
  usageDriversSchema,
  usageFirmsSchema,
  usageFlowsSchema,
  usageOverviewSchema,
  usagePortalSchema,
  usageSiteSchema,
  type PortalEventsRequest,
  type PortalEventsResponse,
  type UsageActivityDto,
  type UsageDriversDto,
  type UsageFirmsDto,
  type UsageFlowsDto,
  type UsageOverviewDto,
  type UsagePortalDto,
  type UsageSectionName,
  type UsageSiteDto,
} from '@wagonwise/contracts/usage';

import { requestJson, throwUnlessSuccess } from './http';

/** What each view of the usage page gets back. */
export interface UsageSections {
  readonly overview: UsageOverviewDto;
  readonly drivers: UsageDriversDto;
  readonly activity: UsageActivityDto;
  readonly firms: UsageFirmsDto;
  readonly flows: UsageFlowsDto;
  readonly site: UsageSiteDto;
  readonly portal: UsagePortalDto;
}

const SCHEMAS = {
  overview: usageOverviewSchema,
  drivers: usageDriversSchema,
  activity: usageActivitySchema,
  firms: usageFirmsSchema,
  flows: usageFlowsSchema,
  site: usageSiteSchema,
  portal: usagePortalSchema,
} as const;

/** One view of the usage page. Each is its own request, so a view only waits for its own figures. */
export async function getUsageSection<S extends UsageSectionName>(
  accessToken: string,
  section: S,
): Promise<UsageSections[S]> {
  const { status, json } = await requestJson('GET', `/staff/usage/${section}`, {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return SCHEMAS[section].parse(json) as UsageSections[S];
}

/** A batch of pages and form steps from this sitting in the portal (docs/company-account-states-scope.md, "Portal tracking"). */
export async function sendPortalEvents(
  accessToken: string,
  request: PortalEventsRequest,
  keepalive = false,
): Promise<PortalEventsResponse> {
  const body = portalEventsRequestSchema.parse(request);
  const { status, json } = await requestJson('POST', '/staff/usage/portal-events', {
    body,
    authorization: `Bearer ${accessToken}`,
    keepalive,
  });
  throwUnlessSuccess(status, json, [200]);
  return portalEventsResponseSchema.parse(json);
}
