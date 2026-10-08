import { COST_CATEGORIES, type CostDto, type FinanceReportDto } from '@wagonwise/contracts/billing';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import * as billingApi from '../../api/billing';
import { DataTable, type Column } from '../../components/DataTable';
import { monthLabel } from '../../lib/invoice-print';
import { formatPence, parsePounds } from '../../lib/money';
import { useStaffAuthStore } from '../../state/staff-auth-store';
import { staffErrorMessage } from '../staff/messages';

type Category = (typeof COST_CATEGORIES)[number];

const CATEGORY_LABELS: Record<Category, string> = {
  hosting: 'Hosting',
  maps: 'Maps and routing',
  messaging: 'Email and text',
  software: 'Software and tools',
  wages: 'Wages or your time',
  other: 'Other',
};

const KEY = ['finance'] as const;
const colour = (pence: number): string => (pence < 0 ? '#dc2626' : '#15803d');

/** When a cost applies, in words: "Carries on from August 2026", "Just September 2026", "August to October 2026". */
function whenText(c: CostDto): string {
  if (c.toMonth === undefined) return `Carries on from ${monthLabel(c.fromMonth)}`;
  if (c.toMonth === c.fromMonth) return `Just ${monthLabel(c.fromMonth)}`;
  return `${monthLabel(c.fromMonth)} to ${monthLabel(c.toMonth)}`;
}

/**
 * WagonWise's own finances (admins only). Enter what it costs to run: each cost carries on every month until you
 * change or stop it, so most are entered once. Revenue comes from the invoices already issued. Profit is shown on
 * what was invoiced for the month, with what has actually been received beside it. Amounts are ex VAT.
 */
export function Finances() {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const [month, setMonth] = useState<string | undefined>(undefined);

  const report = useQuery({
    queryKey: [...KEY, month],
    queryFn: () => withAccessToken((token) => billingApi.getFinanceReport(token, month)),
  });

  return (
    <div>
      <h1>Finances</h1>
      <p style={{ color: '#6b7280' }}>
        What it costs to run WagonWise, against what companies are invoiced. Costs carry on every
        month until you change or stop them. Enter amounts without VAT.
      </p>
      {report.isError && <p style={{ color: '#dc2626' }}>{staffErrorMessage(report.error)}</p>}
      {report.isPending ? (
        <p>Loading…</p>
      ) : (
        report.data !== undefined && <Report data={report.data} onMonth={setMonth} />
      )}
    </div>
  );
}

function Report({ data, onMonth }: { data: FinanceReportDto; onMonth: (m: string) => void }) {
  const selected = data.months.find((m) => m.month === data.month);
  const p = data.projection;
  return (
    <>
      <label style={{ display: 'block', marginBottom: 16 }}>
        Month{' '}
        <input
          type="month"
          value={data.month}
          onChange={(e) => e.target.value && onMonth(e.target.value)}
        />
      </label>

      {selected !== undefined && (
        <section style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
          <Figure label="Invoiced" value={selected.invoicedPence} />
          <Figure label="Received" value={selected.receivedPence} />
          <Figure label="Costs" value={selected.costsPence} />
          <Figure label="Profit (invoiced)" value={selected.profitInvoicedPence} coloured big />
          <Figure label="Profit (received)" value={selected.profitReceivedPence} coloured />
        </section>
      )}

      <h2>Costs in {monthLabel(data.month)}</h2>
      <Costs month={data.month} costs={data.costs} />

      <h2>Where the revenue came from</h2>
      <DataTable
        columns={[
          { key: 'name', header: 'Company', sortValue: (r) => r.name, cell: (r) => r.name },
          {
            key: 'inv',
            header: 'Invoiced',
            align: 'right',
            sortValue: (r) => r.invoicedPence,
            cell: (r) => formatPence(r.invoicedPence),
          },
          {
            key: 'rec',
            header: 'Received',
            align: 'right',
            sortValue: (r) => r.receivedPence,
            cell: (r) => formatPence(r.receivedPence),
          },
        ]}
        rows={data.revenueByCompany}
        rowKey={(r) => r.companyId}
        emptyText="Nothing invoiced for this month yet."
      />

      <h2>Looking ahead</h2>
      <p style={{ color: '#6b7280' }}>
        On today&apos;s plans and the costs standing this month. Nothing here is guaranteed.
      </p>
      <section style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        <Figure
          label={`Revenue a month (${p.vehiclesCovered} vehicles)`}
          value={p.monthlyRevenuePence}
        />
        <Figure label="Costs a month" value={p.monthlyCostsPence} />
        <Figure label="Profit a month" value={p.projectedProfitPence} coloured big />
      </section>
      {p.breakEvenVehicles !== null && (
        <p>
          At an average of {formatPence(p.averagePricePence)} a vehicle, you break even at{' '}
          <strong>{p.breakEvenVehicles}</strong> vehicles
          {p.vehiclesCovered >= p.breakEvenVehicles
            ? ', which you have reached.'
            : `, ${p.breakEvenVehicles - p.vehiclesCovered} more than you have now.`}
        </p>
      )}

      <h2>The last twelve months</h2>
      <DataTable
        columns={[
          { key: 'm', header: 'Month', cell: (r) => monthLabel(r.month) },
          {
            key: 'inv',
            header: 'Invoiced',
            align: 'right',
            cell: (r) => formatPence(r.invoicedPence),
          },
          {
            key: 'rec',
            header: 'Received',
            align: 'right',
            cell: (r) => formatPence(r.receivedPence),
          },
          { key: 'cost', header: 'Costs', align: 'right', cell: (r) => formatPence(r.costsPence) },
          {
            key: 'pi',
            header: 'Profit (invoiced)',
            align: 'right',
            cell: (r) => (
              <strong style={{ color: colour(r.profitInvoicedPence) }}>
                {formatPence(r.profitInvoicedPence)}
              </strong>
            ),
          },
          {
            key: 'pr',
            header: 'Profit (received)',
            align: 'right',
            cell: (r) => (
              <span style={{ color: colour(r.profitReceivedPence) }}>
                {formatPence(r.profitReceivedPence)}
              </span>
            ),
          },
        ]}
        rows={[...data.months].reverse()}
        rowKey={(r) => r.month}
        emptyText="Nothing yet."
        pageSize={12}
      />
    </>
  );
}

