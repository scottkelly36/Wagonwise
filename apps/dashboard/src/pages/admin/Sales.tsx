import { useQuery } from '@tanstack/react-query';
import type { EntryDto, ProspectDto, SalesStage } from '@wagonwise/contracts/sales';
import { SALES_STAGES } from '@wagonwise/contracts/sales';
import { useMemo, useState } from 'react';
import * as salesApi from '../../api/sales';
import { Badge, type BadgeTone } from '../../components/Badge';
import { DataTable, type Column } from '../../components/DataTable';
import { ErrorNotice } from '../../components/ErrorNotice';
import { Loading } from '../../components/Loading';
import { SalesFirmDetail } from '../../components/SalesFirmDetail';
import { SalesFirmForm } from '../../components/SalesFirmForm';
import { SalesImport } from '../../components/SalesImport';
import {
  dueToday,
  formatDate,
  isActive,
  localDateString,
  PITCH_LABELS,
  pitchSummary,
  STAGE_LABELS,
  TARGETS,
  weeklyCounts,
} from '../../lib/sales';
import { useStaffAuthStore } from '../../state/staff-auth-store';

type Filter = 'active' | 'all' | SalesStage;

const TONES: Record<SalesStage, BadgeTone> = {
  not_contacted: 'neutral',
  contacted: 'info',
  replied: 'info',
  conversation: 'info',
  demo: 'ok',
  pilot: 'ok',
  paying: 'ok',
  not_interested: 'neutral',
  do_not_contact: 'danger',
};

const lastContact = (entries: readonly EntryDto[]): string | undefined =>
  entries.map((e) => e.at).sort((a, b) => b.localeCompare(a))[0];

/**
 * WagonWise's own sales notebook, for WagonWise staff only: the haulage firms being approached, a log of each contact, what
 * is due today, and how the week compares with the targets. It records what the owner did and sends nothing to anyone.
 */
