import type { EntryDto, ProspectDto } from '@wagonwise/contracts/sales';
import { useMemo, useState } from 'react';
import {
  DRAFT_KINDS,
  DRAFT_LABELS,
  draftEmail,
  emailBlockedReason,
  FOUND_LABELS,
  FOUND_OPTIONS,
  mailtoLink,
  PROBLEM_LABELS,
  PROBLEMS,
  problemFor,
  type DraftKind,
  type Found,
  type Problem,
} from '../lib/sales-email';
import { useNotify } from './feedback-context';

const STORAGE_KEY = 'wagonwise-sales-email';

interface Remembered {
  readonly phone: string;
  readonly storesLive: boolean;
}

/** The owner's own number and whether the stores are live are the same for every firm, so they are remembered on this browser. */
function recall(): Remembered {
  try {
    const saved = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? 'null',
    ) as Partial<Remembered> | null;
    return { phone: saved?.phone ?? '', storesLive: saved?.storesLive === true };
  } catch {
    return { phone: '', storesLive: false };
  }
}

function remember(value: Remembered): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Remembering is a convenience only.
  }
}

/** The pitch of the most recent contact that had one, which is the natural problem to lead with next. */
const lastPitch = (entries: readonly EntryDto[]): EntryDto['pitch'] =>
  [...entries].sort((a, b) => b.at.localeCompare(a.at)).find((e) => e.pitch !== undefined)?.pitch;

/**
 * Writes the emails for a firm from what the notebook already holds (who to ask for, the firm's name, the problem last led with).
 * It only drafts: copy the text, or open it in your own mail app. Nothing is sent from here, and logging the contact is still
 * done by hand afterwards.
 */
export function SalesEmailDrafts({
  firm,
  entries,
}: {
  firm: ProspectDto;
  entries: readonly EntryDto[];
}) {
  const notify = useNotify();
  const blocked = emailBlockedReason(firm);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<DraftKind>(entries.length === 0 ? 'cold' : 'week');
  const [problem, setProblem] = useState<Problem>(problemFor(lastPitch(entries)));
  const [found, setFound] = useState<Found>('on your website');
  const [remembered, setRemembered] = useState<Remembered>(recall);

  const draft = useMemo(
    () => draftEmail(firm, { kind, problem, found, ...remembered }),
    [firm, kind, problem, found, remembered],
  );
  const text = `Subject: ${draft.subject}\n\n${draft.body}`;

  const change = (next: Remembered) => {
    setRemembered(next);
    remember(next);
  };

  if (blocked !== undefined) {
    return <p className="text-muted text-13">{blocked}</p>;
  }

  if (!open) {
    return (
      <div className="mb-12">
        <button type="button" onClick={() => setOpen(true)}>
          Draft an email
        </button>
      </div>
    );
  }

  return (
    <section className="card mb-12" aria-label={`Draft an email to ${firm.name}`}>
      <h3 className="mt-0">Draft an email</h3>
      <p className="text-muted text-13">
        Written from what is saved about {firm.name}. Read it, change it, and send it from your own
        mail. Nothing is sent from here.
      </p>
      <div className="flex gap-12 wrap items-end mb-12">
        <label>
          <span className="block">Which email</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as DraftKind)}>
            {DRAFT_KINDS.map((k) => (
              <option key={k} value={k}>
                {DRAFT_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="block">The one problem to raise</span>
          <select value={problem} onChange={(e) => setProblem(e.target.value as Problem)}>
            {PROBLEMS.map((p) => (
              <option key={p} value={p}>
                {PROBLEM_LABELS[p]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="block">How you found them</span>
          <select value={found} onChange={(e) => setFound(e.target.value as Found)}>
            {FOUND_OPTIONS.map((f) => (
              <option key={f} value={f}>
                {FOUND_LABELS[f]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="block">Your phone number</span>
          <input
            value={remembered.phone}
            maxLength={40}
            onChange={(e) => change({ ...remembered, phone: e.target.value })}
            style={{ width: 150 }}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={remembered.storesLive}
            onChange={(e) => change({ ...remembered, storesLive: e.target.checked })}
          />{' '}
          Both app stores are live
        </label>
      </div>
      {firm.email === undefined && (
        <p className="text-13">
          No company mailbox saved for this firm yet. Add it with Edit details so the email can be
          opened ready to send.
        </p>
      )}
      <pre className="pre-wrap" data-testid="email-draft">
        {text}
      </pre>
      <div className="flex gap-8 wrap items-center">
        <button
          type="button"
          className="btn-primary"
          onClick={() =>
            void navigator.clipboard
              .writeText(text)
              .then(() => notify('Copied'))
              .catch(() => notify('Could not copy. Select the text and copy it.'))
          }
        >
          Copy
        </button>
        {firm.email !== undefined && <a href={mailtoLink(firm.email, draft)}>Open in my email</a>}
        <button type="button" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      <p className="text-muted text-13">
        Square brackets are for you to fill in. After you send it, log the contact below.
      </p>
    </section>
  );
}
