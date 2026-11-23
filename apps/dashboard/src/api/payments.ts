import {
  collectInvoiceResponseSchema,
  companyPaymentsSchema,
  paymentStatusSchema,
  startPaymentSetupResponseSchema,
  type CollectInvoiceResponse,
  type CompanyPaymentsDto,
  type PaymentStatusDto,
  type StartPaymentSetupResponse,
} from '@wagonwise/contracts/payments';

import { requestJson, throwUnlessSuccess } from './http';

/** A company's billing person: can payment details be added here, and are they on file? */
export async function getPaymentStatus(accessToken: string): Promise<PaymentStatusDto> {
  const { status, json } = await requestJson('GET', '/staff/payments/status', {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return paymentStatusSchema.parse(json);
}

/** Where to send the person to add payment details on the provider's own page. Nothing is charged. */
export async function startPaymentSetup(accessToken: string): Promise<StartPaymentSetupResponse> {
  const { status, json } = await requestJson('POST', '/staff/payments/setup', {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return startPaymentSetupResponseSchema.parse(json);
}

/** WagonWise staff: ask the provider to collect an issued invoice from the company's payment method. */
export async function collectInvoice(
  accessToken: string,
  invoiceId: string,
): Promise<CollectInvoiceResponse> {
  const { status, json } = await requestJson('POST', '/staff/payments/collect', {
    authorization: `Bearer ${accessToken}`,
    body: { invoiceId },
  });
  throwUnlessSuccess(status, json, [200]);
  return collectInvoiceResponseSchema.parse(json);
}

/** WagonWise staff: a company's payment details and the latest attempts to collect from it. */
export async function getCompanyPayments(
  accessToken: string,
  companyId: string,
): Promise<CompanyPaymentsDto> {
  const { status, json } = await requestJson('GET', `/staff/companies/${companyId}/payments`, {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return companyPaymentsSchema.parse(json);
}
