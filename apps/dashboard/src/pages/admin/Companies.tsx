import { ErrorNotice } from '../../components/ErrorNotice';
import { Loading } from '../../components/Loading';
import {
  companyIdSchema,
  type AccountEmailKindDto,
  type AccountStatusDto,
  type CompanyDto,
} from '@wagonwise/contracts/companies';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import * as companiesApi from '../../api/companies';
import { Badge, type BadgeTone } from '../../components/Badge';
import { DataTable, type Column } from '../../components/DataTable';
import { FieldError } from '../../components/FieldError';
import { ACCOUNT_EMAIL_OPTIONS, canSendToCompany, sentMessage } from '../../lib/account-emails';
import { useStaffAuthStore } from '../../state/staff-auth-store';

const COMPANIES_KEY = ['companies'] as const;
const SETTINGS_KEY = ['account-settings'] as const;

const STATUS_LABEL: Record<AccountStatusDto, string> = {
  trial: 'Free trial',
  active: 'Active',
  overdue: 'Overdue',
  paused: 'Paused',
};
const STATUS_TONE: Record<AccountStatusDto, BadgeTone> = {
  trial: 'info',
  active: 'ok',
  overdue: 'warning',
  paused: 'danger',
};

const formatDay = (day: string) => new Date(`${day}T00:00:00`).toLocaleDateString('en-GB');

export function Companies() {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<string | undefined>(undefined);

  const companies = useQuery({
    queryKey: COMPANIES_KEY,
    queryFn: () => withAccessToken((token) => companiesApi.listCompanies(token)),
  });

  const createCompany = useMutation({
    mutationFn: (name: string) =>
      withAccessToken((token) =>
        companiesApi.createCompany(token, {
          id: companyIdSchema.parse(crypto.randomUUID()),
          name,
        }),
      ),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: COMPANIES_KEY }),
  });

  const [name, setName] = useState('');

  const [showError, setShowError] = useState(false);
  const nameError = name.trim().length === 0 ? 'Enter the company name.' : undefined;

  function handleSubmit(): void {
    if (nameError !== undefined) {
      setShowError(true);
      return;
    }
    createCompany.mutate(name.trim(), {
      onSuccess: () => {
        setName('');
        setShowError(false);
      },
    });
  }

  const columns: Column<CompanyDto>[] = [
    { key: 'name', header: 'Name', sortValue: (company) => company.name, cell: (c) => c.name },
    {
      key: 'created',
      header: 'Created',
      sortValue: (company) => company.createdAt,
      cell: (company) => new Date(company.createdAt).toLocaleDateString('en-GB'),
    },
    {
      key: 'status',
      header: 'Account',
      sortValue: (company) => company.accountStatus,
      cell: (company) =>
        company.accountStatus === undefined ? (
          ''
        ) : (
          <>
            <Badge tone={STATUS_TONE[company.accountStatus]}>
              {STATUS_LABEL[company.accountStatus]}
            </Badge>
            {company.hold === true && ' · held'}
          </>
        ),
    },
    {
      key: 'trial',
      header: 'Trial ends',
      sortValue: (company) => company.trialEndsOn ?? '',
      cell: (company) =>
        company.trialEndsOn === null || company.trialEndsOn === undefined
          ? ''
          : formatDay(company.trialEndsOn),
    },
    {
      key: 'edit',
      header: '',
      align: 'right',
      cell: (company) => (
        <button
          type="button"
          onClick={() => setEditing(editing === company.id ? undefined : company.id)}
        >
          {editing === company.id ? 'Close' : 'Account'}
        </button>
      ),
    },
  ];

  const error = companies.error ?? createCompany.error;

  return (
    <div>
      <h1>Companies</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        noValidate
        style={{ display: 'flex', gap: 8, marginBottom: 24, alignItems: 'flex-start' }}
      >
        <div className="field">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Company name"
            aria-label="Company name"
            aria-invalid={showError && nameError !== undefined}
            aria-describedby="company-name-error"
            autoFocus={showError}
          />
          <FieldError id="company-name-error" message={showError ? nameError : undefined} />
        </div>
        <button type="submit" disabled={createCompany.isPending}>
          {createCompany.isPending ? 'Adding…' : 'Add company'}
        </button>
      </form>

      {error !== null && <ErrorNotice error={error} />}

      {companies.isPending ? (
        <Loading />
      ) : (
        <DataTable
          columns={columns}
          rows={companies.data ?? []}
          rowKey={(company) => company.id}
          searchText={(company) => company.name}
          emptyText="No companies yet."
          expandedKey={editing}
          renderDetail={(company) => (
            <AccountEditor
              key={company.id}
              company={company}
              onClose={() => setEditing(undefined)}
            />
          )}
        />
      )}

      <AccountSettings />
    </div>
  );
}

