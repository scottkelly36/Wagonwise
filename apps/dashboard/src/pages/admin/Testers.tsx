import { useConfirm, useNotify } from '../../components/feedback-context';
import type { TesterDto } from '@wagonwise/contracts/signups';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import * as signupsApi from '../../api/signups';
import { DataTable, type Column } from '../../components/DataTable';
import {
  canInvite,
  canLaunchEmail,
  inviteSummary,
  launchEmailSummary,
  playTesterEmailsCsv,
  roleLabel,
  testersCsv,
} from '../../lib/testers';
import { useStaffAuthStore } from '../../state/staff-auth-store';
import { staffErrorMessage } from '../staff/messages';

const TESTERS_KEY = ['testers'] as const;
const OPT_IN_LINK_KEY = 'wagonwise.testerOptInLink';
const APP_STORE_LINK_KEY = 'wagonwise.testerAppStoreLink';
const PLAY_STORE_LINK_KEY = 'wagonwise.testerPlayStoreLink';
/** The app's Google Play page follows from its package name, so it is filled in; the App Store one needs Apple's number for the app. */
const DEFAULT_PLAY_STORE_LINK =
  'https://play.google.com/store/apps/details?id=com.wagonwise.driverapp';

function savedLink(key: string, fallback = ''): string {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function saveLink(key: string, link: string): void {
  try {
    window.localStorage.setItem(key, link);
  } catch {
    // Not kept: the link just has to be pasted again next time.
  }
}

const isHttpsLink = (link: string): boolean => /^https:\/\/\S+$/.test(link.trim());

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
  const ask = useConfirm();
  const notify = useNotify();
  const remove = useMutation({
    mutationFn: (id: string) => withAccessToken((token) => signupsApi.deleteTester(token, id)),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: TESTERS_KEY }),
  });

  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [optInLink, setOptInLink] = useState(() => savedLink(OPT_IN_LINK_KEY));
  const [appStoreLink, setAppStoreLink] = useState(() => savedLink(APP_STORE_LINK_KEY));
  const [playStoreLink, setPlayStoreLink] = useState(() =>
    savedLink(PLAY_STORE_LINK_KEY, DEFAULT_PLAY_STORE_LINK),
  );
  const [launchOutcome, setLaunchOutcome] = useState<string | undefined>();
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
  const launch = useMutation({
    mutationFn: (ids: string[]) =>
      withAccessToken((token) =>
        signupsApi.sendLaunchEmails(token, {
          ids,
          appStoreLink: appStoreLink.trim(),
          playStoreLink: playStoreLink.trim(),
        }),
      ),
    onSuccess: (response) => {
      setLaunchOutcome(launchEmailSummary(response.results));
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
  const linkOk = isHttpsLink(optInLink);
  const storeLinksOk = isHttpsLink(appStoreLink) && isHttpsLink(playStoreLink);

  const columns: Column<TesterDto>[] = [
    {
      key: 'pick',
      header: '',
      cell: (t) =>
        canInvite(t) || canLaunchEmail(t) ? (
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
      key: 'launched',
      header: 'Out-now email',
      sortValue: (t) => t.launchEmailedAt ?? '',
      cell: (t) =>
        t.launchEmailedAt === undefined
          ? ''
          : new Date(t.launchEmailedAt).toLocaleDateString('en-GB'),
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
            void ask({
              message: `Remove ${t.email} from the list?`,
              confirmLabel: 'Remove tester',
            }).then((ok) => {
              if (ok) remove.mutate(t.id, { onSuccess: () => notify('Tester removed') });
            });
          }}
        >
          Remove
        </button>
      ),
    },
  ];

  const error = testers.error ?? remove.error ?? invite.error ?? launch.error;
  const data = testers.data;
  const toInvite = data?.testers.filter((t) => picked.has(t.id) && canInvite(t)) ?? [];
  const toLaunch = data?.testers.filter((t) => picked.has(t.id) && canLaunchEmail(t)) ?? [];

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
            </button>{' '}
            <button
              className="btn-secondary"
              disabled={data.testers.length === 0}
              title="Only the email addresses, one per line, in the form Google Play's tester list upload accepts"
              onClick={() => {
                const chosen = data.testers.filter((t) => picked.has(t.id));
                download(
                  'google-play-testers.csv',
                  playTesterEmailsCsv(chosen.length > 0 ? chosen : data.testers),
                );
              }}
            >
              {picked.size > 0
                ? `Download ${picked.size} ${picked.size === 1 ? 'email' : 'emails'} for Google Play`
                : 'Download emails for Google Play'}
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
                  saveLink(OPT_IN_LINK_KEY, event.target.value.trim());
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
                disabled={toInvite.length === 0 || !linkOk || invite.isPending}
                onClick={() => {
                  void ask({
                    message: `Email the test invite to ${toInvite.length} ${toInvite.length === 1 ? 'person' : 'people'}?`,
                    confirmLabel: 'Send invites',
                    tone: 'normal',
                  }).then((ok) => {
                    if (ok) {
                      setOutcome(undefined);
                      invite.mutate(toInvite.map((t) => t.id));
                    }
                  });
                }}
              >
                {invite.isPending
                  ? 'Sending…'
                  : `Send invite to ${toInvite.length} ${toInvite.length === 1 ? 'person' : 'people'}`}
              </button>
            </p>
            {!linkOk && optInLink.trim() !== '' && (
              <p style={{ color: 'var(--danger)' }}>The link should start with https://</p>
            )}
            {outcome !== undefined && <p>{outcome}</p>}
          </section>
          <section className="card" style={{ marginBottom: 16 }}>
            <h2 style={{ marginTop: 0 }}>Send the "out now" email</h2>
            <p style={{ color: 'var(--text-muted)' }}>
              For when the app is in the App Store and on Google Play. Tick the people to tell (the
              same ticks as above). Each gets a branded email thanking them for signing up, with a
              button for each store. It makes no invite code. Who was sent it, and when, is recorded
              below, and nobody is ever sent it twice.
            </p>
            <p>
              <label>
                App Store link{' '}
                <input
                  type="url"
                  value={appStoreLink}
                  placeholder="https://apps.apple.com/gb/app/…"
                  style={{ width: 'min(100%, 460px)' }}
                  onChange={(event) => {
                    setAppStoreLink(event.target.value);
                    saveLink(APP_STORE_LINK_KEY, event.target.value.trim());
                  }}
                />
              </label>
            </p>
            <p>
              <label>
                Google Play link{' '}
                <input
                  type="url"
                  value={playStoreLink}
                  style={{ width: 'min(100%, 460px)' }}
                  onChange={(event) => {
                    setPlayStoreLink(event.target.value);
                    saveLink(PLAY_STORE_LINK_KEY, event.target.value.trim());
                  }}
                />
              </label>
            </p>
            <p>
              <button
                className="btn-secondary"
                onClick={() =>
                  setPicked(new Set(data.testers.filter(canLaunchEmail).map((t) => t.id)))
                }
              >
                Pick everyone not yet told
              </button>{' '}
              <button
                className="btn-primary"
                disabled={toLaunch.length === 0 || !storeLinksOk || launch.isPending}
                onClick={() => {
                  void ask({
                    message: `Email the "out now" message to ${toLaunch.length} ${toLaunch.length === 1 ? 'person' : 'people'}? It cannot be unsent.`,
                    confirmLabel: 'Send message',
                    tone: 'caution',
                  }).then((ok) => {
                    if (ok) {
                      setLaunchOutcome(undefined);
                      launch.mutate(toLaunch.map((t) => t.id));
                    }
                  });
                }}
              >
                {launch.isPending
                  ? 'Sending…'
                  : `Send "out now" email to ${toLaunch.length} ${toLaunch.length === 1 ? 'person' : 'people'}`}
              </button>
            </p>
            {!storeLinksOk && (appStoreLink.trim() !== '' || playStoreLink.trim() !== '') && (
              <p style={{ color: 'var(--danger)' }}>Both links should start with https://</p>
            )}
            {launchOutcome !== undefined && <p>{launchOutcome}</p>}
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
