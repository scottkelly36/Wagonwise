import type { DriverRatesDto, RunningCostDto } from '@wagonwise/contracts/costing';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import * as costingApi from '../../api/costing';
import * as fleetApi from '../../api/fleet';
import { CompanySelect } from '../../components/CompanySelect';
import { DataTable, type Column } from '../../components/DataTable';
import { formatPence, parsePounds, ukToday } from '../../lib/money';
import { holds, isPlatform } from '../../state/access';
import { useStaffAuthStore } from '../../state/staff-auth-store';
import { staffErrorMessage } from '../staff/messages';

const monthOf = (day: string): string => day.slice(0, 7);

const monthText = (month: string): string =>
  new Date(`${month}-01T00:00:00.000Z`).toLocaleDateString('en-GB', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

const dayText = (day: string): string =>
  new Date(`${day}T00:00:00.000Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

/**
 * Costs: the firm's own running costs (finance, insurance, road tax, the office...) and what each driver costs an hour.
 * They are what the cost of a job is worked out from. They need `manage_billing`, since wages are private. A cost is entered
 * once and carries on until changed or stopped; changing it from a month keeps the earlier months as they were.
 */
export function Costs() {
  const me = useStaffAuthStore((s) => s.session?.staff);
  const everyCompany = isPlatform(me);
  const allowed = everyCompany || holds(me, 'manage_billing');
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const companyId = everyCompany ? selectedCompanyId || undefined : me?.companyId;

  return (
    <div>
      <h1>Costs</h1>
      <p style={{ color: 'var(--text-muted)' }}>
        What your vehicles and drivers cost to run. Enter each cost once and it carries on every
        month until you change or stop it. Fuel comes from the Fuel page. Together these are what
        the cost of a job is worked out from.
      </p>
      {everyCompany && (
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="costs-company">Company </label>
          <CompanySelect
            id="costs-company"
            value={selectedCompanyId}
            onChange={setSelectedCompanyId}
            emptyLabel="Choose a company"
          />
        </div>
      )}
      {!allowed ? (
        <p>Only the person who looks after your money can see this page.</p>
      ) : companyId === undefined ? (
        <p>Choose a company.</p>
      ) : (
        <>
          <RunningCosts companyId={companyId} />
          <DriverPay companyId={companyId} />
        </>
      )}
    </div>
  );
}

type Editing = { id: string; mode: 'change' | 'stop'; cost: RunningCostDto } | undefined;

function RunningCosts({ companyId }: { companyId: string }) {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const queryClient = useQueryClient();
  const costs = useQuery({
    queryKey: ['running-costs', companyId],
    queryFn: () => withAccessToken((t) => costingApi.listRunningCosts(t, companyId)),
    retry: false,
  });
  const vehicles = useQuery({
    queryKey: ['fleet-vehicles', companyId],
    queryFn: () => withAccessToken((t) => fleetApi.listFleetVehicles(t, companyId)),
    retry: false,
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['running-costs'] });
  const name = (vehicleId: string | undefined): string =>
    vehicleId === undefined
      ? 'The whole firm'
      : (vehicles.data?.find((v) => v.id === vehicleId)?.name ?? 'A vehicle');

  const thisMonth = monthOf(ukToday());
  const [form, setForm] = useState({
    vehicleId: '',
    description: '',
    pounds: '',
    fromMonth: thisMonth,
  });
  const amount = form.pounds.trim() === '' ? undefined : parsePounds(form.pounds);
  const add = useMutation({
    mutationFn: () =>
      withAccessToken((t) =>
        costingApi.addRunningCost(t, companyId, {
          ...(form.vehicleId === '' ? {} : { vehicleId: form.vehicleId }),
          description: form.description,
          monthlyPence: amount ?? 0,
          fromMonth: form.fromMonth,
        }),
      ),
    onSuccess: () => {
      setForm((f) => ({ ...f, description: '', pounds: '' }));
      refresh();
    },
  });

  const [editing, setEditing] = useState<Editing>(undefined);
  const [edit, setEdit] = useState({ description: '', pounds: '', fromMonth: thisMonth });
  const editAmount = edit.pounds.trim() === '' ? undefined : parsePounds(edit.pounds);
  const change = useMutation({
    mutationFn: (id: string) =>
      withAccessToken((t) =>
        costingApi.changeRunningCost(t, id, {
          description: edit.description,
          monthlyPence: editAmount ?? 0,
          fromMonth: edit.fromMonth,
        }),
      ),
    onSuccess: () => {
      setEditing(undefined);
      refresh();
    },
  });
  const stop = useMutation({
    mutationFn: (id: string) =>
      withAccessToken((t) => costingApi.stopRunningCost(t, id, edit.fromMonth)),
    onSuccess: () => {
      setEditing(undefined);
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => withAccessToken((t) => costingApi.deleteRunningCost(t, id)),
    onSuccess: refresh,
  });

  const rows = costs.data ?? [];
  const columns: Column<RunningCostDto>[] = [
    { key: 'what', header: 'What', sortValue: (c) => c.description, cell: (c) => c.description },
    {
      key: 'for',
      header: 'For',
      sortValue: (c) => name(c.vehicleId),
      cell: (c) => name(c.vehicleId),
    },
    {
      key: 'amount',
      header: 'A month',
      align: 'right',
      sortValue: (c) => c.monthlyPence,
      cell: (c) => formatPence(c.monthlyPence),
    },
    {
      key: 'from',
      header: 'From',
      sortValue: (c) => c.fromMonth,
      cell: (c) => monthText(c.fromMonth),
    },
    {
      key: 'to',
      header: 'Until',
      sortValue: (c) => c.toMonth ?? '9999',
      cell: (c) =>
        c.toMonth === undefined ? <span className="muted">Carries on</span> : monthText(c.toMonth),
    },
    {
      key: 'act',
      header: '',
      align: 'right',
      cell: (c) => (
        <span style={{ display: 'inline-flex', gap: 6 }}>
          {c.toMonth === undefined && (
            <>
              <button
                type="button"
                onClick={() => {
                  setEdit({
                    description: c.description,
                    pounds: (c.monthlyPence / 100).toFixed(2),
                    fromMonth: thisMonth,
                  });
                  setEditing({ id: c.id, mode: 'change', cost: c });
                }}
              >
                Change
              </button>
              <button
                type="button"
                className="btn-caution"
                onClick={() => {
                  setEdit((e) => ({ ...e, fromMonth: thisMonth }));
                  setEditing({ id: c.id, mode: 'stop', cost: c });
                }}
              >
                Stop
              </button>
            </>
          )}
          <button
            type="button"
            className="btn-danger"
            disabled={remove.isPending}
            onClick={() => {
              if (
                window.confirm(
                  `Remove ${c.description} altogether? Use Stop for a cost that was real.`,
                )
              ) {
                remove.mutate(c.id);
              }
            }}
          >
            Remove
          </button>
        </span>
      ),
    },
  ];

  return (
    <section style={{ marginBottom: 32 }}>
      <h2>Running costs</h2>
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          if (amount !== undefined) add.mutate();
        }}
      >
        <div className="field-row">
          <div className="field">
            <label htmlFor="cost-for">For</label>
            <select
              id="cost-for"
              value={form.vehicleId}
              onChange={(e) => setForm({ ...form, vehicleId: e.target.value })}
            >
              <option value="">The whole firm (an overhead)</option>
              {(vehicles.data ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.registration === undefined ? v.name : `${v.name} (${v.registration})`}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="cost-what">What</label>
            <input
              id="cost-what"
              value={form.description}
              maxLength={80}
              placeholder="Insurance"
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="cost-amount">A month, in £</label>
            <input
              id="cost-amount"
              inputMode="decimal"
              value={form.pounds}
              placeholder="180.00"
              onChange={(e) => setForm({ ...form, pounds: e.target.value })}
              aria-invalid={form.pounds.trim() !== '' && amount === undefined}
            />
          </div>
          <div className="field">
            <label htmlFor="cost-from">From</label>
            <input
              id="cost-from"
              type="month"
              value={form.fromMonth}
              onChange={(e) => setForm({ ...form, fromMonth: e.target.value })}
            />
          </div>
          <button
            type="submit"
            disabled={add.isPending || amount === undefined || form.description.trim() === ''}
          >
            {add.isPending ? 'Adding…' : 'Add'}
          </button>
        </div>
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>
          A vehicle's costs (finance, insurance, road tax, a service plan) are spread over the jobs
          that vehicle does. An overhead belongs to the firm and is shown on its own, not added to a
          job.
        </p>
      </form>

      {editing !== undefined && (
        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault();
            if (editing.mode === 'change' && editAmount !== undefined) change.mutate(editing.id);
            if (editing.mode === 'stop') stop.mutate(editing.id);
          }}
        >
          <h2>
            {editing.mode === 'change' ? 'Change' : 'Stop'} {editing.cost.description}
          </h2>
          <div className="field-row">
            {editing.mode === 'change' && (
              <>
                <div className="field">
                  <label htmlFor="edit-what">What</label>
                  <input
                    id="edit-what"
                    value={edit.description}
                    maxLength={80}
                    onChange={(e) => setEdit({ ...edit, description: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="edit-amount">A month, in £</label>
                  <input
                    id="edit-amount"
                    inputMode="decimal"
                    value={edit.pounds}
                    onChange={(e) => setEdit({ ...edit, pounds: e.target.value })}
                  />
                </div>
              </>
            )}
            <div className="field">
              <label htmlFor="edit-from">
                {editing.mode === 'change' ? 'From' : 'Last applies the month before'}
              </label>
              <input
                id="edit-from"
                type="month"
                value={edit.fromMonth}
                onChange={(e) => setEdit({ ...edit, fromMonth: e.target.value })}
              />
            </div>
          </div>
          <p className="muted" style={{ fontSize: 13 }}>
            Months before this keep the amount they had.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="submit"
              disabled={
                change.isPending ||
                stop.isPending ||
                (editing.mode === 'change' && editAmount === undefined)
              }
            >
              {editing.mode === 'change' ? 'Save change' : 'Stop it'}
            </button>
            <button type="button" onClick={() => setEditing(undefined)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {(costs.isError || add.isError || change.isError || stop.isError || remove.isError) && (
        <p className="error">
          {staffErrorMessage(
            costs.error ?? add.error ?? change.error ?? stop.error ?? remove.error,
          )}
        </p>
      )}
      {costs.isPending ? (
        <p>Loading…</p>
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(c) => c.id}
          emptyText="No running costs yet. Add your insurance, finance and road tax above."
        />
      )}
    </section>
  );
}

function DriverPay({ companyId }: { companyId: string }) {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const queryClient = useQueryClient();
  const drivers = useQuery({
    queryKey: ['driver-rates', companyId],
    queryFn: () => withAccessToken((t) => costingApi.listDriverRates(t, companyId)),
    retry: false,
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['driver-rates'] });
  const [form, setForm] = useState<{ driverId: string; pounds: string; fromDay: string }>({
    driverId: '',
    pounds: '',
    fromDay: ukToday(),
  });
  const amount = form.pounds.trim() === '' ? undefined : parsePounds(form.pounds);
  const save = useMutation({
    mutationFn: () =>
      withAccessToken((t) =>
        costingApi.setDriverRate(t, companyId, {
          driverId: form.driverId,
          hourlyPence: amount ?? 0,
          fromDay: form.fromDay,
        }),
      ),
    onSuccess: () => {
      setForm((f) => ({ ...f, pounds: '' }));
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => withAccessToken((t) => costingApi.deleteDriverRate(t, id)),
    onSuccess: refresh,
  });

  const list: DriverRatesDto[] = drivers.data ?? [];
  return (
    <section>
      <h2>What drivers cost an hour</h2>
      <p className="muted" style={{ fontSize: 13 }}>
        The hourly cost of each driver to you: pay, plus anything you add on (holiday, employer's
        National Insurance, pension). A rate applies from the day you give until the next one
        starts, so a pay rise does not change the cost of work already done. Drivers never see this.
      </p>
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          if (amount !== undefined && form.driverId !== '') save.mutate();
        }}
      >
        <div className="field-row">
          <div className="field">
            <label htmlFor="rate-driver">Driver</label>
            <select
              id="rate-driver"
              value={form.driverId}
              onChange={(e) => setForm({ ...form, driverId: e.target.value })}
            >
              <option value="">Choose a driver</option>
              {list.map((d) => (
                <option key={d.driverId} value={d.driverId}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="rate-amount">An hour, in £</label>
            <input
              id="rate-amount"
              inputMode="decimal"
              value={form.pounds}
              placeholder="14.50"
              onChange={(e) => setForm({ ...form, pounds: e.target.value })}
              aria-invalid={form.pounds.trim() !== '' && amount === undefined}
            />
          </div>
          <div className="field">
            <label htmlFor="rate-from">From</label>
            <input
              id="rate-from"
              type="date"
              value={form.fromDay}
              onChange={(e) => setForm({ ...form, fromDay: e.target.value })}
            />
          </div>
          <button
            type="submit"
            disabled={save.isPending || amount === undefined || form.driverId === ''}
          >
            {save.isPending ? 'Saving…' : 'Set rate'}
          </button>
        </div>
      </form>
      {(drivers.isError || save.isError || remove.isError) && (
        <p className="error">{staffErrorMessage(drivers.error ?? save.error ?? remove.error)}</p>
      )}
      {drivers.isPending ? (
        <p>Loading…</p>
      ) : list.length === 0 ? (
        <p className="muted">No drivers have joined your company yet.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {list.map((d) => (
            <li
              key={d.driverId}
              style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}
            >
              <strong>{d.name}</strong>
              {d.rates.length === 0 ? (
                <span className="muted"> No rate set, so their time is left out of job costs.</span>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: '4px 0 0' }}>
                  {d.rates.map((r, i) => (
                    <li key={r.id} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <span>
                        {formatPence(r.hourlyPence)} an hour from {dayText(r.fromDay)}
                        {i === 0 && <span className="muted"> (current)</span>}
                      </span>
                      <button
                        type="button"
                        className="btn-danger"
                        disabled={remove.isPending}
                        onClick={() => {
                          if (window.confirm('Remove this rate?')) remove.mutate(r.id);
                        }}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