function Figure({
  label,
  value,
  coloured,
  big,
}: {
  label: string;
  value: number;
  coloured?: boolean;
  big?: boolean;
}) {
  return (
    <div
      style={{ padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: 8, minWidth: 130 }}
    >
      <div style={{ color: '#6b7280', fontSize: 13 }}>{label}</div>
      <div
        style={{
          fontSize: big === true ? 24 : 18,
          fontWeight: 700,
          color: coloured === true ? colour(value) : undefined,
        }}
      >
        {formatPence(value)}
      </div>
    </div>
  );
}

function Costs({ month, costs }: { month: string; costs: CostDto[] }) {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const queryClient = useQueryClient();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: KEY });
  const [editing, setEditing] = useState<string | undefined>(undefined);
  const remove = useMutation({
    mutationFn: (id: string) => withAccessToken((token) => billingApi.deleteCost(token, id)),
    onSuccess: () => {
      setEditing(undefined);
      refresh();
    },
  });

  const columns: Column<CostDto>[] = [
    {
      key: 'cat',
      header: 'Type',
      sortValue: (c) => c.category,
      cell: (c) => CATEGORY_LABELS[c.category],
    },
    { key: 'desc', header: 'What', sortValue: (c) => c.description, cell: (c) => c.description },
    {
      key: 'amount',
      header: 'A month',
      align: 'right',
      sortValue: (c) => c.amountPence,
      cell: (c) => formatPence(c.amountPence),
    },
    { key: 'when', header: 'Applies', cell: whenText },
    {
      key: 'edit',
      header: '',
      align: 'right',
      cell: (c) => (
        <button type="button" onClick={() => setEditing(c.id)}>
          Change
        </button>
      ),
    },
  ];
  const total = costs.reduce((sum, c) => sum + c.amountPence, 0);
  const selected = costs.find((c) => c.id === editing);

  return (
    <>
      <DataTable
        columns={columns}
        rows={costs}
        rowKey={(c) => c.id}
        emptyText="No costs entered for this month. Add one below."
      />
      <p>
        <strong>Total: {formatPence(total)}</strong>
      </p>
      {remove.isError && <p style={{ color: '#dc2626' }}>{staffErrorMessage(remove.error)}</p>}
      {selected !== undefined && (
        <EditCost
          key={selected.id}
          cost={selected}
          month={month}
          onDone={() => {
            setEditing(undefined);
            refresh();
          }}
          onDelete={() => {
            if (
              window.confirm(
                'Remove this entry altogether? Use this only for one entered by mistake.',
              )
            ) {
              remove.mutate(selected.id);
            }
          }}
        />
      )}
      <AddCost month={month} onAdded={refresh} />
    </>
  );
}

