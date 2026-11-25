import { ErrorNotice } from '../../components/ErrorNotice';
import { Loading } from '../../components/Loading';
import type { PlanSummaryDto } from '@wagonwise/contracts/billing';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import * as billingApi from '../../api/billing';
import { DataTable, type Column } from '../../components/DataTable';
import { formatPence, parsePounds, ukToday } from '../../lib/money';
import { useStaffAuthStore } from '../../state/staff-auth-store';
import { staffErrorMessage } from '../staff/messages';

const KEY = ['billing-plans'] as const;

const formatDay = (day: string) => new Date(`${day}T00:00:00`).toLocaleDateString('en-GB');

/**
 * What each company pays: a price per vehicle, and the number of vehicles its plan lets it set up. WagonWise
 * bills the vehicles used in a month (a job or a walk-round check), not the plan, so the plan is a limit on
 * how many a company can add. A company can't add more vehicles than its plan covers.
 */
export function Plans() {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const [editing, setEditing] = useState<string | undefined>(undefined);

  const plans = useQuery({
    queryKey: KEY,
    queryFn: () => withAccessToken((token) => billingApi.listPlans(token)),
  });

  const columns: Column<PlanSummaryDto>[] = [
    { key: 'name', header: 'Company', sortValue: (p) => p.name, cell: (p) => p.name },
    {
      key: 'capacity',
      header: 'Vehicles allowed',
      align: 'right',
      sortValue: (p) => p.capacityToday,
      cell: (p) => p.capacityToday,
    },
    {
      key: 'price',
      header: 'Price per vehicle',
      align: 'right',
      sortValue: (p) => p.pricePerVehiclePence,
      cell: (p) => formatPence(p.pricePerVehiclePence),
    },
    {
      key: 'monthly',
      header: 'Most per month',
      align: 'right',
      sortValue: (p) => p.monthlyPence,
      cell: (p) => formatPence(p.monthlyPence),
    },
    {
      key: 'next',
      header: 'Next change',
      cell: (p) =>
        p.next === undefined
          ? 'None'
          : `${p.next.capacity} vehicles from ${formatDay(p.next.effectiveFrom)}`,
    },
    {
      key: 'edit',
      header: '',
      align: 'right',
      cell: (p) => (
        <button type="button" onClick={() => setEditing(p.companyId)}>
          Change
        </button>
      ),
    },
  ];

  const total = (plans.data ?? []).reduce((sum, p) => sum + p.monthlyPence, 0);
  const selected = plans.data?.find((p) => p.companyId === editing);

  return (
    <div>
      <h1>Plans</h1>
      <p className="text-muted">
        Each company is billed, after the month, for the vehicles it used in it, at its price per
        vehicle. The number here is a limit on how many vehicles it can set up, not what it pays,
        and it applies only until the company adds payment details: after that there is no limit. A
        company without payment details can&apos;t add more vehicles than its plan covers, so raise
        the number here when it asks. A new company starts with none.
      </p>

      {plans.isError && <ErrorNotice error={plans.error} />}
      {plans.isPending ? (
        <Loading />
      ) : (
        <>
          <p>
            <strong>Most the plans could bill in a month: {formatPence(total)}</strong>
          </p>
          <DataTable
            columns={columns}
            rows={plans.data ?? []}
            rowKey={(p) => p.companyId}
            searchText={(p) => p.name}
            emptyText="No companies yet."
          />
        </>
      )}

      {selected !== undefined && (
        <PlanEditor
          key={selected.companyId}
          plan={selected}
          onClose={() => setEditing(undefined)}
        />
      )}
    </div>
  );
}

function PlanEditor({ plan, onClose }: { plan: PlanSummaryDto; onClose: () => void }) {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const queryClient = useQueryClient();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: KEY });

  const [capacity, setCapacity] = useState(String(plan.capacityToday));
  const [from, setFrom] = useState(ukToday());
  const [price, setPrice] = useState((plan.pricePerVehiclePence / 100).toFixed(2));

  const capacityNumber = Number(capacity);
  const capacityValid =
    capacity.trim() !== '' && Number.isInteger(capacityNumber) && capacityNumber >= 0;
  const pence = parsePounds(price);

  const saveCapacity = useMutation({
    mutationFn: () =>
      withAccessToken((token) =>
        billingApi.scheduleCapacity(token, plan.companyId, {
          capacity: capacityNumber,
          effectiveFrom: from,
        }),
      ),
    onSuccess: refresh,
  });
  const savePrice = useMutation({
    mutationFn: () =>
      withAccessToken((token) =>
        billingApi.setPricePerVehicle(token, plan.companyId, {
          pricePerVehiclePence: pence as number,
        }),
      ),
    onSuccess: refresh,
  });

  return (
    <section className="mt-24 box">
      <h2 className="mt-0">{plan.name}</h2>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          saveCapacity.mutate();
        }}
        className="flex gap-8 items-end wrap"
      >
        <label>
          <span className="block">Vehicles covered</span>
          <input
            type="number"
            min={0}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            style={{ width: 100 }}
          />
        </label>
        <label>
          <span className="block">From</span>
          <input
            type="date"
            value={from}
            min={ukToday()}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <button type="submit" disabled={!capacityValid || from === '' || saveCapacity.isPending}>
          {saveCapacity.isPending ? 'Saving…' : 'Set capacity'}
        </button>
      </form>
      <p className="text-muted text-13">
        Takes effect on that day. Pick today to change it now, or a later date to schedule it.
        Lowering it below the vehicles the company already has doesn&apos;t remove any; it only
        stops them adding more.
      </p>
      {saveCapacity.isSuccess && <p className="text-success">Capacity saved.</p>}
      {saveCapacity.isError && (
        <p className="text-danger">{staffErrorMessage(saveCapacity.error)}</p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (pence !== undefined) savePrice.mutate();
        }}
        className="flex gap-8 items-end mt-16"
      >
        <label>
          <span className="block">Price per vehicle per month (£)</span>
          <input value={price} onChange={(e) => setPrice(e.target.value)} style={{ width: 100 }} />
        </label>
        <button type="submit" disabled={pence === undefined || savePrice.isPending}>
          {savePrice.isPending ? 'Saving…' : 'Set price'}
        </button>
      </form>
      {pence === undefined && (
        <p className="text-warning text-13">Enter an amount such as 10 or 12.50.</p>
      )}
      {savePrice.isSuccess && <p className="text-success">Price saved.</p>}
      {savePrice.isError && <p className="text-danger">{staffErrorMessage(savePrice.error)}</p>}

      <button type="button" onClick={onClose} className="mt-16">
        Close
      </button>
    </section>
  );
}
