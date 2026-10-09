import type {
  FuelSummaryLineDto,
  FuelTransactionDto,
  ImportFuelResponse,
} from '@wagonwise/contracts/costing';
import { FUEL_IMPORT_MAX_ROWS } from '@wagonwise/contracts/costing';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import * as costingApi from '../../api/costing';
import * as fleetApi from '../../api/fleet';
import { CompanySelect } from '../../components/CompanySelect';
import { DataTable, type Column } from '../../components/DataTable';
import {
  guessMapping,
  INVALID_REASONS,
  loadMapping,
  readFuel,
  saveMapping,
  type FuelMapping,
} from '../../lib/fuel-import';
import { dateTimeText, presetRange, type ReportRange } from '../../lib/job-report';
import { parseCsv } from '../../lib/maintenance-import';
import { formatPence } from '../../lib/money';
import { holds, isPlatform } from '../../state/access';
import { useStaffAuthStore } from '../../state/staff-auth-store';
import { staffErrorMessage } from '../staff/messages';

type Period = 'thisMonth' | 'lastMonth' | 'last30';
const PERIODS: Record<Period, string> = {
  thisMonth: 'This month',
  lastMonth: 'Last month',
  last30: 'Last 30 days',
};

/**
 * Fuel: import a fuel card statement (a CSV, whatever the provider), see what each vehicle spent and what it cost a litre,
 * match purchases that matched no vehicle, and undo an import. Whoever manages the fleet imports and matches; anyone who can
 * read reports can look. It only counts what the firm brings in: nothing here talks to a card provider.
 */
export function Fuel() {
  const me = useStaffAuthStore((s) => s.session?.staff);
  const everyCompany = isPlatform(me);
  const canManage = everyCompany || holds(me, 'manage_fleet');
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const companyId = everyCompany ? selectedCompanyId || undefined : me?.companyId;
  const [period, setPeriod] = useState<Period>('thisMonth');

  return (
    <div>
      <h1>Fuel</h1>
      <p style={{ color: 'var(--text-muted)' }}>
        Bring in your fuel card statement and see what each vehicle spends and what you pay a litre.
        Fuel is matched to a vehicle by its registration, so add registrations on Vehicle profiles.
      </p>
      {everyCompany && (
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="fuel-company">Company </label>
          <CompanySelect
            id="fuel-company"
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
          {canManage && <ImportStatement companyId={companyId} />}
          <label style={{ display: 'block', margin: '8px 0 12px' }}>
            Show{' '}
            <select value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
              {(Object.keys(PERIODS) as Period[]).map((p) => (
                <option key={p} value={p}>
                  {PERIODS[p]}
                </option>
              ))}
            </select>
          </label>
          <ByVehicle companyId={companyId} period={period} />
          <Unmatched companyId={companyId} canManage={canManage} />
          <PastImports companyId={companyId} canManage={canManage} />
        </>
      )}
    </div>
  );
}

function rangeFor(period: Period): ReportRange {
  return presetRange(
    period === 'thisMonth' ? 'thisMonth' : period === 'lastMonth' ? 'lastMonth' : 'last30',
    new Date(),
  );
}

