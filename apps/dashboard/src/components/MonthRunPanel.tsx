import type { InvoiceDto } from '@wagonwise/contracts/billing';
import { useState } from 'react';
import * as billingApi from '../api/billing';
import * as paymentsApi from '../api/payments';
import {
  executeMonthRun,
  planMonthRun,
  runStatusText,
  type RunPlan,
  type RunResult,
} from '../lib/month-run';
import { monthLabel } from '../lib/invoice-print';
import { formatPence } from '../lib/money';
import { staffErrorMessage } from '../pages/staff/messages';
import { useStaffAuthStore } from '../state/staff-auth-store';

/**
 * "Issue and collect all" for a month: issues every draft for the month and asks for payment from the firms that have payment details on
 * file, in one go. It first shows what it will do (who is charged, who is only issued, what is left), and nothing happens until it is
 * confirmed. A firm that fails does not stop the rest; WagonWise's own billing details still holding [brackets] stops the run with
 * nothing issued. Money is only asked for; whether it was paid arrives later from the payment provider.
 */
export function MonthRunPanel(props: {
  readonly month: string;
  readonly invoices: readonly InvoiceDto[];
  readonly onDone: () => void;
}) {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const drafts = props.invoices.filter((i) => i.month === props.month && i.status === 'draft');
  const [plan, setPlan] = useState<RunPlan | undefined>(undefined);
  const [busy, setBusy] = useState<'planning' | 'running' | undefined>(undefined);
  const [results, setResults] = useState<RunResult[] | undefined>(undefined);
  const [stoppedBy, setStoppedBy] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  if (drafts.length === 0 && results === undefined) return null;

  async function prepare(): Promise<void> {
    setError(undefined);
    setResults(undefined);
    setStoppedBy(undefined);
    setBusy('planning');
    try {
      const companyIds = [...new Set(drafts.map((d) => d.companyId))];
      const found = await Promise.all(
        companyIds.map(async (id) => {
          const status = await withAccessToken((t) => paymentsApi.getCompanyPayments(t, id));
          return [id, status.available && status.detailsOnFile] as const;
        }),
      );
      setPlan(
        planMonthRun(
          drafts.map((d) => ({
            id: d.id,
            companyId: d.companyId,
            companyName: d.companyName,
            totalPence: d.totalPence,
          })),
          new Map(found),
        ),
      );
    } catch (err) {
      setError(staffErrorMessage(err));
    } finally {
      setBusy(undefined);
    }
  }

  async function run(): Promise<void> {
    if (plan === undefined) return;
    setError(undefined);
    setBusy('running');
    try {
      const done = await executeMonthRun(plan, {
        issue: async (id) => {
          await withAccessToken((t) => billingApi.issueInvoice(t, id));
        },
        collect: async (id) => {
          await withAccessToken((t) => paymentsApi.collectInvoice(t, id));
        },
        describe: staffErrorMessage,
      });
      setResults(done.results);
      setStoppedBy(done.stoppedBy);
      setPlan(undefined);
      props.onDone();
    } catch (err) {
      setError(staffErrorMessage(err));
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <section className="box mb-16" aria-label="Issue and collect all">
      <h2 className="mt-0">Issue and collect all</h2>
      {drafts.length > 0 && plan === undefined && (
        <>
          <p style={{ margin: '4px 0' }}>
            {drafts.length} draft{drafts.length === 1 ? '' : 's'} for {monthLabel(props.month)}.
            Check each one first (open it from the list), then issue them all and charge the firms
            that have payment details on file.
          </p>
          <button
            type="button"
            className="btn-primary"
            disabled={busy !== undefined}
            onClick={() => void prepare()}
          >
            {busy === 'planning' ? 'Checking…' : 'Issue and collect all…'}
          </button>
        </>
      )}
      {plan !== undefined && (
        <>
          <p style={{ margin: '4px 0' }}>
            This will issue{' '}
            <strong>
              {plan.issueAndCollect.length + plan.issueOnly.length} invoice
              {plan.issueAndCollect.length + plan.issueOnly.length === 1 ? '' : 's'} totalling{' '}
              {formatPence(plan.totalPence)}
            </strong>
            . Issued invoices are numbered and cannot be edited.
          </p>
          {plan.issueAndCollect.length > 0 && (
            <>
              <p style={{ margin: '8px 0 2px' }}>
                <strong>Charged now</strong> (payment details on file):
              </p>
              <ul style={{ margin: 0 }}>
                {plan.issueAndCollect.map((d) => (
                  <li key={d.id}>
                    {d.companyName}: {formatPence(d.totalPence)}
                  </li>
                ))}
              </ul>
            </>
          )}
          {plan.issueOnly.length > 0 && (
            <>
              <p style={{ margin: '8px 0 2px' }}>
                <strong>Issued only</strong> (they pay another way):
              </p>
              <ul style={{ margin: 0 }}>
                {plan.issueOnly.map((i) => (
                  <li key={i.draft.id}>
                    {i.draft.companyName}: {formatPence(i.draft.totalPence)} (
                    {i.reason === 'no_card'
                      ? 'no payment details on file'
                      : 'under the smallest card payment, 30p'}
                    )
                  </li>
                ))}
              </ul>
            </>
          )}
          {plan.leave.length > 0 && (
            <p style={{ margin: '8px 0 2px' }} className="text-muted">
              Left as drafts (nothing to charge): {plan.leave.map((d) => d.companyName).join(', ')}.
            </p>
          )}
          <div className="flex gap-8 mt-16">
            <button
              type="button"
              className="btn-primary"
              disabled={busy !== undefined}
              onClick={() => void run()}
            >
              {busy === 'running' ? 'Working…' : 'Issue and collect'}
            </button>
            <button type="button" disabled={busy !== undefined} onClick={() => setPlan(undefined)}>
              Cancel
            </button>
          </div>
        </>
      )}
      {error !== undefined && <p className="text-danger">{error}</p>}
      {stoppedBy !== undefined && (
        <p className="text-danger" role="alert">
          Stopped before issuing anything: {stoppedBy}
        </p>
      )}
      {results !== undefined && results.length > 0 && (
        <>
          <p style={{ margin: '8px 0 2px' }}>
            <strong>Done.</strong> Whether each payment went through arrives from the payment
            provider in a few minutes (a Direct Debit takes days).
          </p>
          <ul style={{ margin: 0 }}>
            {results.map((r, i) => (
              <li key={`${r.company}-${i}`}>
                {r.company}: {formatPence(r.totalPence)}, {runStatusText(r.status)}
                {r.note === undefined ? '' : ` (${r.note})`}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
