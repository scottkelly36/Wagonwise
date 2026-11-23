import { ErrorNotice } from '../../components/ErrorNotice';
import { Loading } from '../../components/Loading';
import type { InvoiceDto } from '@wagonwise/contracts/billing';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import * as billingApi from '../../api/billing';
import * as companiesApi from '../../api/companies';
import { DataTable, type Column } from '../../components/DataTable';
import { PaymentDetails } from '../../components/PaymentDetails';
import { accountStanding, amountDue } from '../../lib/account-banner';
import { invoiceHtml, monthLabel } from '../../lib/invoice-print';
import { formatPence, ukToday } from '../../lib/money';
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
 * is what WagonWise bills: the vehicles it covers, whether or not all are set up. Invoices are the issued ones;
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
          <p style={{ fontSize: 18, margin: '4px 0' }}>
            Covers <strong>{p.capacityToday}</strong> vehicle{p.capacityToday === 1 ? '' : 's'} at{' '}
            {formatPence(p.pricePerVehiclePence)} each:{' '}
            <strong>{formatPence(p.monthlyPence)} a month</strong>.
          </p>
          <p style={{ margin: '4px 0' }}>
            You have {p.vehiclesInUse} vehicle{p.vehiclesInUse === 1 ? '' : 's'} set up
            {p.capacityToday > p.vehiclesInUse
              ? `, so you can add ${p.capacityToday - p.vehiclesInUse} more.`
              : p.vehiclesInUse > p.capacityToday
                ? ', more than the plan covers. You can’t add any more until it is raised.'
                : ', all that the plan covers. To add another, ask WagonWise to raise your plan.'}
          </p>
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
