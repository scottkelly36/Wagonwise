import type { TesterDto } from '@wagonwise/contracts/signups';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import * as signupsApi from '../../api/signups';
import { DataTable, type Column } from '../../components/DataTable';
import { canInvite, inviteSummary, roleLabel, testersCsv } from '../../lib/testers';
import { useStaffAuthStore } from '../../state/staff-auth-store';
import { staffErrorMessage } from '../staff/messages';

const TESTERS_KEY = ['testers'] as const;
const OPT_IN_LINK_KEY = 'wagonwise.testerOptInLink';

function savedLink(): string {
  try {
    return window.localStorage.getItem(OPT_IN_LINK_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveLink(link: string): void {
  try {
    window.localStorage.setItem(OPT_IN_LINK_KEY, link);
  } catch {
    // Not kept: the link just has to be pasted again next time.
  }
}

function download(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Who has put their email on the landing page to test the app. WagonWise staff only. */
export function Testers() {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const queryClient = useQueryClient();

  const testers = useQuery({
    queryKey: TESTERS_KEY,
    queryFn: () => withAccessToken((token) => signupsApi.listTesters(token)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => withAccessToken((token) => signupsApi.deleteTester(token, id)),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: TESTERS_KEY }),
  });

  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [optInLink, setOptInLink] = useState(savedLink);
  const [outcome, setOutcome] = useState<string | undefined>();
  const invite = useMutation({
    mutationFn: (ids: string[]) =>
      withAccessToken((token) =>
        signupsApi.sendInvites(token, { ids, optInLink: optInLink.trim() }),
      ),
    onSuccess: (response) => {
      setOutcome(inviteSummary(response.results));
      setPicked(new Set());
      void queryClient.invalidateQueries({ queryKey: TESTERS_KEY });
    },
  });
  const toggle = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const linkOk = /^https:\/\/\S+$/.test(optInLink.trim());

  const columns: Column<TesterDto>[] = [
    {
      key: 'pick',
      header: '',
      cell: (t) =>
        canInvite(t) ? (
          <input
            type="checkbox"
            aria-label={`Pick ${t.email}`}
            checked={picked.has(t.id)}
            onChange={() => toggle(t.id)}
          />
        ) : null,
    },
    { key: 'email', header: 'Email', sortValue: (t) => t.email, cell: (t) => t.email },
    { key: 'name', header: 'Name', sortValue: (t) => t.name ?? '', cell: (t) => t.name ?? '' },
    { key: 'role', header: 'Is a', sortValue: (t) => t.role, cell: (t) => roleLabel(t.role) },
    {
      key: 'company',
      header: 'Company',
      sortValue: (t) => t.company ?? '',
      cell: (t) => (t.company ?? '') + (t.fleetSize === undefined ? '' : ` (${t.fleetSize})`),
    },
    {
      key: 'at',
      header: 'Signed up',
      sortValue: (t) => t.createdAt,
      cell: (t) => new Date(t.createdAt).toLocaleDateString('en-GB'),
    },
    {
      key: 'invited',
      header: 'Invited',
      sortValue: (t) => t.invitedAt ?? '',
      cell: (t) =>
        t.invitedAt === undefined
          ? ''
          : `${new Date(t.invitedAt).toLocaleDateString('en-GB')} · ${t.inviteCode ?? ''}`,
    },
    {
      key: 'remove',
      header: '',
      align: 'right',
      cell: (t) => (
        <button
          className="btn-danger"
          disabled={remove.isPending}
          onClick={() => {
            if (window.confirm(`Remove ${t.email} from the list?`)) remove.mutate(t.id);
          }}
        >
          Remove
        </button>
      ),
    },
  ];

  const error = testers.error ?? remove.error ?? invite.error;
  const data = testers.data;

  return (
    <div>
      <h1>Testers</h1>
      <p style={{ color: 'var(--text-muted)' }}>
        People who asked, on the landing page, to hear when testing opens. Each ticked the box
        agreeing to be emailed about it; they can also remove themselves from the page.
      </p>

      {error !== null && <p style={{ color: 'var(--danger)' }}>{staffErrorMessage(error)}</p>}

      {data === undefined ? (
        <p>Loading…</p>
      ) : (
        <>
          <p>
            <strong>{data.total}</strong> {data.total === 1 ? 'person' : 'people'} signed up.{' '}
            <button
              className="btn-secondary"
              disabled={data.testers.length === 0}
              onClick={() => download('wagonwise-testers.csv', testersCsv(data.testers))}
            >
              Download as a spreadsheet
            </button>
          </p>
          <section className="card" style={{ marginBottom: 16 }}>
            <h2 style={{ marginTop: 0 }}>Send the test invite</h2>
            <p style={{ color: 'var(--text-muted)' }}>
              Tick the people to invite. Each gets the standard email: how to join the closed test,
              how to install the app, and an invite code made for them alone (it works once). Who
              was sent it, when, and which code, is recorded below. Nobody is ever sent a second
              one.
            </p>
            <label>
              Google Play opt-in link{' '}
              <input
                type="url"
                value={optInLink}
                placeholder="https://play.google.com/apps/testing/…"
                style={{ width: 'min(100%, 460px)' }}
                onChange={(event) => {
                  setOptInLink(event.target.value);
                  saveLink(event.target.value.trim());
                }}
              />
            </label>
            <p>
              <button
                className="btn-secondary"
                onClick={() => setPicked(new Set(data.testers.filter(canInvite).map((t) => t.id)))}
              >
                Pick everyone not yet invited
              </button>{' '}
              <button
                className="btn-primary"
                disabled={picked.size === 0 || !linkOk || invite.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      `Email the test invite to ${picked.size} ${picked.size === 1 ? 'person' : 'people'}?`,
                    )
                  ) {
                    setOutcome(undefined);
                    invite.mutate([...picked]);
                  }
                }}
              >
                {invite.isPending
                  ? 'Sending…'
                  : `Send invite to ${picked.size} ${picked.size === 1 ? 'person' : 'people'}`}
              </button>
            </p>
            {!linkOk && optInLink.trim() !== '' && (
              <p style={{ color: 'var(--danger)' }}>The link should start with https://</p>
            )}
            {outcome !== undefined && <p>{outcome}</p>}
          </section>
          <DataTable
            columns={columns}
            rows={data.testers}
            rowKey={(t) => t.id}
            searchText={(t) => `${t.email} ${t.name ?? ''} ${t.company ?? ''}`}
            emptyText="Nobody has signed up yet."
          />
        </>
      )}
    </div>
  );
}
