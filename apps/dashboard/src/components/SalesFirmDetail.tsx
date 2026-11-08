import {
  CONTACT_HOWS,
  CONTACT_RESULTS,
  PITCHES,
  SALES_STAGES,
  type AddEntryRequest,
  type ContactHow,
  type ContactResult,
  type EntryDto,
  type Pitch,
  type ProspectDto,
  type SalesStage,
} from '@wagonwise/contracts/sales';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import * as salesApi from '../api/sales';
import {
  contactHint,
  formatDate,
  HOW_LABELS,
  localDateString,
  PITCH_LABELS,
  RESULT_LABELS,
  STAGE_LABELS,
} from '../lib/sales';
import { staffErrorMessage } from '../pages/staff/messages';
import { useStaffAuthStore } from '../state/staff-auth-store';
import { useConfirm, useNotify } from './feedback-context';
import { SalesFirmForm } from './SalesFirmForm';

/** A contact on a day other than today is stamped midday that day; today's is stamped now. */
function stamp(day: string): string | undefined {
  if (day === localDateString(new Date())) return undefined;
  const [y, m, d] = day.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined) return undefined;
  return new Date(y, m - 1, d, 12).toISOString();
}

/**
 * What is open under a firm: how to approach it, its details, a form to log a contact, the stage, and the log so far. Nothing
 * here sends anything: it records what the owner did.
 */
