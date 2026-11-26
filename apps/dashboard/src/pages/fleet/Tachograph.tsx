import { ErrorNotice } from '../../components/ErrorNotice';
import { Loading } from '../../components/Loading';
import {
  DOWNLOAD_EVERY_DAYS,
  DUE_SOON_DAYS,
  MAX_TACHOGRAPH_FILE_BYTES,
  MAX_RETENTION_MONTHS,
  MIN_RETENTION_MONTHS,
  type TachographFileRow,
  type TachographKind,
} from '@wagonwise/contracts/tachograph';
import type { DriverLinkDto } from '@wagonwise/contracts/fleet';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import * as fleetApi from '../../api/fleet';
import * as tachographApi from '../../api/tachograph';
import { Badge, type BadgeTone } from '../../components/Badge';
import { CompanySelect } from '../../components/CompanySelect';
import { DataTable, type Column } from '../../components/DataTable';
import { useConfirm, useNotify } from '../../components/feedback-context';
import { driverDisplayName } from '../../lib/driver-name';
import { ownDriverState } from '../../lib/own-driver';
import { ukToday } from '../../lib/money';
import {
  base64ToBlob,
  dueText,
  fileToBase64,
  needsAction,
  sizeText,
  STATE_LABELS,
  trackerRows,
  type TrackerRow,
} from '../../lib/tachograph';
import { holds, isPlatform } from '../../state/access';
import { useStaffAuthStore } from '../../state/staff-auth-store';
import { useWorkingCompany } from '../../state/working-company-store';
import { staffErrorMessage } from '../staff/messages';

const TONES: Record<TrackerRow['status']['state'], BadgeTone> = {
  overdue: 'danger',
  due_soon: 'warning',
  no_file: 'neutral',
  ok: 'ok',
};
const KIND_LABELS: Record<TachographKind, string> = {
  driver_card: 'Driver card',
  vehicle_unit: 'Vehicle unit',
};

