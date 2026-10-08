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
 * What each company pays for: a price per vehicle and the number of vehicles its plan covers. WagonWise
 * bills that commitment, not the vehicles in use, so changing capacity (from today or a day in the future)
 * is how a company grows or shrinks. A company can't add more vehicles than its plan covers.
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
      header: 'Vehicles covered',
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
      header: 'Per month',
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
      <p style={{ color: '#6b7280' }}>
        Each company is billed for the vehicles its plan covers, whether or not they are all in use.
        A company can&apos;t add more vehicles than its plan covers, so raise the number here when
        it asks. A new company starts with none.
      </p>

      {plans.isError && <p style={{ color: '#dc2626' }}>{staffErrorMessage(plans.error)}</p>}
      {plans.isPending ? (
        <p>Loading…</p>
      ) : (
        <>
          <p>
            <strong>Total per month at today&apos;s plans: {formatPence(total)}</strong>
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
    <section style={{ marginTop: 24, padding: 16, border: '1px solid #e5e7eb', borderRadius: 8 }}>
      <h2 style={{ marginTop: 0 }}>{plan.name}</h2>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          saveCapacity.mutate();
        }}
        style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}
      >
        <label>
          <span style={{ display: 'block' }}>Vehicles covered</span>
          <input
            type="number"
            min={0}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            style={{ width: 100 }}
          />
        </label>
        <label>
          <span style={{ display: 'block' }}>From</span>
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
      <p style={{ color: '#6b7280', fontSize: 13 }}>
        Takes effect on that day. Pick today to change it now, or a later date to schedule it.
        Lowering it below the vehicles the company already has doesn&apos;t remove any; it only
        stops them adding more.
      </p>
      {saveCapacity.isSuccess && <p style={{ color: '#15803d' }}>Capacity saved.</p>}
      {saveCapacity.isError && (
        <p style={{ color: '#dc2626' }}>{staffErrorMessage(saveCapacity.error)}</p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (pence !== undefined) savePrice.mutate();
        }}
        style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 16 }}
      >
        <label>
          <span style={{ display: 'block' }}>Price per vehicle per month (£)</span>
          <input value={price} onChange={(e) => setPrice(e.target.value)} style={{ width: 100 }} />
        </label>
        <button type="submit" disabled={pence === undefined || savePrice.isPending}>
          {savePrice.isPending ? 'Saving…' : 'Set price'}
        </button>
      </form>
      {pence === undefined && (
        <p style={{ color: '#b45309', fontSize: 13 }}>Enter an amount such as 10 or 12.50.</p>
      )}
      {savePrice.isSuccess && <p style={{ color: '#15803d' }}>Price saved.</p>}
      {savePrice.isError && (
        <p style={{ color: '#dc2626' }}>{staffErrorMessage(savePrice.error)}</p>
      )}

      <button type="button" onClick={onClose} style={{ marginTop: 16 }}>
        Close
      </button>
    </section>
  );
}