function ByVehicle({ companyId, period }: { companyId: string; period: Period }) {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const range = useMemo(() => rangeFor(period), [period]);
  const fuel = useQuery({
    queryKey: ['fuel', companyId, period],
    queryFn: () => withAccessToken((t) => costingApi.getFuel(t, companyId, range)),
    retry: false,
  });

  const columns: Column<FuelSummaryLineDto>[] = [
    {
      key: 'vehicle',
      header: 'Vehicle',
      sortValue: (l) => l.vehicleName ?? '~',
      cell: (l) => l.vehicleName ?? <span className="muted">Not matched to a vehicle</span>,
    },
    {
      key: 'purchases',
      header: 'Purchases',
      align: 'right',
      sortValue: (l) => l.purchases,
      cell: (l) => l.purchases,
    },
    {
      key: 'litres',
      header: 'Litres',
      align: 'right',
      sortValue: (l) => l.litres,
      cell: (l) => l.litres.toLocaleString('en-GB'),
    },
    {
      key: 'spent',
      header: 'Spent',
      align: 'right',
      sortValue: (l) => l.amountPence,
      cell: (l) => formatPence(l.amountPence),
    },
    {
      key: 'ppl',
      header: 'Pence a litre',
      align: 'right',
      sortValue: (l) => l.pencePerLitre ?? -1,
      cell: (l) => (l.pencePerLitre === undefined ? '–' : String(l.pencePerLitre)),
    },
  ];

  if (fuel.isPending) return <p>Loading…</p>;
  if (fuel.isError) return <p className="error">{staffErrorMessage(fuel.error)}</p>;
  const view = fuel.data;
  const averagePence =
    view.totalLitres > 0
      ? Math.round(
          view.byVehicle.reduce((sum, l) => sum + (l.litres > 0 ? l.amountPence : 0), 0) /
            view.totalLitres,
        )
      : undefined;
  return (
    <>
      <div className="report-stats">
        <Stat label="Spent on fuel" value={formatPence(view.totalPence)} />
        <Stat label="Litres" value={view.totalLitres.toLocaleString('en-GB')} />
        <Stat
          label="Average a litre"
          value={averagePence === undefined ? '–' : formatPence(averagePence)}
          note={averagePence === undefined ? 'no litres on the statement' : 'a litre'}
        />
        <Stat
          label="Not matched"
          value={String(view.unmatchedCount)}
          note={view.unmatchedCount > 0 ? 'see below' : 'every purchase has a vehicle'}
        />
      </div>
      <DataTable
        columns={columns}
        rows={view.byVehicle}
        rowKey={(l) => l.vehicleId ?? 'unmatched'}
        emptyText="No fuel in this period. Import a statement above."
      />
    </>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="report-stat">
      <div className="report-stat-value">{value}</div>
      <div className="report-stat-label">{label}</div>
      {note !== undefined && <div className="report-stat-note muted">{note}</div>}
    </div>
  );
}

