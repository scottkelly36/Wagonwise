import {
  maintenanceItemIdSchema,
  type ItemTypeBody,
  type ItemTypeDto,
  type OverviewRowDto,
} from '@wagonwise/contracts/maintenance';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import * as fleetApi from '../../api/fleet';
import * as maintenanceApi from '../../api/maintenance';
import { CompanySelect } from '../../components/CompanySelect';
import { DataTable, type Column } from '../../components/DataTable';
import { MyReminders } from '../../components/MyReminders';
import { Repairs } from '../../components/Repairs';
import { VehicleMaintenance } from '../../components/VehicleMaintenance';
import {
  dueText,
  intervalText,
  STATUS_COLOURS,
  STATUS_LABELS,
  vehicleLabel,
} from '../../lib/maintenance';
import { holds, isPlatform } from '../../state/access';
import { useStaffAuthStore } from '../../state/staff-auth-store';
import { staffErrorMessage } from '../staff/messages';

type Tab = 'due' | 'repairs' | 'items';
type Filter = 'needs' | 'all';

/**
 * Maintenance: what is overdue or due soon across the company's vehicles, and what the company keeps track of (MOT,
 * safety inspections, service...). Everyone who runs the fleet or sees reports can read it; whoever has
 * `manage_maintenance` keeps the dates and the list. It only advises: an overdue item never stops a vehicle.
 */
export function Maintenance() {
  const me = useStaffAuthStore((s) => s.session?.staff);
  const everyCompany = isPlatform(me);
  const canManage = everyCompany || holds(me, 'manage_maintenance');
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const companyId = everyCompany ? selectedCompanyId || undefined : me?.companyId;
  const [tab, setTab] = useState<Tab>('due');

  return (
    <div>
      <h1>Maintenance</h1>
      <p style={{ color: '#6b7280' }}>
        When MOTs, inspections and services fall due on your vehicles. It reminds you; it never
        stops a vehicle being sent out.
      </p>
      {everyCompany && (
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="maintenance-company">Company </label>
          <CompanySelect
            id="maintenance-company"
            value={selectedCompanyId}
            onChange={setSelectedCompanyId}
            emptyLabel="Choose a company"
          />
        </div>
      )}
      {!everyCompany && holds(me, 'manage_maintenance') && <MyReminders />}
      {companyId === undefined ? (
        <p>Choose a company.</p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button type="button" disabled={tab === 'due'} onClick={() => setTab('due')}>
              What is due
            </button>
            <button type="button" disabled={tab === 'repairs'} onClick={() => setTab('repairs')}>
              Repairs
            </button>
            <button type="button" disabled={tab === 'items'} onClick={() => setTab('items')}>
              What you keep track of
            </button>
          </div>
          {tab === 'due' ? (
            <Due companyId={companyId} canManage={canManage} />
          ) : tab === 'repairs' ? (
            <Repairs companyId={companyId} canManage={canManage} />
          ) : (
            <Items companyId={companyId} canManage={canManage} />
          )}
        </>
      )}
    </div>
  );
}

function Due({ companyId, canManage }: { companyId: string; canManage: boolean }) {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const [filter, setFilter] = useState<Filter>('needs');
  const [openVehicle, setOpenVehicle] = useState<string | undefined>(undefined);

  const rows = useQuery({
    queryKey: ['maintenance-overview', companyId],
    queryFn: () => withAccessToken((token) => maintenanceApi.getOverview(token, companyId)),
  });

  const shown = (rows.data ?? []).filter((r) => filter === 'all' || r.status !== 'ok');
  const columns: Column<OverviewRowDto>[] = [
    {
      key: 'status',
      header: 'Status',
      sortValue: (r) => ['overdue', 'due_soon', 'no_date', 'ok'].indexOf(r.status),
      cell: (r) => (
        <strong style={{ color: STATUS_COLOURS[r.status] }}>{STATUS_LABELS[r.status]}</strong>
      ),
    },
    {
      key: 'vehicle',
      header: 'Vehicle',
      sortValue: (r) => r.vehicleName,
      cell: (r) => vehicleLabel(r),
    },
    { key: 'item', header: 'What', sortValue: (r) => r.itemName, cell: (r) => r.itemName },
    {
      key: 'due',
      header: 'Due',
      sortValue: (r) => r.dueDate ?? '9999',
      cell: (r) => dueText(r),
    },
    {
      key: 'open',
      header: '',
      align: 'right',
      cell: (r) => (
        <button type="button" onClick={() => setOpenVehicle(r.vehicleId)}>
          {canManage ? 'Update' : 'Open'}
        </button>
      ),
    },
  ];

  return (
    <>
      <label style={{ display: 'block', marginBottom: 12 }}>
        Show{' '}
        <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
          <option value="needs">Only what needs attention</option>
          <option value="all">Everything</option>
        </select>
      </label>
      {rows.isError && <p style={{ color: '#dc2626' }}>{staffErrorMessage(rows.error)}</p>}
      {rows.isPending ? (
        <p>Loading…</p>
      ) : (
        <DataTable
          columns={columns}
          rows={shown}
          rowKey={(r) => `${r.vehicleId}-${r.itemId}`}
          searchText={(r) => `${r.vehicleName} ${r.registration ?? ''} ${r.itemName}`}
          emptyText={
            (rows.data ?? []).length === 0
              ? 'Nothing is tracked yet. Add what you keep track of under “What you keep track of”.'
              : 'Nothing needs attention. Well done.'
          }
        />
      )}
      {openVehicle !== undefined && (
        <VehicleMaintenance
          key={openVehicle}
          vehicleId={openVehicle}
          canManage={canManage}
          onClose={() => setOpenVehicle(undefined)}
        />
      )}
    </>
  );
}