export function SalesFirmDetail({
  firm,
  entries,
  onDeleted,
}: {
  firm: ProspectDto;
  entries: readonly EntryDto[];
  onDeleted: () => void;
}) {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const queryClient = useQueryClient();
  const ask = useConfirm();
  const notify = useNotify();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['sales'] });
  const optedOut = firm.stage === 'do_not_contact';

  const [editing, setEditing] = useState(false);
  const [how, setHow] = useState<ContactHow>(firm.legalForm === 'limited' ? 'email' : 'phone');
  const [result, setResult] = useState<ContactResult>('sent');
  const [pitch, setPitch] = useState<Pitch | ''>('');
  const [day, setDay] = useState(localDateString(new Date()));
  const [note, setNote] = useState('');
  const [nextStep, setNextStep] = useState('');
  const [nextStepOn, setNextStepOn] = useState('');

  const log = useMutation({
    mutationFn: (body: AddEntryRequest) =>
      withAccessToken((token) => salesApi.addEntry(token, firm.id, body)),
    onSuccess: () => {
      refresh();
      notify('Contact logged');
      setNote('');
      setNextStep('');
      setNextStepOn('');
      setPitch('');
      setResult('sent');
    },
  });
  const setStage = useMutation({
    mutationFn: (stage: SalesStage) =>
      withAccessToken((token) => salesApi.updateProspect(token, firm.id, { stage })),
    onSuccess: refresh,
  });
  const removeEntry = useMutation({
    mutationFn: (id: string) => withAccessToken((token) => salesApi.deleteEntry(token, id)),
    onSuccess: refresh,
  });
  const removeFirm = useMutation({
    mutationFn: () => withAccessToken((token) => salesApi.deleteProspect(token, firm.id)),
    onSuccess: () => {
      refresh();
      onDeleted();
    },
  });

  const submit = () => {
    const at = stamp(day);
    const body: AddEntryRequest = {
      how,
      result,
      ...(pitch === '' ? {} : { pitch }),
      ...(note.trim() === '' ? {} : { note: note.trim() }),
      ...(at === undefined ? {} : { at }),
      // The next step is whatever is in the boxes; blank clears the old one.
      nextStep: nextStep.trim() === '' ? null : nextStep.trim(),
      nextStepOn: nextStepOn === '' ? null : nextStepOn,
    };
    if (result !== 'opted_out') {
      log.mutate(body);
      return;
    }
    void ask({
      message: `${firm.name} will be marked "Do not contact". It stays on the list so you never contact them by mistake, and it cannot be changed back.`,
      confirmLabel: 'Mark do not contact',
    }).then((ok) => {
      if (ok) log.mutate(body);
    });
  };

  const changeStage = (stage: SalesStage) => {
    if (stage !== 'do_not_contact') {
      setStage.mutate(stage);
      return;
    }
    void ask({
      message: `${firm.name} will be marked "Do not contact". It cannot be changed back.`,
      confirmLabel: 'Mark do not contact',
    }).then((ok) => {
      if (ok) setStage.mutate(stage);
    });
  };

  const history = [...entries].sort((a, b) => b.at.localeCompare(a.at));
  const error = log.error ?? setStage.error ?? removeEntry.error ?? removeFirm.error;

  return (
    <div className="mb-12">
      <p className="mt-0">
        <strong>How to approach them:</strong> {contactHint(firm)}
      </p>
      <p className="text-muted text-13">
        {[
          firm.haulageType,
          firm.contactPerson === undefined ? undefined : `Ask for ${firm.contactPerson}`,
          firm.phone,
          firm.email,
          firm.website,
        ]
          .filter((part): part is string => part !== undefined)
          .join(' · ') || 'No contact details yet.'}
      </p>
      {firm.notes !== undefined && <p className="pre-wrap text-13">{firm.notes}</p>}

      {editing ? (
        <SalesFirmForm
          firm={firm}
          onDone={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="flex gap-8 wrap items-center mb-12">
          <button type="button" onClick={() => setEditing(true)}>
            Edit details
          </button>
          <label>
            <span className="text-13">Stage </span>
            <select
              value={firm.stage}
              disabled={optedOut || setStage.isPending}
              onChange={(e) => changeStage(e.target.value as SalesStage)}
            >
              {SALES_STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {STAGE_LABELS[stage]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn-danger"
            disabled={optedOut || removeFirm.isPending}
            title={optedOut ? 'This record stays, so they are never contacted again' : undefined}
            onClick={() =>
              void ask({
                message: `Delete ${firm.name} and everything logged against it? This cannot be undone.`,
                confirmLabel: 'Delete firm',
              }).then((ok) => {
                if (ok) removeFirm.mutate();
              })
            }
          >
            Delete firm
          </button>
        </div>
      )}

      {firm.nextStep !== undefined || firm.nextStepOn !== undefined ? (
        <p className="text-13">
          <strong>Next step:</strong> {firm.nextStep ?? 'Not written down'}
          {firm.nextStepOn === undefined ? '' : `, ${formatDate(firm.nextStepOn)}`}
        </p>
      ) : null}

      {optedOut ? (
        <p className="text-danger">
          This firm asked not to be contacted. Do not contact them again. Their record stays here as
          the reminder.
        </p>
      ) : (
        <form
          className="box mb-12"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <h3 className="mt-0">Log a contact</h3>
          <p className="text-muted text-13 mt-0">
            Write down what you did and what came of it. This records it only; nothing is sent from
            here.
          </p>
          <div className="flex gap-12 wrap items-end">
            <label>
              <span className="block">When</span>
              <input
                type="date"
                value={day}
                max={localDateString(new Date())}
                onChange={(e) => setDay(e.target.value)}
              />
            </label>
            <label>
              <span className="block">How</span>
              <select value={how} onChange={(e) => setHow(e.target.value as ContactHow)}>
                {CONTACT_HOWS.map((h) => (
                  <option key={h} value={h}>
                    {HOW_LABELS[h]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="block">What came of it</span>
              <select value={result} onChange={(e) => setResult(e.target.value as ContactResult)}>
                {CONTACT_RESULTS.map((r) => (
                  <option key={r} value={r}>
                    {RESULT_LABELS[r]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="block">The problem you led with</span>
              <select value={pitch} onChange={(e) => setPitch(e.target.value as Pitch | '')}>
                <option value="">Not recorded</option>
                {PITCHES.map((p) => (
                  <option key={p} value={p}>
                    {PITCH_LABELS[p]}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ flexBasis: '100%' }}>
              <span className="block">What they said, in their words</span>
              <textarea
                value={note}
                maxLength={1000}
                rows={2}
                onChange={(e) => setNote(e.target.value)}
                style={{ width: '100%' }}
              />
            </label>
            <label>
              <span className="block">Next step</span>
              <input
                value={nextStep}
                maxLength={300}
                placeholder="e.g. Ring back about checks"
                onChange={(e) => setNextStep(e.target.value)}
                style={{ width: 280 }}
              />
            </label>
            <label>
              <span className="block">By</span>
              <input
                type="date"
                value={nextStepOn}
                onChange={(e) => setNextStepOn(e.target.value)}
              />
            </label>
            <button type="submit" className="btn-primary" disabled={log.isPending}>
              {log.isPending ? 'Saving…' : 'Log it'}
            </button>
          </div>
          <p className="text-muted text-13 mb-0">
            The next step replaces the old one. Leave it blank if there is nothing more to do.
          </p>
        </form>
      )}
      {error !== null && <p className="text-danger">{staffErrorMessage(error)}</p>}

      <h3>Log</h3>
      {history.length === 0 ? (
        <p className="text-muted">Nothing logged yet.</p>
      ) : (
        <ul className="mt-0">
          {history.map((e) => (
            <li key={e.id} className="mb-8">
              <strong>{new Date(e.at).toLocaleDateString('en-GB')}</strong> · {HOW_LABELS[e.how]} ·{' '}
              {RESULT_LABELS[e.result]}
              {e.pitch === undefined ? '' : ` · led with ${PITCH_LABELS[e.pitch].toLowerCase()}`}
              {e.note === undefined ? null : (
                <span className="pre-wrap text-13 block">{e.note}</span>
              )}{' '}
              <button
                type="button"
                className="btn-chip"
                disabled={removeEntry.isPending}
                onClick={() =>
                  void ask({
                    message: 'Remove this entry from the log? The firm’s stage stays as it is.',
                    confirmLabel: 'Remove entry',
                  }).then((ok) => {
                    if (ok) removeEntry.mutate(e.id);
                  })
                }
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
