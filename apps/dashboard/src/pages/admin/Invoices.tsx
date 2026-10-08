import type { InvoiceDto } from '@wagonwise/contracts/billing';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import * as billingApi from '../../api/billing';
import { DataTable, type Column } from '../../components/DataTable';
import { invoiceHtml, monthLabel } from '../../lib/invoice-print';
import { formatPence, parsePounds, ukToday } from '../../lib/money';
import { useStaffAuthStore } from '../../state/staff-auth-store';
import { staffErrorMessage } from '../staff/messages';

const KEY = ['billing-invoices'] as const;

const STATUS_TEXT: Record<InvoiceDto['status'], string> = {
  draft: 'Draft',
  issued: 'Issued, unpaid',
  paid: 'Paid',
  void: 'Cancelled',
};

/** The last full month, as `YYYY-MM`: the one you normally invoice. */
function lastMonth(): string {
  const [year, month] = ukToday().split('-').map(Number) as [number, number];
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
}

/**
 * Invoices. Draft the month's for every company from its plan, check each, add a credit or a one-off charge if
 * needed, then issue it: that gives it its number and freezes it. Print opens a page the browser saves as a PDF.
 * Marking paid is by hand. Issuing is refused while the billing details still hold [placeholders].
 */
export function Invoices() {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(lastMonth());
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [notice, setNotice] = useState<string | undefined>(undefined);

  const invoices = useQuery({
    queryKey: KEY,
    queryFn: () => withAccessToken((token) => billingApi.listInvoices(token)),
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: KEY });

  const generate = useMutation({
    mutationFn: () => withAccessToken((token) => billingApi.generateInvoices(token, { month })),
    onSuccess: (result) => {
      refresh();
      const already = result.skipped.filter((s) => s.reason === 'already_invoiced').length;
      const nothing = result.skipped.filter((s) => s.reason === 'nothing_to_bill').length;
      setNotice(
        `${result.created.length} draft${result.created.length === 1 ? '' : 's'} made for ${monthLabel(month)}. ` +
          `${already} already invoiced, ${nothing} with nothing to bill.`,
      );
    },
  });

  const columns: Column<InvoiceDto>[] = [
    {
      key: 'number',
      header: 'Number',
      sortValue: (i) => i.number ?? '',
      cell: (i) => i.number ?? 'Draft',
    },
    {
      key: 'company',
      header: 'Company',
      sortValue: (i) => i.companyName,
      cell: (i) => i.companyName,
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
      key: 'open',
      header: '',
      align: 'right',
      cell: (i) => (
        <button type="button" onClick={() => setSelectedId(i.id)}>
          Open
        </button>
      ),
    },
  ];

  const selected = invoices.data?.find((i) => i.id === selectedId);

  return (
    <div>
      <h1>Invoices</h1>
      <p style={{ color: '#6b7280' }}>
        Each invoice bills a company for the vehicles its plan covers. Draft the month&apos;s, check
        each one, then issue it. Issued invoices are numbered and can&apos;t be edited; cancel one
        to correct it.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setNotice(undefined);
          generate.mutate();
        }}
        style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 16 }}
      >
        <label>
          <span style={{ display: 'block' }}>Month</span>
          <input
            type="month"
            value={month}
            max={ukToday().slice(0, 7)}
            onChange={(e) => setMonth(e.target.value)}
          />
        </label>
        <button type="submit" disabled={month === '' || generate.isPending}>
          {generate.isPending ? 'Drafting…' : 'Draft invoices for this month'}
        </button>
      </form>
      {notice !== undefined && <p style={{ color: '#15803d' }}>{notice}</p>}
      {generate.isError && <p style={{ color: '#dc2626' }}>{staffErrorMessage(generate.error)}</p>}
      {invoices.isError && <p style={{ color: '#dc2626' }}>{staffErrorMessage(invoices.error)}</p>}

      {invoices.isPending ? (
        <p>Loading…</p>
      ) : (
        <DataTable
          columns={columns}
          rows={invoices.data ?? []}
          rowKey={(i) => i.id}
          searchText={(i) => `${i.number ?? ''} ${i.companyName}`}
          emptyText="No invoices yet. Draft the first month above."
        />
      )}

      {selected !== undefined && (
        <InvoicePanel
          key={`${selected.id}-${selected.status}`}
          invoice={selected}
          onChanged={refresh}
          onClose={() => setSelectedId(undefined)}
        />
      )}
    </div>
  );
}