interface Draft {
  readonly id: string | undefined;
  readonly body: ItemTypeBody;
}

const BLANK: ItemTypeBody = {
  name: '',
  intervalValue: 12,
  intervalUnit: 'months',
  warnDays: 28,
  appliesTo: 'all',
  vehicleIds: [],
};

function Items({ companyId, canManage }: { companyId: string; canManage: boolean }) {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const queryClient = useQueryClient();
  const key = ['maintenance-items', companyId] as const;
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: key });
    void queryClient.invalidateQueries({ queryKey: ['maintenance-overview'] });
  };
  const [draft, setDraft] = useState<Draft | undefined>(undefined);

  const items = useQuery({
    queryKey: key,
    queryFn: () => withAccessToken((token) => maintenanceApi.listItemTypes(token, companyId)),
  });
  const vehicles = useQuery({
    queryKey: ['fleet-vehicles', companyId],
    queryFn: () => withAccessToken((token) => fleetApi.listFleetVehicles(token, companyId)),
  });
  const archive = useMutation({
    mutationFn: (id: string) =>
      withAccessToken((token) => maintenanceApi.archiveItemType(token, id)),
    onSuccess: refresh,
  });
  const addExamples = useMutation({
    mutationFn: async () => {
      const starters = await withAccessToken((token) => maintenanceApi.getStarterItems(token));
      const have = new Set((items.data ?? []).map((i) => i.name.toLowerCase()));
      for (const starter of starters.filter((s) => !have.has(s.name.toLowerCase()))) {
        await withAccessToken((token) =>
          maintenanceApi.createItemType(token, companyId, {
            ...starter,
            id: maintenanceItemIdSchema.parse(crypto.randomUUID()),
          }),
        );
      }
    },
    onSuccess: refresh,
  });

  const edit = (i: ItemTypeDto): void =>
    setDraft({
      id: i.id,
      body: {
        name: i.name,
        intervalValue: i.intervalValue,
        intervalUnit: i.intervalUnit,
        warnDays: i.warnDays,
        appliesTo: i.appliesTo,
        vehicleIds: [...i.vehicleIds],
      },
    });

  if (draft !== undefined) {
    return (
      <ItemEditor
        key={draft.id ?? 'new'}
        companyId={companyId}
        draft={draft}
        vehicles={(vehicles.data ?? []).map((v) => ({
          id: v.id,
          label: v.registration === undefined ? v.name : `${v.name} (${v.registration})`,
        }))}
        onDone={() => {
          setDraft(undefined);
          refresh();
        }}
        onCancel={() => setDraft(undefined)}
      />
    );
  }

  return (
    <>
      <p style={{ color: '#6b7280' }}>
        The things that fall due on your vehicles, and how often. The examples are only a starting
        point and aren&apos;t complete: you are responsible for what your own vehicles need and how
        often.
      </p>
      {canManage && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button type="button" onClick={() => setDraft({ id: undefined, body: BLANK })}>
            Add one
          </button>
          <button
            type="button"
            disabled={addExamples.isPending}
            onClick={() => addExamples.mutate()}
          >
            {addExamples.isPending ? 'Adding…' : 'Add the usual examples (MOT, inspections...)'}
          </button>
        </div>
      )}
      {(items.isError || archive.isError || addExamples.isError) && (
        <p style={{ color: '#dc2626' }}>
          {staffErrorMessage(items.error ?? archive.error ?? addExamples.error)}
        </p>
      )}
      {items.isPending ? (
        <p>Loading…</p>
      ) : (items.data ?? []).length === 0 ? (
        <p>Nothing yet.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {(items.data ?? []).map((i) => (
            <li
              key={i.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                padding: '12px 0',
                borderBottom: '1px solid #e5e7eb',
              }}
            >
              <div>
                <strong>{i.name}</strong>
                <div style={{ color: '#6b7280' }}>
                  {intervalText(i)}, warns {i.warnDays} days before.{' '}
                  {i.appliesTo === 'all'
                    ? 'All vehicles.'
                    : `${i.vehicleIds.length} vehicle${i.vehicleIds.length === 1 ? '' : 's'}.`}
                </div>
              </div>
              {canManage && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => edit(i)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={archive.isPending}
                    onClick={() => {
                      if (window.confirm(`Stop tracking ${i.name}? What was recorded is kept.`)) {
                        archive.mutate(i.id);
                      }
                    }}
                  >
                    Remove
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function ItemEditor({
  companyId,
  draft,
  vehicles,
  onDone,
  onCancel,
}: {
  companyId: string;
  draft: Draft;
  vehicles: { id: string; label: string }[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const [body, setBody] = useState<ItemTypeBody>(draft.body);
  const problems: string[] = [];
  if (body.name.trim() === '') problems.push('Give it a name.');
  if (!Number.isInteger(body.intervalValue) || body.intervalValue < 1) {
    problems.push('Say how often it repeats, in whole days, weeks or months.');
  }
  if (!Number.isInteger(body.warnDays) || body.warnDays < 0 || body.warnDays > 365) {
    problems.push('The warning period is a number of days from 0 to 365.');
  }
  if (body.appliesTo === 'selected' && body.vehicleIds.length === 0) {
    problems.push('Choose which vehicles, or make it for all.');
  }

  const save = useMutation({
    mutationFn: () =>
      withAccessToken((token) =>
        draft.id === undefined
          ? maintenanceApi.createItemType(token, companyId, {
              ...body,
              id: maintenanceItemIdSchema.parse(crypto.randomUUID()),
            })
          : maintenanceApi.updateItemType(token, draft.id, body),
      ),
    onSuccess: onDone,
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (problems.length === 0) save.mutate();
      }}
    >
      <h2>{draft.id === undefined ? 'Add something to keep track of' : 'Edit'}</h2>
      <label style={{ display: 'block', marginBottom: 12 }}>
        <strong>Name</strong>
        <input
          value={body.name}
          maxLength={80}
          placeholder="For example: MOT"
          onChange={(e) => setBody({ ...body, name: e.target.value })}
          style={{ display: 'block', width: '100%', maxWidth: 360 }}
        />
      </label>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <label>
          <strong>Repeats every</strong>
          <div>
            <input
              type="number"
              min={1}
              value={body.intervalValue}
              onChange={(e) => setBody({ ...body, intervalValue: Number(e.target.value) })}
              style={{ width: 80 }}
            />{' '}
            <select
              value={body.intervalUnit}
              onChange={(e) =>
                setBody({ ...body, intervalUnit: e.target.value as ItemTypeBody['intervalUnit'] })
              }
            >
              <option value="days">days</option>
              <option value="weeks">weeks</option>
              <option value="months">months</option>
            </select>
          </div>
        </label>
        <label>
          <strong>Warn me</strong>
          <div>
            <input
              type="number"
              min={0}
              max={365}
              value={body.warnDays}
              onChange={(e) => setBody({ ...body, warnDays: Number(e.target.value) })}
              style={{ width: 80 }}
            />{' '}
            days before
          </div>
        </label>
      </div>
      <fieldset style={{ marginBottom: 12 }}>
        <legend>
          <strong>Which vehicles?</strong>
        </legend>
        <label style={{ display: 'block' }}>
          <input
            type="radio"
            checked={body.appliesTo === 'all'}
            onChange={() => setBody({ ...body, appliesTo: 'all' })}
          />{' '}
          All our vehicles
        </label>
        <label style={{ display: 'block' }}>
          <input
            type="radio"
            checked={body.appliesTo === 'selected'}
            onChange={() => setBody({ ...body, appliesTo: 'selected' })}
          />{' '}
          Only these:
        </label>
        {body.appliesTo === 'selected' && (
          <div style={{ marginLeft: 24 }}>
            {vehicles.map((v) => (
              <label key={v.id} style={{ display: 'block' }}>
                <input
                  type="checkbox"
                  checked={body.vehicleIds.includes(v.id)}
                  onChange={(e) =>
                    setBody({
                      ...body,
                      vehicleIds: e.target.checked
                        ? [...body.vehicleIds, v.id]
                        : body.vehicleIds.filter((id) => id !== v.id),
                    })
                  }
                />{' '}
                {v.label}
              </label>
            ))}
          </div>
        )}
      </fieldset>
      {problems.length > 0 && (
        <ul style={{ color: '#b45309' }}>
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {save.isError && <p style={{ color: '#dc2626' }}>{staffErrorMessage(save.error)}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" disabled={problems.length > 0 || save.isPending}>
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
