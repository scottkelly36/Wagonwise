import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ANNOUNCEMENT_BODY_MAX,
  ANNOUNCEMENT_TITLE_MAX,
  type AnnouncementDto,
  type PublishAnnouncementResponse,
} from '@wagonwise/contracts/announcements';
import { useState } from 'react';
import * as announcementsApi from '../../api/announcements';
import { ApiError } from '../../api/errors';
import { DataTable, IconButton, type Column } from '../../components/DataTable';
import { ErrorNotice } from '../../components/ErrorNotice';
import { useConfirm, useNotify } from '../../components/feedback-context';
import { Loading } from '../../components/Loading';
import { useStaffAuthStore } from '../../state/staff-auth-store';

const KEY = ['announcements'] as const;

/** What publishing did, in plain words: published, and what happened to the notification if one was asked for. */
function publishedMessage(published: PublishAnnouncementResponse, askedForPush: boolean): string {
  if (!askedForPush) return 'Published. Drivers will see it when they next open the app.';
  if (published.pushFailed === true) {
    return 'Published, but the notification could not be sent. Drivers will still see the note when they next open the app.';
  }
  if (published.pushedAt === undefined) {
    return 'Published. No driver has notifications on, so none was sent.';
  }
  return `Published, and sent as a notification to ${published.pushedTo ?? 0} phones.`;
}

/**
 * Notes to the drivers about what has changed in the app, for WagonWise staff only. The driver app shows the newest one once, as "What's new",
 * the next time a driver opens it. Write it plainly, one point to a line, and say what a driver can now do rather than what was built.
 */
export function Announcements() {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const queryClient = useQueryClient();
  const notify = useNotify();
  const ask = useConfirm();

  const list = useQuery({
    queryKey: KEY,
    queryFn: () => withAccessToken((token) => announcementsApi.listAnnouncements(token)),
  });

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [push, setPush] = useState(false);
  const ready = title.trim() !== '' && body.trim() !== '';

  const create = useMutation({
    mutationFn: () =>
      withAccessToken((token) =>
        announcementsApi.createAnnouncement(token, {
          title: title.trim(),
          body: body.trim(),
          ...(push ? { push: true } : {}),
        }),
      ),
    onSuccess: (published) => {
      notify(publishedMessage(published, push));
      setTitle('');
      setBody('');
      setPush(false);
      void queryClient.invalidateQueries({ queryKey: KEY });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      withAccessToken((token) => announcementsApi.deleteAnnouncement(token, id)),
    onSuccess: () => {
      notify('Taken back');
      void queryClient.invalidateQueries({ queryKey: KEY });
    },
  });

  const announcements = list.data?.announcements ?? [];
  const newest = announcements[0]?.id;

  const columns: Column<AnnouncementDto>[] = [
    {
      key: 'when',
      header: 'Published',
      sortValue: (a) => a.publishedAt,
      cell: (a) => new Date(a.publishedAt).toLocaleString('en-GB'),
    },
    {
      key: 'title',
      header: 'Note',
      sortValue: (a) => a.title.toLowerCase(),
      cell: (a) => (
        <>
          <strong>{a.title}</strong>
          {a.pushedAt === undefined ? null : (
            <span className="text-muted text-13">
              {' '}
              (sent as a notification to {a.pushedTo ?? 0})
            </span>
          )}
          {a.id === newest ? (
            <span className="text-muted text-13"> (the one drivers see now)</span>
          ) : null}
          <span className="block text-muted text-13" style={{ whiteSpace: 'pre-line' }}>
            {a.body}
          </span>
        </>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (a) => (
        <IconButton
          icon="delete"
          danger
          label={`Take back ${a.title}`}
          disabled={remove.isPending}
          onClick={() => {
            void ask({ message: `Take back "${a.title}"?`, confirmLabel: 'Take back' }).then(
              (ok) => {
                if (ok) remove.mutate(a.id);
              },
            );
          }}
        />
      ),
    },
  ];

  const tooSoon = create.error instanceof ApiError && create.error.tag === 'PushTooSoon';
  const error = list.error ?? (tooSoon ? null : create.error) ?? remove.error;

  return (
    <div>
      <h1>What's new</h1>
      <p className="text-muted">
        A note to the drivers about what has changed in the app. The driver app shows the newest one
        once, the next time a driver opens it after you publish. Taking back the newest shows the
        one before it to anyone who has not seen that yet.
      </p>

      {error !== null && error !== undefined && <ErrorNotice error={error} />}
      {tooSoon && (
        <p className="text-danger" role="alert">
          A notification went out in the last three days, so drivers are not sent another yet.
          Nothing was published. Untick the notification to publish it quietly, or try again later.
        </p>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) create.mutate();
        }}
        className="mb-16"
      >
        <label className="block mb-16">
          <strong>Heading</strong>
          <span className="block text-muted text-13">
            For example "Choose your route on a job".
          </span>
          <input
            value={title}
            maxLength={ANNOUNCEMENT_TITLE_MAX}
            onChange={(e) => setTitle(e.target.value)}
            style={{ width: '100%' }}
          />
        </label>
        <label className="block mb-16">
          <strong>What changed</strong>
          <span className="block text-muted text-13">
            Plain words, one point to a line. {body.length} of {ANNOUNCEMENT_BODY_MAX} characters.
          </span>
          <textarea
            value={body}
            maxLength={ANNOUNCEMENT_BODY_MAX}
            rows={5}
            onChange={(e) => setBody(e.target.value)}
            style={{ width: '100%' }}
          />
        </label>
        <label className="block mb-16">
          <input type="checkbox" checked={push} onChange={(e) => setPush(e.target.checked)} />{' '}
          <strong>Also send it as a notification</strong>
          <span className="block text-muted text-13">
            Sends the heading and the first point to every driver who has not turned these off, with
            no sound. Use it rarely: drivers can switch these off, and it cannot be sent more than
            once in three days. It cannot be taken back once sent.
          </span>
        </label>
        <button type="submit" disabled={!ready || create.isPending}>
          {create.isPending ? 'Publishing…' : 'Publish'}
        </button>
      </form>

      <h2>Published</h2>
      {list.isPending ? (
        <Loading />
      ) : announcements.length === 0 ? (
        <p className="text-muted">Nothing yet. The first note you publish is shown to drivers.</p>
      ) : (
        <DataTable
          columns={columns}
          rows={announcements}
          rowKey={(a) => a.id}
          emptyText="Nothing yet."
        />
      )}
    </div>
  );
}