function AddCost({ month, onAdded }: { month: string; onAdded: () => void }) {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const [category, setCategory] = useState<Category>('hosting');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [oneOff, setOneOff] = useState(false);
  const pence = parsePounds(amount);

  const add = useMutation({
    mutationFn: () =>
      withAccessToken((token) =>
        billingApi.addCost(token, {
          category,
          description,
          amountPence: pence as number,
          fromMonth: month,
          oneOff,
        }),
      ),
    onSuccess: () => {
      setDescription('');
      setAmount('');
      setOneOff(false);
      onAdded();
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (pence !== undefined && description.trim() !== '') add.mutate();
      }}
      style={{ marginTop: 16, padding: 16, border: '1px solid #e5e7eb', borderRadius: 8 }}
    >
      <strong>Add a cost from {monthLabel(month)}</strong>
      <div
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 8 }}
      >
        <label>
          <span style={{ display: 'block' }}>Type</span>
          <select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
            {COST_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span style={{ display: 'block' }}>What</span>
          <input
            value={description}
            maxLength={120}
            placeholder="For example: DigitalOcean servers"
            onChange={(e) => setDescription(e.target.value)}
            style={{ width: 260 }}
          />
        </label>
        <label>
          <span style={{ display: 'block' }}>Amount a month (£)</span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={{ width: 110 }}
          />
        </label>
        <label>
          <input type="checkbox" checked={oneOff} onChange={(e) => setOneOff(e.target.checked)} />{' '}
          Just this month
        </label>
        <button
          type="submit"
          disabled={pence === undefined || description.trim() === '' || add.isPending}
        >
          {add.isPending ? 'Adding…' : 'Add cost'}
        </button>
      </div>
      {!oneOff && (
        <p style={{ color: '#6b7280', fontSize: 13 }}>
          It carries on every month from {monthLabel(month)} until you change or stop it.
        </p>
      )}
      {add.isError && <p style={{ color: '#dc2626' }}>{staffErrorMessage(add.error)}</p>}
    </form>
  );
}

function EditCost({
  cost,
  month,
  onDone,
  onDelete,
}: {
  cost: CostDto;
  month: string;
  onDone: () => void;
  onDelete: () => void;
}) {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const [category, setCategory] = useState<Category>(cost.category);
  const [description, setDescription] = useState(cost.description);
  const [amount, setAmount] = useState((cost.amountPence / 100).toFixed(2));
  const pence = parsePounds(amount);

  const save = useMutation({
    mutationFn: () =>
      withAccessToken((token) =>
        billingApi.changeCost(token, cost.id, {
          category,
          description,
          amountPence: pence as number,
          fromMonth: month,
        }),
      ),
    onSuccess: onDone,
  });
  const stop = useMutation({
    mutationFn: () => withAccessToken((token) => billingApi.stopCost(token, cost.id, month)),
    onSuccess: onDone,
  });

  return (
    <section style={{ marginTop: 16, padding: 16, border: '1px solid #e5e7eb', borderRadius: 8 }}>
      <strong>
        {cost.description}: {whenText(cost)}
      </strong>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (pence !== undefined && description.trim() !== '') save.mutate();
        }}
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 8 }}
      >
        <label>
          <span style={{ display: 'block' }}>Type</span>
          <select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
            {COST_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span style={{ display: 'block' }}>What</span>
          <input
            value={description}
            maxLength={120}
            onChange={(e) => setDescription(e.target.value)}
            style={{ width: 260 }}
          />
        </label>
        <label>
          <span style={{ display: 'block' }}>Amount a month (£)</span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={{ width: 110 }}
          />
        </label>
        <button
          type="submit"
          disabled={pence === undefined || description.trim() === '' || save.isPending}
        >
          {save.isPending ? 'Saving…' : `Change from ${monthLabel(month)}`}
        </button>
      </form>
      <p style={{ color: '#6b7280', fontSize: 13 }}>
        The months before {monthLabel(month)} keep what they had, so past profit does not move.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" disabled={stop.isPending} onClick={() => stop.mutate()}>
          Stop from {monthLabel(month)}
        </button>
        <button type="button" onClick={onDelete}>
          Remove entry
        </button>
      </div>
      {(save.isError || stop.isError) && (
        <p style={{ color: '#dc2626' }}>{staffErrorMessage(save.error ?? stop.error)}</p>
      )}
    </section>
  );
}