/**
 * Moves one company between states: a free trial (with the day it ends), active, overdue or paused. A paused company's staff can
 * still sign in and read their pages but cannot change anything, and its drivers lose that company's jobs (not the free app);
 * nothing is deleted. "Never pause" keeps the automatic rules (a later change) away from a company.
 */
function AccountEditor({ company, onClose }: { company: CompanyDto; onClose: () => void }) {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const queryClient = useQueryClient();

  const current = useQuery({
    queryKey: ['account-state', company.id],
    queryFn: () => withAccessToken((token) => companiesApi.getAccountState(token, company.id)),
  });

  if (current.isPending) return <Loading />;
  if (current.isError) return <ErrorNotice error={current.error} />;

  return (
    <>
      <AccountForm
        companyId={company.id}
        companyName={company.name}
        initial={current.data}
        onSaved={() => {
          void queryClient.invalidateQueries({ queryKey: COMPANIES_KEY });
          void queryClient.invalidateQueries({ queryKey: ['account-state', company.id] });
        }}
        onClose={onClose}
      />
      <AccountEmails
        companyId={company.id}
        companyName={company.name}
        status={current.data.status}
      />
    </>
  );
}

/**
 * Write to a company about its account by hand: the free period ending, payment overdue, the account paused. The real email goes to the
 * people at the company who hold billing (or, if nobody does, who manage its users), only while the company is in the state the
 * email is about, and never twice for the same occasion. A test copy goes to the signed-in staff member only, so the wording can be read
 * first. Nothing is sent by itself yet.
 */
