import type { FEEDBACK_STATUSES, StaffFeedbackNoteDto } from '@wagonwise/contracts/feedback';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import * as feedbackApi from '../../api/feedback';
import { DataTable, type Column } from '../../components/DataTable';
import { feedbackSearchText, isResolved, sentFrom } from '../../lib/feedback';
import { useStaffAuthStore } from '../../state/staff-auth-store';
import { staffErrorMessage } from '../staff/messages';

const FEEDBACK_KEY = ['feedback'] as const;
type Status = (typeof FEEDBACK_STATUSES)[number];

/**
 * What drivers and testers sent through the app's feedback box, newest first, with who sent it, the phone and the app version.
 * Mark a note resolved once it has been dealt with (or answered), and reopen it if it comes back. WagonWise staff only.
 */
export function Feedback() {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>('open');

  const feedback = useQuery({
    queryKey: [...FEEDBACK_KEY, status],
    queryFn: () => withAccessToken((token) => feedbackApi.listFeedback(token, status)),
  });
  const resolve = useMutation({
    mutationFn: (input: { id: string; resolved: boolean }) =>
      withAccessToken((token) => feedbackApi.setFeedbackResolved(token, input.id, input.resolved)),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: FEEDBACK_KEY }),
  });

  const columns: Column<StaffFeedbackNoteDto>[] = [
    {
      key: 'at',
      header: 'Sent',
      sortValue: (n) => n.createdAt,
      cell: (n) => new Date(n.createdAt).toLocaleString('en-GB'),
    },
    {
      key: 'from',
      header: 'From',
      sortValue: (n) => n.from ?? '',
      cell: (n) => n.from ?? <span className="muted">Unknown</span>,
    },
    {
      key: 'message',
      header: 'Feedback',
      cell: (n) => (
        <div>
          <div style={{ whiteSpace: 'pre-wrap' }}>{n.message}</div>
          <div className="muted" style={{ fontSize: 12 }}>
            {sentFrom(n)}
          </div>
        </div>
      ),
    },
    {
      key: 'state',
      header: 'Status',
      sortValue: (n) => (isResolved(n) ? 1 : 0),
      cell: (n) =>
        n.resolvedAt === undefined
          ? 'Open'
          : `Resolved ${new Date(n.resolvedAt).toLocaleDateString('en-GB')}`,
    },
    {
      key: 'action',
      header: '',
      align: 'right',
      cell: (n) => (
        <button
          className={isResolved(n) ? 'btn-secondary' : 'btn-primary'}
          disabled={resolve.isPending}
          onClick={() => resolve.mutate({ id: n.id, resolved: !isResolved(n) })}
        >
          {isResolved(n) ? 'Reopen' : 'Mark resolved'}
        </button>
      ),
    },
  ];

  const error = feedback.error ?? resolve.error;
  const data = feedback.data;

  return (
    <div>
      <h1>Feedback</h1>
      <p className="muted">
        What drivers and testers sent from the Feedback box in the app. Mark a note resolved once
        you have dealt with it or replied; reopen it if it comes back.
      </p>

      {error !== null && <p style={{ color: 'var(--danger)' }}>{staffErrorMessage(error)}</p>}

      <div
        style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end', marginBottom: 16 }}
      >
        <div className="field">
          <label htmlFor="feedback-status">Show</label>
          <select
            id="feedback-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as Status)}
          >
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
            <option value="all">All</option>
          </select>
        </div>
        {data !== undefined && (
          <p style={{ margin: 0 }}>
            <strong>{data.counts.open}</strong> open, <strong>{data.counts.resolved}</strong>{' '}
            resolved.
          </p>
        )}
      </div>

      {data === undefined ? (
        <p>Loading…</p>
      ) : (
        <DataTable
          columns={columns}
          rows={data.notes}
          rowKey={(n) => n.id}
          searchText={feedbackSearchText}
          emptyText={
            status === 'open' ? 'Nothing waiting. All feedback is resolved.' : 'No feedback here.'
          }
        />
      )}
    </div>
  );
}
