import {
  billingDetailsSchema,
  updateBillingDetailsRequestSchema,
  type BillingDetailsDto,
  type UpdateBillingDetailsRequest,
} from '@wagonwise/contracts/billing';

import { requestJson, throwUnlessSuccess } from './http';

/** WagonWise's own billing details, printed on invoices (WagonWise admins only; core checks). */
export async function getBillingDetails(accessToken: string): Promise<BillingDetailsDto> {
  const { status, json } = await requestJson('GET', '/staff/billing/details', {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return billingDetailsSchema.parse(json);
}

export async function updateBillingDetails(
  accessToken: string,
  input: UpdateBillingDetailsRequest,
): Promise<BillingDetailsDto> {
  const body = updateBillingDetailsRequestSchema.parse(input);
  const { status, json } = await requestJson('PUT', '/staff/billing/details', {
    body,
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return billingDetailsSchema.parse(json);
}