function dayText(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Tachograph downloads: a copy of each driver card and vehicle unit download, kept as received, and a tracker of when the next one is
 * due. Files come from the driver app (a driver's own card) or are uploaded here from whatever download tool the office uses. The
 * page works from the files sent to WagonWise and does not open them, so it tracks downloads; it does not say anyone has met their
 * duties.
 */
export function Tachograph() {
  const me = useStaffAuthStore((s) => s.session?.staff);
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const everyCompany = isPlatform(me);
  const canManage = holds(me, 'manage_fleet');
  const [selectedCompanyId, setSelectedCompanyId] = useWorkingCompany();
  const companyId = everyCompany ? selectedCompanyId || undefined : me?.companyId;
  const queryClient = useQueryClient();
  const notify = useNotify();
  const ask = useConfirm();

  const filesKey = ['tachograph-files', companyId] as const;
  const files = useQuery({
    queryKey: filesKey,
    queryFn: () =>
      withAccessToken((token) => tachographApi.listTachographFiles(token, companyId as string)),
    enabled: canManage && companyId !== undefined,
  });
  const links = useQuery({
    queryKey: ['driver-links', companyId],
    queryFn: () => withAccessToken((token) => fleetApi.listDriverLinks(token, companyId as string)),
    enabled: canManage && companyId !== undefined,
  });
  const vehicles = useQuery({
    queryKey: ['fleet-vehicles', companyId],
    queryFn: () =>
      withAccessToken((token) => fleetApi.listFleetVehicles(token, companyId as string)),
    enabled: canManage && companyId !== undefined,
  });

  const drivers = (links.data ?? []).flatMap((l) =>
    l.status === 'active' && l.driverId !== undefined
      ? [{ id: l.driverId, name: driverDisplayName(l) }]
      : [],
  );
  const vehicleList = (vehicles.data ?? []).map((v) => ({
    id: v.id,
    name: v.registration === undefined ? v.name : `${v.name} (${v.registration})`,
  }));
  const today = ukToday();
  const rows = trackerRows(drivers, vehicleList, files.data?.latest ?? [], today);
  const nameOf = (f: TachographFileRow): string =>
    (f.kind === 'driver_card' ? drivers : vehicleList).find(
      (s) => s.id === (f.kind === 'driver_card' ? f.driverId : f.vehicleId),
    )?.name ?? 'Removed';

  const [upload, setUpload] = useState<{ kind: TachographKind; subjectId: string } | undefined>(
    undefined,
  );
  const formRef = useRef<HTMLElement>(null);
  const startUpload = (kind: TachographKind, subjectId: string) => {
    setUpload({ kind, subjectId });
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
  };

  const save = (file: TachographFileRow) =>
    withAccessToken((token) =>
      tachographApi.getTachographFile(token, companyId as string, file.id),
    ).then((got) => {
      const url = URL.createObjectURL(base64ToBlob(got.dataBase64));
      const link = document.createElement('a');
      link.href = url;
      link.download = got.fileName;
      link.click();
      URL.revokeObjectURL(url);
    });
  const download = useMutation({ mutationFn: save });
  const remove = useMutation({
    mutationFn: (file: TachographFileRow) =>
      withAccessToken((token) =>
        tachographApi.deleteTachographFile(token, companyId as string, file.id),
      ),
    onSuccess: () => {
      notify('File deleted');
      void queryClient.invalidateQueries({ queryKey: filesKey });
    },
  });
  const confirmRemove = (file: TachographFileRow) =>
    void ask({
      message: `Delete ${file.fileName}? You may need to produce this record for 12 months, and it cannot be got back.`,
      confirmLabel: 'Delete file',
    }).then((ok) => {
      if (ok) remove.mutate(file);
    });

  if (!canManage) {
    return (
      <div>
        <h1>Tachograph files</h1>
        <p>You need the &ldquo;Manage vehicles &amp; drivers&rdquo; permission to see these.</p>
      </div>
    );
  }

  const columns: Column<TrackerRow>[] = [
    {
      key: 'name',
      header: 'Driver or vehicle',
      sortValue: (r) => r.name,
      cell: (r) => (
        <>
          {r.name} <span className="text-muted">({KIND_LABELS[r.kind].toLowerCase()})</span>
        </>
      ),
    },
    {
      key: 'last',
      header: 'Last download sent to us',
      sortValue: (r) => r.lastDownloadedOn ?? '',
      cell: (r) => (r.lastDownloadedOn === undefined ? '—' : dayText(r.lastDownloadedOn)),
    },
    {
      key: 'next',
      header: 'Next download',
      sortValue: (r) => r.status.daysLeft ?? -9999,
      cell: (r) => dueText(r.status) || '—',
    },
    {
      key: 'state',
      header: 'State',
      sortValue: (r) => r.status.state,
      cell: (r) => (
        <Badge
          tone={TONES[r.status.state]}
          {...(r.status.state === 'overdue'
            ? { icon: 'stop' as const }
            : r.status.state === 'due_soon'
              ? { icon: 'warning' as const }
              : {})}
        >
          {STATE_LABELS[r.status.state]}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (r) => (
        <span className="flex gap-8">
          <button type="button" onClick={() => startUpload(r.kind, r.subjectId)}>
            Upload a file
          </button>
          {r.lastFileId !== undefined && (
            <button
              type="button"
              className="btn-quiet"
              onClick={() => {
                const f = files.data?.latest.find((x) => x.id === r.lastFileId);
                if (f !== undefined) download.mutate(f);
              }}
            >
              Download latest
            </button>
          )}
        </span>
      ),
    },
  ];

  const recentColumns: Column<TachographFileRow>[] = [
    { key: 'name', header: 'For', sortValue: nameOf, cell: nameOf },
    {
      key: 'file',
      header: 'File',
      sortValue: (f) => f.fileName,
      cell: (f) => (
        <>
          {f.fileName} <span className="text-muted">{sizeText(f.sizeBytes)}</span>
        </>
      ),
    },
    {
      key: 'on',
      header: 'Downloaded',
      sortValue: (f) => f.downloadedOn,
      cell: (f) => dayText(f.downloadedOn),
    },
    {
      key: 'from',
      header: 'Sent',
      sortValue: (f) => f.receivedAt,
      cell: (f) =>
        `${dayText(f.receivedAt.slice(0, 10))}, ${f.source === 'driver_app' ? 'from the driver app' : 'uploaded here'}`,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (f) => (
        <span className="flex gap-8">
          <button type="button" onClick={() => download.mutate(f)}>
            Download
          </button>
          <button type="button" className="btn-caution" onClick={() => confirmRemove(f)}>
            Delete
          </button>
        </span>
      ),
    },
  ];

  const needing = needsAction(rows);

  return (
    <div>
      <h1>Tachograph files</h1>
      <p className="text-muted">
        Keep a copy of each driver card and vehicle unit download here, exactly as downloaded, and
        see when the next one is due. GOV.UK says operators must download a driver card at least
        every {DOWNLOAD_EVERY_DAYS.driver_card} days and a vehicle unit at least every{' '}
        {DOWNLOAD_EVERY_DAYS.vehicle_unit} days, and be able to produce records for 12 months.
        Downloading a vehicle unit needs your company card, so upload those from your own download
        tool.
      </p>
      <p className="text-muted">
        This page only knows about files sent to WagonWise, and it does not open them. A download
        you made and have not uploaded here does not appear, and a tick here is not a statement that
        you are meeting your duties.
      </p>

      {everyCompany && (
        <div className="mb-16">
          <label htmlFor="tachograph-company">Company </label>
          <CompanySelect
            id="tachograph-company"
            value={selectedCompanyId}
            onChange={setSelectedCompanyId}
            emptyLabel="Choose a company"
          />
        </div>
      )}

      {companyId === undefined ? (
        <p>Choose a company.</p>
      ) : (
        <>
          {(files.isError || links.isError || vehicles.isError) && (
            <ErrorNotice error={files.error ?? links.error ?? vehicles.error} />
          )}
          {download.isError && <p className="text-danger">{staffErrorMessage(download.error)}</p>}
          {remove.isError && <p className="text-danger">{staffErrorMessage(remove.error)}</p>}
          {files.isPending || links.isPending || vehicles.isPending ? (
            <Loading />
          ) : (
            <>
              <p>
                <strong>
                  {needing === 0
                    ? 'Nothing is overdue or missing from the files sent here.'
                    : `${needing} ${needing === 1 ? 'needs' : 'need'} a download: overdue, or no file sent yet.`}
                </strong>{' '}
                <span className="text-muted">
                  &ldquo;Due soon&rdquo; means within {DUE_SOON_DAYS} days.
                </span>
              </p>
              <DataTable
                columns={columns}
                rows={rows}
                rowKey={(r) => r.key}
                searchText={(r) => r.name}
                emptyText="Add drivers and vehicles first, then their files will be tracked here."
              />

              {me?.kind === 'fleet' && (
                <OwnDriver companyId={companyId} email={me.email} links={links.data ?? []} />
              )}

              <UploadForm
                ref={formRef}
                companyId={companyId}
                drivers={drivers}
                vehicles={vehicleList}
                choice={upload}
                onChoice={setUpload}
                today={today}
                onDone={(duplicate) => {
                  notify(
                    duplicate
                      ? 'You already had exactly this file, so nothing changed.'
                      : 'File saved',
                  );
                  void queryClient.invalidateQueries({ queryKey: filesKey });
                }}
              />

              <h2 className="mt-24">Files received</h2>
              <DataTable
                columns={recentColumns}
                rows={files.data?.recent ?? []}
                rowKey={(f) => f.id}
                searchText={(f) => `${nameOf(f)} ${f.fileName}`}
                emptyText="No files yet."
              />

              <Settings companyId={companyId} />
            </>
          )}
        </>
      )}
    </div>
  );
}

interface Subject {
  readonly id: string;
  readonly name: string;
}

const UploadForm = function UploadForm({
  ref,
  companyId,
  drivers,
  vehicles,
  choice,
  onChoice,
  today,
  onDone,
}: {
  ref: React.Ref<HTMLElement>;
  companyId: string;
  drivers: readonly Subject[];
  vehicles: readonly Subject[];
  choice: { kind: TachographKind; subjectId: string } | undefined;
  onChoice: (choice: { kind: TachographKind; subjectId: string } | undefined) => void;
  today: string;
  onDone: (duplicate: boolean) => void;
}) {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const [downloadedOn, setDownloadedOn] = useState(today);
  const [picked, setPicked] = useState<File | undefined>(undefined);
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const input = useRef<HTMLInputElement>(null);

  const kind = choice?.kind ?? 'driver_card';
  const subjects = kind === 'driver_card' ? drivers : vehicles;
  const subjectId = choice?.subjectId ?? '';

  const send = useMutation({
    mutationFn: async () => {
      if (picked === undefined || subjectId === '') throw new Error('incomplete');
      const dataBase64 = await fileToBase64(picked);
      return withAccessToken((token) =>
        tachographApi.uploadTachographFile(token, companyId, {
          kind,
          ...(kind === 'driver_card' ? { driverId: subjectId } : { vehicleId: subjectId }),
          fileName: picked.name,
          downloadedOn,
          dataBase64,
        }),
      );
    },
    onSuccess: (result) => {
      setPicked(undefined);
      if (input.current !== null) input.current.value = '';
      onDone(result.duplicate);
    },
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setProblem(undefined);
    if (subjectId === '')
      return setProblem(kind === 'driver_card' ? 'Choose the driver.' : 'Choose the vehicle.');
    if (picked === undefined) return setProblem('Choose the file.');
    if (picked.size === 0) return setProblem('That file is empty.');
    if (picked.size > MAX_TACHOGRAPH_FILE_BYTES) {
      return setProblem(
        `That file is ${sizeText(picked.size)}. The most WagonWise takes is ${sizeText(MAX_TACHOGRAPH_FILE_BYTES)}.`,
      );
    }
    if (downloadedOn > today) return setProblem('The download day cannot be in the future.');
    send.mutate();
  };

  return (
    <section ref={ref} className="mt-24 box" aria-labelledby="tachograph-upload">
      <h2 id="tachograph-upload">Upload a file</h2>
      <p className="text-muted">
        Use the file exactly as your download tool saved it (usually ending .ddd). WagonWise keeps
        the bytes as they are so the copy can be handed on unaltered, and does not read what is in
        it.
      </p>
      <form onSubmit={submit}>
        <div className="flex gap-12 wrap mb-12">
          <label>
            What is it?{' '}
            <select
              value={kind}
              onChange={(e) => onChoice({ kind: e.target.value as TachographKind, subjectId: '' })}
            >
              <option value="driver_card">A driver card</option>
              <option value="vehicle_unit">A vehicle unit</option>
            </select>
          </label>
          <label>
            {kind === 'driver_card' ? 'Whose card? ' : 'Which vehicle? '}
            <select
              value={subjectId}
              onChange={(e) => onChoice({ kind, subjectId: e.target.value })}
            >
              <option value="">Choose…</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Downloaded on{' '}
            <input
              type="date"
              value={downloadedOn}
              max={today}
              onChange={(e) => setDownloadedOn(e.target.value)}
            />
          </label>
        </div>
        <div className="mb-12">
          <input
            ref={input}
            type="file"
            aria-label="Tachograph file"
            onChange={(e) => setPicked(e.target.files?.[0])}
          />
        </div>
        {problem !== undefined && <p className="text-danger">{problem}</p>}
        {send.isError && !(send.error instanceof Error && send.error.message === 'incomplete') && (
          <p className="text-danger">{staffErrorMessage(send.error)}</p>
        )}
        <button type="submit" className="btn-primary" disabled={send.isPending}>
          {send.isPending ? 'Saving…' : 'Save file'}
        </button>
      </form>
    </section>
  );
};

function Settings({ companyId }: { companyId: string }) {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const queryClient = useQueryClient();
  const notify = useNotify();
  const key = ['tachograph-settings', companyId] as const;
  const settings = useQuery({
    queryKey: key,
    queryFn: () =>
      withAccessToken((token) => tachographApi.getTachographSettings(token, companyId)),
  });
  const change = useMutation({
    mutationFn: (next: { driversMaySend: boolean; retentionMonths: number }) =>
      withAccessToken((token) => tachographApi.setTachographSettings(token, companyId, next)),
    onSuccess: (saved) => {
      queryClient.setQueryData(key, saved);
      notify('Saved');
    },
  });
  if (settings.isPending) return <Loading />;
  if (settings.isError) return <ErrorNotice error={settings.error} />;
  const current = settings.data;
  const years = [12, 24, 36, 60].filter(
    (m) => m >= MIN_RETENTION_MONTHS && m <= MAX_RETENTION_MONTHS,
  );

  return (
    <section className="mt-24 box" aria-labelledby="tachograph-settings">
      <h2 id="tachograph-settings">Your choices</h2>
      <label className="block mb-12">
        <input
          type="checkbox"
          checked={current.driversMaySend}
          disabled={change.isPending}
          onChange={(e) => change.mutate({ ...current, driversMaySend: e.target.checked })}
        />{' '}
        Let drivers send their own card file from the app
      </label>
      <p className="text-muted">
        Off until you choose. A driver sees your company&apos;s name before they send, and the file
        comes to you only. Drivers need the latest version of the app.
      </p>
      <label className="block">
        Keep files for{' '}
        <select
          value={current.retentionMonths}
          disabled={change.isPending}
          onChange={(e) => change.mutate({ ...current, retentionMonths: Number(e.target.value) })}
        >
          {[...new Set([...years, current.retentionMonths])]
            .sort((a, b) => a - b)
            .map((m) => (
              <option key={m} value={m}>
                {m % 12 === 0 ? `${m / 12} ${m === 12 ? 'year' : 'years'}` : `${m} months`}
              </option>
            ))}
        </select>
      </label>
      <p className="text-muted">
        Never less than 12 months, the period GOV.UK says operators must be able to produce records
        for. Older files are deleted for you.
      </p>
      <label className="block mt-12">
        <input
          type="checkbox"
          checked={current.remindersEnabled}
          disabled={change.isPending}
          onChange={(e) => change.mutate({ ...current, remindersEnabled: e.target.checked })}
        />{' '}
        Remind me when a download is coming due
      </label>
      <p className="text-muted">
        On unless you turn it off. Everyone who manages vehicles and drivers gets an email a week
        before a download is due, two days before, on the day, and each week it is overdue. A driver
        who sends files also gets a notification about their own card. It only follows files already
        sent here.
      </p>
      {change.isError && <p className="text-danger">{staffErrorMessage(change.error)}</p>}
    </section>
  );
}

/**
 * For a firm run by someone who also drives its lorry: one button invites their own email as a driver and lets drivers send files,
 * so the rest is accepting in the app. Not shown once they are linked.
 */
function OwnDriver({
  companyId,
  email,
  links,
}: {
  companyId: string;
  email: string;
  links: readonly DriverLinkDto[];
}) {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const queryClient = useQueryClient();
  const state = ownDriverState(links, email);
  const [done, setDone] = useState(false);
  const setup = useMutation({
    mutationFn: async () => {
      if (state === 'none') {
        await withAccessToken((token) =>
          fleetApi.inviteDriver(token, companyId, { identifier: email }),
        );
      }
      const current = await withAccessToken((token) =>
        tachographApi.getTachographSettings(token, companyId),
      );
      if (!current.driversMaySend) {
        await withAccessToken((token) =>
          tachographApi.setTachographSettings(token, companyId, {
            ...current,
            driversMaySend: true,
          }),
        );
      }
    },
    onSuccess: () => {
      setDone(true);
      void queryClient.invalidateQueries({ queryKey: ['driver-links', companyId] });
      void queryClient.invalidateQueries({ queryKey: ['tachograph-settings', companyId] });
    },
  });
  if (state === 'active') return null;

  return (
    <section className="mt-24 box" aria-labelledby="tachograph-own-driver">
      <h2 id="tachograph-own-driver">Do you drive for this firm yourself?</h2>
      {state === 'invited' || done ? (
        <p>
          You are set up as a driver. Open the WagonWise app and sign in with{' '}
          <strong>{email}</strong>, then accept the invitation under More, My companies. After that,
          More, Send my tachograph file sends your card here.
        </p>
      ) : (
        <>
          <p className="text-muted">
            One button adds you as a driver of your own firm and lets drivers send their card file
            from the app. Then you accept the invitation in the app, signed in with {email}.
          </p>
          <button
            type="button"
            className="btn-primary"
            disabled={setup.isPending}
            onClick={() => setup.mutate()}
          >
            {setup.isPending ? 'Setting up…' : 'Add me as a driver'}
          </button>
          {setup.isError && <p className="text-danger">{staffErrorMessage(setup.error)}</p>}
        </>
      )}
    </section>
  );
}