function ImportStatement({ companyId }: { companyId: string }) {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const queryClient = useQueryClient();
  const [text, setText] = useState<string | undefined>(undefined);
  const [fileName, setFileName] = useState('');
  const [mapping, setMapping] = useState<Partial<FuelMapping>>({});
  const [result, setResult] = useState<ImportFuelResponse | undefined>(undefined);

  const headers = useMemo(() => (text === undefined ? [] : (parseCsv(text)[0] ?? [])), [text]);
  // When a file is chosen: what this browser remembered for the company, else a guess from the headings.
  function startMapping(csv: string): void {
    const heads = parseCsv(csv)[0] ?? [];
    const saved = loadMapping(companyId);
    const guess = guessMapping(heads);
    const keep = (name: string | undefined): string | undefined =>
      name !== undefined && heads.includes(name) ? name : undefined;
    setMapping({
      date: keep(saved?.date) ?? guess.date,
      time: keep(saved?.time) ?? guess.time,
      registration: keep(saved?.registration) ?? guess.registration,
      amount: keep(saved?.amount) ?? guess.amount,
      litres: keep(saved?.litres) ?? guess.litres,
      description: keep(saved?.description) ?? guess.description,
    });
  }

  const complete =
    mapping.date !== undefined &&
    mapping.registration !== undefined &&
    mapping.amount !== undefined;
  const read = useMemo(
    () =>
      text === undefined || !complete
        ? undefined
        : readFuel(text, {
            date: mapping.date as string,
            time: mapping.time,
            registration: mapping.registration as string,
            amount: mapping.amount as string,
            litres: mapping.litres,
            description: mapping.description,
          }),
    [text, mapping, complete],
  );

  const send = useMutation({
    mutationFn: async () => {
      if (read === undefined) throw new Error('nothing to send');
      const totals: ImportFuelResponse = {
        imported: 0,
        duplicates: 0,
        invalid: [],
        matched: 0,
        unmatched: 0,
        unmatchedRegistrations: [],
      };
      // A long statement goes in pieces. The server skips what it already holds, so a piece sent twice does no harm.
      for (let i = 0; i < read.rows.length; i += FUEL_IMPORT_MAX_ROWS) {
        const part = await withAccessToken((t) =>
          costingApi.importFuel(
            t,
            companyId,
            fileName,
            read.rows.slice(i, i + FUEL_IMPORT_MAX_ROWS),
          ),
        );
        totals.imported += part.imported;
        totals.duplicates += part.duplicates;
        totals.matched += part.matched;
        totals.unmatched += part.unmatched;
        totals.invalid.push(...part.invalid.map((r) => ({ ...r, row: r.row + i })));
        totals.unmatchedRegistrations = [
          ...new Set([...totals.unmatchedRegistrations, ...part.unmatchedRegistrations]),
        ].sort();
      }
      return totals;
    },
    onSuccess: (totals) => {
      setResult(totals);
      if (complete) {
        saveMapping(companyId, {
          date: mapping.date as string,
          time: mapping.time,
          registration: mapping.registration as string,
          amount: mapping.amount as string,
          litres: mapping.litres,
          description: mapping.description,
        });
      }
      void queryClient.invalidateQueries({ queryKey: ['fuel'] });
      void queryClient.invalidateQueries({ queryKey: ['fuel-unmatched'] });
      void queryClient.invalidateQueries({ queryKey: ['fuel-imports'] });
    },
  });

  const choose = (key: keyof FuelMapping, label: string, optional: boolean) => (
    <label key={key} style={{ display: 'block', marginBottom: 8 }}>
      <strong>{label}</strong>
      <div>
        <select
          value={mapping[key] ?? ''}
          onChange={(e) =>
            setMapping((m) => ({ ...m, [key]: e.target.value === '' ? undefined : e.target.value }))
          }
        >
          <option value="">{optional ? 'None' : 'Choose a column'}</option>
          {headers.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
      </div>
    </label>
  );

  return (
    <section className="card">
      <h2>Import a statement</h2>
      <p className="muted" style={{ fontSize: 13 }}>
        Save the statement from your fuel card provider as CSV, then choose it here. Tell it which
        column is which, and it remembers for next time. Sending the same statement twice adds
        nothing twice. Use the same basis (with or without VAT) as your other costs.
      </p>
      <input
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => {
          const file = e.target.files?.[0];
          setResult(undefined);
          if (file === undefined) return;
          setFileName(file.name);
          void file.text().then((csv) => {
            startMapping(csv);
            setText(csv);
          });
        }}
      />
      {headers.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {choose('date', 'Date', false)}
            {choose('time', 'Time (if separate)', true)}
            {choose('registration', 'Registration', false)}
            {choose('amount', 'Amount', false)}
            {choose('litres', 'Litres', true)}
            {choose('description', 'Product or site', true)}
          </div>
          {read?.problem !== undefined && <p style={{ color: 'var(--warning)' }}>{read.problem}</p>}
          {read !== undefined && read.problem === undefined && (
            <p>
              {read.rows.length} purchase{read.rows.length === 1 ? '' : 's'} read
              {read.skipped.length > 0 &&
                `, ${read.skipped.length} row${read.skipped.length === 1 ? '' : 's'} left out (${read.skipped
                  .slice(0, 3)
                  .map((s) => `line ${s.line}: ${s.why}`)
                  .join('; ')}${read.skipped.length > 3 ? '; …' : ''})`}
              .{' '}
              <button
                type="button"
                className="btn-primary"
                disabled={send.isPending}
                onClick={() => send.mutate()}
              >
                {send.isPending ? 'Importing…' : 'Import them'}
              </button>
            </p>
          )}
        </div>
      )}
      {send.isError && <p className="error">{staffErrorMessage(send.error)}</p>}
      {result !== undefined && (
        <div>
          <p>
            <strong>{result.imported}</strong> imported ({result.matched} matched to a vehicle
            {result.unmatched > 0 ? `, ${result.unmatched} not matched` : ''})
            {result.duplicates > 0 && `, ${result.duplicates} already there`}.
          </p>
          {result.unmatchedRegistrations.length > 0 && (
            <p style={{ color: 'var(--warning)' }}>
              No vehicle has the registration {result.unmatchedRegistrations.join(', ')}. Add it on
              Vehicle profiles, then choose Match again below, or match them by hand.
            </p>
          )}
          {result.invalid.length > 0 && (
            <ul>
              {result.invalid.slice(0, 5).map((r) => (
                <li key={r.row}>
                  Row {r.row} was not imported: {INVALID_REASONS[r.reason]}.
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function Unmatched({ companyId, canManage }: { companyId: string; canManage: boolean }) {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const queryClient = useQueryClient();
  const unmatched = useQuery({
    queryKey: ['fuel-unmatched', companyId],
    queryFn: () => withAccessToken((t) => costingApi.listUnmatchedFuel(t, companyId)),
    retry: false,
  });
  const vehicles = useQuery({
    queryKey: ['fleet-vehicles', companyId],
    queryFn: () => withAccessToken((t) => fleetApi.listFleetVehicles(t, companyId)),
    enabled: canManage,
    retry: false,
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['fuel'] });
    void queryClient.invalidateQueries({ queryKey: ['fuel-unmatched'] });
  };
  const assign = useMutation({
    mutationFn: (p: { id: string; vehicleId: string }) =>
      withAccessToken((t) => costingApi.assignFuelVehicle(t, p.id, p.vehicleId)),
    onSuccess: refresh,
  });
  const rematch = useMutation({
    mutationFn: () => withAccessToken((t) => costingApi.rematchFuel(t, companyId)),
    onSuccess: refresh,
  });

  const rows = unmatched.data ?? [];
  if (rows.length === 0) return null;
  const columns: Column<FuelTransactionDto>[] = [
    {
      key: 'when',
      header: 'When',
      sortValue: (t) => t.occurredAt,
      cell: (t) => dateTimeText(t.occurredAt),
    },
    {
      key: 'reg',
      header: 'Registration',
      sortValue: (t) => t.registration,
      cell: (t) => t.registration,
    },
    { key: 'what', header: 'What', cell: (t) => t.description ?? '' },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      sortValue: (t) => t.amountPence,
      cell: (t) => formatPence(t.amountPence),
    },
    ...(canManage
      ? [
          {
            key: 'match',
            header: 'Match to',
            cell: (t: FuelTransactionDto) => (
              <select
                value=""
                disabled={assign.isPending}
                onChange={(e) =>
                  e.target.value !== '' && assign.mutate({ id: t.id, vehicleId: e.target.value })
                }
              >
                <option value="">Choose a vehicle</option>
                {(vehicles.data ?? []).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.registration === undefined ? v.name : `${v.name} (${v.registration})`}
                  </option>
                ))}
              </select>
            ),
          },
        ]
      : []),
  ];
  return (
    <section style={{ marginTop: 24 }}>
      <h2>Needs matching ({rows.length})</h2>
      <p className="muted" style={{ fontSize: 13 }}>
        These purchases are on your statements but no vehicle has the registration. Add the
        registration on Vehicle profiles and match again, or match each by hand.
      </p>
      {canManage && (
        <p>
          <button type="button" disabled={rematch.isPending} onClick={() => rematch.mutate()}>
            {rematch.isPending ? 'Matching…' : 'Match again'}
          </button>
          {rematch.isSuccess && <span className="muted"> {rematch.data} matched.</span>}
        </p>
      )}
      {(assign.isError || rematch.isError) && (
        <p className="error">{staffErrorMessage(assign.error ?? rematch.error)}</p>
      )}
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(t) => t.id}
        searchText={(t) => `${t.registration} ${t.description ?? ''}`}
        emptyText="Everything is matched."
      />
    </section>
  );
}

function PastImports({ companyId, canManage }: { companyId: string; canManage: boolean }) {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const queryClient = useQueryClient();
  const imports = useQuery({
    queryKey: ['fuel-imports', companyId],
    queryFn: () => withAccessToken((t) => costingApi.listFuelImports(t, companyId)),
    retry: false,
  });
  const undo = useMutation({
    mutationFn: (id: string) => withAccessToken((t) => costingApi.undoFuelImport(t, id)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['fuel'] });
      void queryClient.invalidateQueries({ queryKey: ['fuel-unmatched'] });
      void queryClient.invalidateQueries({ queryKey: ['fuel-imports'] });
    },
  });
  const list = imports.data ?? [];
  if (list.length === 0) return null;
  return (
    <section style={{ marginTop: 24 }}>
      <h2>Past imports</h2>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {list.map((i) => (
          <li
            key={i.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              padding: '10px 0',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <div>
              <strong>{i.fileName}</strong>
              <div className="muted" style={{ fontSize: 13 }}>
                {dateTimeText(i.importedAt)}: {i.rowsImported} purchase
                {i.rowsImported === 1 ? '' : 's'} added
                {i.rowsDuplicate > 0 ? `, ${i.rowsDuplicate} already there` : ''}
              </div>
            </div>
            {canManage && (
              <button
                type="button"
                className="btn-caution"
                disabled={undo.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      `Undo ${i.fileName}? The ${i.rowsImported} purchases it added are removed.`,
                    )
                  ) {
                    undo.mutate(i.id);
                  }
                }}
              >
                Undo
              </button>
            )}
          </li>
        ))}
      </ul>
      {undo.isError && <p className="error">{staffErrorMessage(undo.error)}</p>}
    </section>
  );
}