function AccountEmails({
  companyId,
  companyName,
  status,
}: {
  companyId: string;
  companyName: string;
  status: AccountStatusDto;
}) {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const [kind, setKind] = useState<AccountEmailKindDto>('paused');

  const send = useMutation({
    mutationFn: (target: 'company' | 'me') =>
      withAccessToken((token) =>
        companiesApi.sendAccountEmail(token, companyId, { kind, to: target }),
      ),
  });
  const real = canSendToCompany(kind, status);

  return (
    <div style={{ display: 'grid', gap: 8, maxWidth: 520, padding: '8px 0 16px' }}>
      <strong>Write to {companyName} about its account</strong>
      <label>
        Email{' '}
        <select
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as AccountEmailKindDto);
            send.reset();
          }}
        >
          {ACCOUNT_EMAIL_OPTIONS.map((o) => (
            <option key={o.kind} value={o.kind}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" disabled={send.isPending} onClick={() => send.mutate('me')}>
          Send me a test copy
        </button>
        <button
          type="button"
          disabled={send.isPending || !real}
          onClick={() => {
            if (window.confirm(`Send this email to ${companyName} now?`)) send.mutate('company');
          }}
        >
          Send to the company
        </button>
      </div>
      {!real && (
        <p className="text-muted">
          The real email can only go while the company is in the state it is about (now:{' '}
          {STATUS_LABEL[status]}). A test copy can always be sent.
        </p>
      )}
      {send.isError && <ErrorNotice error={send.error} />}
      {send.isSuccess && <p role="status">{sentMessage(send.variables, send.data)}</p>}
    </div>
  );
}

function AccountForm({
  companyId,
  companyName,
  initial,
  onSaved,
  onClose,
}: {
  companyId: string;
  companyName: string;
  initial: { status: AccountStatusDto; trialEndsOn: string | null; note: string; hold: boolean };
  onSaved: () => void;
  onClose: () => void;
}) {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const [status, setStatus] = useState<AccountStatusDto>(initial.status);
  const [trialEndsOn, setTrialEndsOn] = useState(initial.trialEndsOn ?? '');
  const [note, setNote] = useState(initial.note);
  const [hold, setHold] = useState(initial.hold);

  const save = useMutation({
    mutationFn: () =>
      withAccessToken((token) =>
        companiesApi.setAccountState(token, companyId, {
          status,
          ...(status === 'trial' && trialEndsOn !== '' ? { trialEndsOn } : {}),
          hold,
          note: note.trim(),
        }),
      ),
    onSuccess: onSaved,
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      style={{ display: 'grid', gap: 12, maxWidth: 520, padding: '8px 0' }}
    >
      <strong>{companyName}</strong>
      <label>
        State{' '}
        <select value={status} onChange={(e) => setStatus(e.target.value as AccountStatusDto)}>
          <option value="trial">Free trial</option>
          <option value="active">Active (paying, or free by your say-so)</option>
          <option value="overdue">Overdue (grace period, nothing switched off)</option>
          <option value="paused">Paused (can read, cannot change)</option>
        </select>
      </label>
      {status === 'trial' && (
        <label>
          Trial ends{' '}
          <input
            type="date"
            value={trialEndsOn}
            onChange={(e) => setTrialEndsOn(e.target.value)}
            aria-describedby="trial-hint"
          />{' '}
          <span id="trial-hint" className="text-muted">
            Leave empty for the usual length from today. Pick a later day to extend.
          </span>
        </label>
      )}
      <label>
        <input type="checkbox" checked={hold} onChange={(e) => setHold(e.target.checked)} /> Never
        pause this company (the pilot firm, or anyone you are looking after by hand)
      </label>
      <label>
        Note (only WagonWise staff see it){' '}
        <input
          value={note}
          maxLength={500}
          onChange={(e) => setNote(e.target.value)}
          style={{ width: '100%' }}
        />
      </label>
      {status === 'paused' && (
        <p className="text-muted">
          Its staff will be able to sign in and read their pages but not change anything, and its
          drivers will no longer see its jobs. Nothing is deleted.
        </p>
      )}
      {save.isError && <ErrorNotice error={save.error} />}
      {save.isSuccess && <p role="status">Saved.</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </form>
  );
}

/** The free period for companies made from now on (three months now, one later), and how long a company is overdue before it is paused. */
function AccountSettings() {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: () => withAccessToken((token) => companiesApi.getAccountSettings(token)),
  });

  if (settings.isPending) return null;
  if (settings.isError) return <ErrorNotice error={settings.error} />;
  return (
    <SettingsForm
      key={`${settings.data.defaultTrialDays}-${settings.data.graceDays}`}
      initial={settings.data}
      onSaved={() => void queryClient.invalidateQueries({ queryKey: SETTINGS_KEY })}
      save={(next) => withAccessToken((token) => companiesApi.updateAccountSettings(token, next))}
    />
  );
}

function SettingsForm({
  initial,
  onSaved,
  save,
}: {
  initial: { defaultTrialDays: number; graceDays: number };
  onSaved: () => void;
  save: (next: { defaultTrialDays: number; graceDays: number }) => Promise<unknown>;
}) {
  const [trialDays, setTrialDays] = useState(String(initial.defaultTrialDays));
  const [graceDays, setGraceDays] = useState(String(initial.graceDays));
  const trial = Number(trialDays);
  const grace = Number(graceDays);
  const valid =
    Number.isInteger(trial) &&
    trial >= 1 &&
    trial <= 365 &&
    Number.isInteger(grace) &&
    grace >= 0 &&
    grace <= 90;

  const mutation = useMutation({
    mutationFn: () => save({ defaultTrialDays: trial, graceDays: grace }),
    onSuccess: onSaved,
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) mutation.mutate();
      }}
      style={{ display: 'grid', gap: 12, maxWidth: 520, marginTop: 32 }}
    >
      <h2>Free trial and grace period</h2>
      <p className="text-muted">
        A company you add from now on gets this many days free. Companies already on a trial keep
        the day they were given. Today 90 days is three months; 30 is one month.
      </p>
      <label>
        Free trial for new companies (days){' '}
        <input
          type="number"
          min={1}
          max={365}
          value={trialDays}
          onChange={(e) => setTrialDays(e.target.value)}
        />
      </label>
      <label>
        Days overdue before a company is paused{' '}
        <input
          type="number"
          min={0}
          max={90}
          value={graceDays}
          onChange={(e) => setGraceDays(e.target.value)}
        />
      </label>
      {!valid && (
        <p className="error" role="alert">
          Trial: 1 to 365 days. Grace: 0 to 90 days.
        </p>
      )}
      {mutation.isError && <ErrorNotice error={mutation.error} />}
      {mutation.isSuccess && <p role="status">Saved.</p>}
      <div>
        <button type="submit" disabled={!valid || mutation.isPending}>
          {mutation.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}