function InvoicePanel({
  invoice,
  onChanged,
  onClose,
}: {
  invoice: InvoiceDto;
  onChanged: () => void;
  onClose: () => void;
}) {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [isCredit, setIsCredit] = useState(true);
  const [printError, setPrintError] = useState<string | undefined>(undefined);

  const pence = parsePounds(amount);
  const isDraft = invoice.status === 'draft';
  const useAction = <T,>(fn: (token: string) => Promise<T>) =>
    useMutation({ mutationFn: () => withAccessToken(fn), onSuccess: onChanged });

  const addLine = useMutation({
    mutationFn: () =>
      withAccessToken((token) =>
        billingApi.addInvoiceLine(token, invoice.id, {
          description,
          amountPence: (isCredit ? -1 : 1) * (pence as number),
        }),
      ),
    onSuccess: () => {
      setDescription('');
      setAmount('');
      onChanged();
    },
  });
  const removeLine = useMutation({
    mutationFn: (lineId: string) =>
      withAccessToken((token) => billingApi.removeInvoiceLine(token, invoice.id, lineId)),
    onSuccess: onChanged,
  });
  const issue = useAction((token) => billingApi.issueInvoice(token, invoice.id));
  const paid = useAction((token) => billingApi.markInvoicePaid(token, invoice.id));
  const cancel = useAction((token) => billingApi.voidInvoice(token, invoice.id));
  const discard = useMutation({
    mutationFn: () => withAccessToken((token) => billingApi.deleteDraftInvoice(token, invoice.id)),
    onSuccess: () => {
      onChanged();
      onClose();
    },
  });

  const error = [addLine, removeLine, issue, paid, cancel, discard].find((m) => m.isError)?.error;

  /** Opens the invoice in a new tab and offers it for printing or saving as a PDF. */
  function print(): void {
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

  return (
    <section style={{ marginTop: 24, padding: 16, border: '1px solid #e5e7eb', borderRadius: 8 }}>
      <h2 style={{ marginTop: 0 }}>
        {invoice.number ?? 'Draft'}: {invoice.companyName}, {monthLabel(invoice.month)}
      </h2>
      <p style={{ color: '#6b7280' }}>{STATUS_TEXT[invoice.status]}</p>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {invoice.lines.map((line) => (
            <tr key={line.id}>
              <td style={{ padding: '6px 0' }}>{line.description}</td>
              <td style={{ textAlign: 'right' }}>{formatPence(line.amountPence)}</td>
              {isDraft && (
                <td style={{ textAlign: 'right', width: 90 }}>
                  <button
                    type="button"
                    onClick={() => removeLine.mutate(line.id)}
                    disabled={removeLine.isPending}
                  >
                    Remove
                  </button>
                </td>
              )}
            </tr>
          ))}
          <tr>
            <td style={{ padding: '8px 0', fontWeight: 700 }}>Total</td>
            <td style={{ textAlign: 'right', fontWeight: 700 }}>
              {formatPence(invoice.totalPence)}
            </td>
            {isDraft && <td />}
          </tr>
        </tbody>
      </table>

      {isDraft && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (pence !== undefined && description.trim() !== '') addLine.mutate();
          }}
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'flex-end',
            flexWrap: 'wrap',
            marginTop: 16,
          }}
        >
          <label>
            <span style={{ display: 'block' }}>Add a line</span>
            <input
              value={description}
              placeholder="Description"
              onChange={(e) => setDescription(e.target.value)}
              style={{ width: 260 }}
            />
          </label>
          <label>
            <span style={{ display: 'block' }}>Amount (£)</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={{ width: 90 }}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={isCredit}
              onChange={(e) => setIsCredit(e.target.checked)}
            />{' '}
            Credit (takes off)
          </label>
          <button
            type="submit"
            disabled={pence === undefined || description.trim() === '' || addLine.isPending}
          >
            Add
          </button>
        </form>
      )}

      {error !== undefined && <p style={{ color: '#dc2626' }}>{staffErrorMessage(error)}</p>}
      {printError !== undefined && <p style={{ color: '#dc2626' }}>{printError}</p>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
        <button type="button" onClick={print}>
          Print or save as PDF
        </button>
        {isDraft && (
          <>
            <button type="button" onClick={() => issue.mutate()} disabled={issue.isPending}>
              {issue.isPending ? 'Issuing…' : 'Issue invoice'}
            </button>
            <button type="button" onClick={() => discard.mutate()} disabled={discard.isPending}>
              Delete draft
            </button>
          </>
        )}
        {invoice.status === 'issued' && (
          <>
            <button type="button" onClick={() => paid.mutate()} disabled={paid.isPending}>
              Mark as paid
            </button>
            <button
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    'Cancel this invoice? It keeps its number, and the month can be invoiced again.',
                  )
                ) {
                  cancel.mutate();
                }
              }}
              disabled={cancel.isPending}
            >
              Cancel invoice
            </button>
          </>
        )}
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </section>
  );
}