export function Sales() {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const sales = useQuery({
    queryKey: ['sales'],
    queryFn: () => withAccessToken((token) => salesApi.getSales(token)),
  });

  const [filter, setFilter] = useState<Filter>('active');
  const [open, setOpen] = useState<string | undefined>(undefined);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);

  const prospects = useMemo(() => sales.data?.prospects ?? [], [sales.data]);
  const entries = useMemo(() => sales.data?.entries ?? [], [sales.data]);
  const byFirm = useMemo(() => {
    const map = new Map<string, EntryDto[]>();
    for (const e of entries) map.set(e.prospectId, [...(map.get(e.prospectId) ?? []), e]);
    return map;
  }, [entries]);

  const now = new Date();
  const counts = weeklyCounts(entries, now);
  const due = dueToday(prospects, entries, now);
  const pitches = pitchSummary(entries);
  const today = localDateString(now);

  const shown = prospects.filter((p) =>
    filter === 'all' ? true : filter === 'active' ? isActive(p.stage) : p.stage === filter,
  );

  const openFirm = (id: string) => {
    setFilter('all');
    setOpen(id);
    window.setTimeout(
      () => document.getElementById('sales-firms')?.scrollIntoView({ behavior: 'smooth' }),
      0,
    );
  };

  const columns: Column<ProspectDto>[] = [
    {
      key: 'name',
      header: 'Firm',
      sortValue: (p) => p.name.toLowerCase(),
      cell: (p) => (
        <>
          <strong>{p.name}</strong>
          {p.town === undefined ? null : <span className="text-muted text-13 block">{p.town}</span>}
        </>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      sortValue: (p) => (p.email ?? '').toLowerCase(),
      cell: (p) =>
        p.email === undefined ? (
          <span className="text-muted text-13">Not recorded</span>
        ) : (
          <span className="text-13">{p.email}</span>
        ),
    },
    {
      key: 'fleet',
      header: 'Lorries',
      align: 'right',
      sortValue: (p) => p.fleetSize ?? -1,
      cell: (p) => (p.fleetSize === undefined ? '' : `about ${p.fleetSize}`),
    },
    {
      key: 'stage',
      header: 'Stage',
      sortValue: (p) => SALES_STAGES.indexOf(p.stage),
      cell: (p) => (
        <Badge
          tone={TONES[p.stage]}
          {...(p.stage === 'do_not_contact' ? { icon: 'stop' as const } : {})}
        >
          {STAGE_LABELS[p.stage]}
        </Badge>
      ),
    },
    {
      key: 'last',
      header: 'Last contact',
      sortValue: (p) => lastContact(byFirm.get(p.id) ?? []) ?? '',
      cell: (p) => {
        const last = lastContact(byFirm.get(p.id) ?? []);
        return last === undefined ? '' : new Date(last).toLocaleDateString('en-GB');
      },
    },
    {
      key: 'next',
      header: 'Next step',
      sortValue: (p) => p.nextStepOn ?? '9999',
      cell: (p) =>
        p.nextStep === undefined && p.nextStepOn === undefined ? (
          ''
        ) : (
          // Two lines at most: a long note would make the row tall. The whole text is in the tooltip and the open firm.
          <span
            title={p.nextStep}
            className={
              p.nextStepOn !== undefined && p.nextStepOn <= today && isActive(p.stage)
                ? 'text-warning'
                : ''
            }
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              maxWidth: 280,
            }}
          >
            {p.nextStep ?? ''}
            {p.nextStepOn === undefined ? '' : ` (${formatDate(p.nextStepOn)})`}
          </span>
        ),
    },
    {
      key: 'open',
      header: '',
      align: 'right',
      cell: (p) => (
        <button
          type="button"
          aria-expanded={open === p.id}
          onClick={() => setOpen(open === p.id ? undefined : p.id)}
        >
          {open === p.id ? 'Close' : 'Open'}
        </button>
      ),
    },
  ];

  const tiles: { key: string; label: string; value: number; target: string }[] = [
    {
      key: 'contacted',
      label: 'New firms contacted',
      value: counts.contacted,
      target: TARGETS.contacted.text,
    },
    { key: 'replied', label: 'Replies', value: counts.replied, target: TARGETS.replied.text },
    {
      key: 'conversations',
      label: 'Conversations',
      value: counts.conversations,
      target: TARGETS.conversations.text,
    },
    { key: 'demos', label: 'Demos', value: counts.demos, target: TARGETS.demos.text },
    {
      key: 'pilots',
      label: 'Pilots this month',
      value: counts.pilotsThisMonth,
      target: TARGETS.pilotsThisMonth.text,
    },
  ];

  return (
    <div>
      <h1>Sales</h1>
      <p className="text-muted">
        The firms you are approaching, and what happened each time. This is a notebook: nothing here
        is sent to anyone.
      </p>

      {sales.isError && <ErrorNotice error={sales.error} />}
      {sales.isPending ? (
        <Loading />
      ) : (
        <>
          <h2>This week</h2>
          <div className="home-tiles">
            {tiles.map((t) => (
              <div key={t.key} className="home-tile">
                <span className="home-tile-label">{t.label}</span>
                <span className="home-tile-value">{t.value}</span>
                <span className="home-tile-sub">target {t.target}</span>
              </div>
            ))}
          </div>
          <p className="text-muted text-13">
            Firms, not messages: two calls to one firm count once. A firm counts as contacted in the
            week of its first entry.
          </p>

          <h2>Do today</h2>
          {due.length === 0 ? (
            <p className="text-muted">
              Nothing is due. Pick a firm below and log a contact, or add a next step so it comes up
              here.
            </p>
          ) : (
            <ul className="mt-0">
              {due.map((item) => (
                <li key={item.prospect.id} className="mb-8">
                  <strong>{item.prospect.name}</strong>: {item.reason}{' '}
                  <button type="button" onClick={() => openFirm(item.prospect.id)}>
                    Open
                  </button>
                </li>
              ))}
            </ul>
          )}

          <h2 id="sales-firms">Firms</h2>
          <div className="flex gap-8 wrap mb-12">
            <button
              type="button"
              className="btn-primary"
              onClick={() => setAdding(true)}
              disabled={adding}
            >
              Add a firm
            </button>
            <button type="button" onClick={() => setImporting(true)} disabled={importing}>
              Import from a spreadsheet
            </button>
          </div>
          {adding && (
            <SalesFirmForm onDone={() => setAdding(false)} onCancel={() => setAdding(false)} />
          )}
          {importing && <SalesImport onClose={() => setImporting(false)} />}

          <DataTable
            columns={columns}
            rows={shown}
            rowKey={(p) => p.id}
            pageSize={200}
            searchText={(p) => `${p.name} ${p.town ?? ''} ${p.haulageType ?? ''}`}
            expandedKey={open}
            renderDetail={(p) => (
              <SalesFirmDetail
                key={p.id}
                firm={p}
                entries={byFirm.get(p.id) ?? []}
                onDeleted={() => setOpen(undefined)}
              />
            )}
            toolbar={
              <select
                aria-label="Show"
                value={filter}
                onChange={(e) => setFilter(e.target.value as Filter)}
              >
                <option value="active">
                  Still to chase ({prospects.filter((p) => isActive(p.stage)).length})
                </option>
                <option value="all">Everyone ({prospects.length})</option>
                {SALES_STAGES.map((stage) => (
                  <option key={stage} value={stage}>
                    {STAGE_LABELS[stage]} ({prospects.filter((p) => p.stage === stage).length})
                  </option>
                ))}
              </select>
            }
            emptyText={
              prospects.length === 0
                ? 'No firms yet. Add one, or import your prospects spreadsheet.'
                : 'No firms in this view.'
            }
          />

          {pitches.length > 0 && (
            <>
              <h2>Which pitch gets answers</h2>
              <p className="text-muted text-13">
                For each problem you led with: how many firms it was used on, and how many of those
                have replied or gone further. A small number says very little; look again after
                about twenty firms.
              </p>
              <ul className="mt-0">
                {pitches.map((row) => (
                  <li key={row.pitch}>
                    <strong>{PITCH_LABELS[row.pitch]}</strong>: used on {row.firms} firm
                    {row.firms === 1 ? '' : 's'}, {row.replied} replied or further
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}
