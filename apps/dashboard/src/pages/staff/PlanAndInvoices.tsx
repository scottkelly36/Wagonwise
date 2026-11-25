import { ErrorNotice } from '../../components/ErrorNotice';
import { Loading } from '../../components/Loading';
import type { InvoiceDto } from '@wagonwise/contracts/billing';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import * as billingApi from '../../api/billing';
import * as companiesApi from '../../api/companies';
import * as paymentsApi from '../../api/payments';
import { DataTable, type Column } from '../../components/DataTable';
import { PaymentDetails } from '../../components/PaymentDetails';
import { accountStanding, amountDue, trialPlanText } from '../../lib/account-banner';
import { invoiceHtml, monthLabel } from '../../lib/invoice-print';
import { formatPence, ukToday } from '../../lib/money';
import { vehicleLimitText } from '../../lib/vehicle-limit';
import { useStaffAuthStore } from '../../state/staff-auth-store';

const STATUS_TEXT: Record<InvoiceDto['status'], string> = {
  draft: 'Draft',
  issued: 'Due',
  paid: 'Paid',
  void: 'Cancelled',
};

const formatDay = (day: string) => new Date(`${day}T00:00:00`).toLocaleDateString('en-GB');

/**
 * The company's own plan and invoices, for the people it has trusted with billing (`manage_billing`). The plan
 * is what WagonWise bills by: each vehicle used in a month, up to the vehicles the plan covers. Invoices are the issued ones;
 * Print opens a page the browser saves as a PDF.
 */
export function PlanAndInvoices() {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const [printError, setPrintError] = useState<string | undefined>(undefined);

  const plan = useQuery({
    queryKey: ['own-plan'],
    queryFn: () => withAccessToken((token) => billingApi.getOwnPlan(token)),
  });
  const invoices = useQuery({
    queryKey: ['own-invoices'],
    queryFn: () => withAccessToken((token) => billingApi.listOwnInvoices(token)),
  });
  // The same query as the banner above every page, so it costs no extra request.
  const account = useQuery({
    queryKey: ['own-account-state'],
    queryFn: () => withAccessToken((token) => companiesApi.getOwnAccountState(token)),
    retry: false,
  });
  const standing =
    account.data === undefined ? undefined : accountStanding(account.data, ukToday());
  const due = amountDue(invoices.data ?? []);
  // The same query as the Payment details box below: whether details are on file decides whether there is a vehicle limit.
  const payment = useQuery({
    queryKey: ['payment-status'],
    queryFn: () => withAccessToken((token) => paymentsApi.getPaymentStatus(token)),
    retry: false,
  });
  const limit =
    plan.data === undefined || payment.data === undefined
      ? undefined
      : vehicleLimitText({
          capacityToday: plan.data.capacityToday,
          vehiclesInUse: plan.data.vehiclesInUse,
          detailsOnFile: payment.data.detailsOnFile,
          paymentsAvailable: payment.data.available,
        });
  const trialText =
    account.data === undefined || plan.data === undefined
      ? undefined
      : trialPlanText(account.data, plan.data);

  function print(invoice: InvoiceDto): void {
    setPrintError(undefined);
    const tab = window.open('', '_blank');
    if (tab === null) {
      setPrintError('Allow pop-ups for this site to open the invoice.');
      return;
    }
    tab.document.open();
    tab.document.write(invoiceHtml(invoice));
    tab.document.close();
    tab.focus();
    setTimeout(() => tab.print(), 300);
  }

  const columns: Column<InvoiceDto>[] = [
    {
      key: 'number',
      header: 'Number',
      sortValue: (i) => i.number ?? '',
      cell: (i) => i.number ?? '',
    },
    { key: 'month', header: 'For', sortValue: (i) => i.month, cell: (i) => monthLabel(i.month) },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      sortValue: (i) => i.totalPence,
      cell: (i) => formatPence(i.totalPence),
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (i) => i.status,
      cell: (i) => STATUS_TEXT[i.status],
    },
    {
      key: 'print',
      header: '',
      align: 'right',
      cell: (i) => (
        <button type="button" onClick={() => print(i)}>
          Print or save as PDF
        </button>
      ),
    },
  ];

  const p = plan.data;
  return (
    <div>
      <h1>Plan and invoices</h1>

      {standing !== undefined && (
        <section className="mb-24 box" aria-label="Your account">
          <h2 className="mt-0">Your account</h2>
          <p style={{ fontSize: 18, margin: '4px 0' }}>
            <strong>{standing.headline}</strong>
          </p>
          {standing.detail !== undefined && <p style={{ margin: '4px 0' }}>{standing.detail}</p>}
          {!invoices.isPending && !invoices.isError && (
            <p style={{ margin: '4px 0' }}>
              {due.count === 0
                ? 'Nothing is due.'
                : `Due now: ${formatPence(due.pence)} across ${due.count} invoice${due.count === 1 ? '' : 's'}.`}
            </p>
          )}
        </section>
      )}

      <PaymentDetails />

      {plan.isError && <ErrorNotice error={plan.error} />}
      {p !== undefined && (
        <section className="mb-24 box">
          <h2 className="mt-0">Your plan</h2>
          {trialText === undefined ? (
            <>
              <p style={{ fontSize: 18, margin: '4px 0' }}>
                <strong>{formatPence(p.pricePerVehiclePence)}</strong> a month for each vehicle you
                use.
              </p>
              <p style={{ margin: '4px 0', color: 'var(--text-muted)' }}>
                A vehicle counts for a month if it was given a job or had a walk-round check in it.
                One that sits idle costs nothing, and a vehicle first used in the last week of a
                month is not billed until the next month. You are billed once the month is over.
              </p>
            </>
          ) : (
            <>
              <p style={{ fontSize: 18, margin: '4px 0' }}>
                <strong>{trialText.headline}</strong>
              </p>
              <p style={{ margin: '4px 0' }}>{trialText.afterwards}</p>
            </>
          )}
          {limit !== undefined && limit.limited && (
            <p style={{ margin: '4px 0' }}>
              Until you add payment details your plan lets you set up to{' '}
              <strong>{p.capacityToday}</strong> vehicle{p.capacityToday === 1 ? '' : 's'}, so at
              most <strong>{formatPence(p.monthlyPence)} a month</strong>.
            </p>
          )}
          {limit !== undefined && <p style={{ margin: '4px 0' }}>{limit.text}</p>}
          {p.next !== undefined && (
            <p style={{ margin: '4px 0', color: 'var(--text-muted)' }}>
              From {formatDay(p.next.effectiveFrom)} your plan covers {p.next.capacity} vehicle
              {p.next.capacity === 1 ? '' : 's'}.
            </p>
          )}
        </section>
      )}

      <h2>Invoices</h2>
      {printError !== undefined && <p className="text-danger">{printError}</p>}
      {invoices.isError && <ErrorNotice error={invoices.error} />}
      {invoices.isPending ? (
        <Loading />
      ) : (
        <DataTable
          columns={columns}
          rows={invoices.data ?? []}
          rowKey={(i) => i.id}
          emptyText="No invoices yet."
        />
      )}
    </div>
  );
}
