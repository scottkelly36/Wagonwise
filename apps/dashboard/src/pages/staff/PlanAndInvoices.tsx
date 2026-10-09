import type { InvoiceDto } from '@wagonwise/contracts/billing';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import * as billingApi from '../../api/billing';
import { DataTable, type Column } from '../../components/DataTable';
import { invoiceHtml, monthLabel } from '../../lib/invoice-print';
import { formatPence } from '../../lib/money';
import { useStaffAuthStore } from '../../state/staff-auth-store';
import { staffErrorMessage } from './messages';

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

      {plan.isError && <p style={{ color: 'var(--danger)' }}>{staffErrorMessage(plan.error)}</p>}
      {p !== undefined && (
        <section
          style={{
            padding: 16,
            border: '1px solid var(--border)',
            borderRadius: 8,
            marginBottom: 24,
          }}
        >
          <h2 style={{ marginTop: 0 }}>Your plan</h2>
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
      {printError !== undefined && <p style={{ color: 'var(--danger)' }}>{printError}</p>}
      {invoices.isError && (
        <p style={{ color: 'var(--danger)' }}>{staffErrorMessage(invoices.error)}</p>
      )}
      {invoices.isPending ? (
        <p>Loading…</p>
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
