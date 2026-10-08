import {
  checkTemplateIdSchema,
  type CheckItem,
  type CheckItemKind,
  type CheckTemplateDto,
} from '@wagonwise/contracts/checks';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import * as checksApi from '../../api/checks';
import * as fleetApi from '../../api/fleet';
import { CompanySelect } from '../../components/CompanySelect';
import {
  changeKind,
  describeList,
  ITEM_KIND_LABELS,
  ITEM_KINDS,
  moveItem,
  newItem,
  problemsWith,
} from '../../lib/check-builder';
import { holds, isPlatform } from '../../state/access';
import { useStaffAuthStore } from '../../state/staff-auth-store';
import { staffErrorMessage } from '../staff/messages';

interface Draft {
  /** Absent for a list not saved yet. */
  readonly id: string | undefined;
  readonly name: string;
  readonly appliesTo: 'all' | 'selected';
  readonly vehicleIds: string[];
  readonly items: CheckItem[];
}

const BLANK: Draft = { id: undefined, name: '', appliesTo: 'all', vehicleIds: [], items: [] };

/**
 * Walk-round check lists. Each firm builds its own: the questions a driver answers before taking a vehicle out,
 * and which vehicles each list is for. A firm that wants no checks simply has none. Fleet managers
 * (`manage_fleet`) build them.
 */
export function Checks() {
  const me = useStaffAuthStore((s) => s.session?.staff);
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const everyCompany = isPlatform(me);
  const canBuild = everyCompany || holds(me, 'manage_fleet');
  const queryClient = useQueryClient();

  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const companyId = everyCompany ? selectedCompanyId || undefined : me?.companyId;
  const key = ['check-templates', companyId] as const;
  const refresh = () => void queryClient.invalidateQueries({ queryKey: key });

  const templates = useQuery({
    queryKey: key,
    queryFn: () =>
      withAccessToken((token) => checksApi.listCheckTemplates(token, companyId as string)),
    enabled: companyId !== undefined,
  });
  const vehicles = useQuery({
    queryKey: ['fleet-vehicles', companyId],
    queryFn: () =>
      withAccessToken((token) => fleetApi.listFleetVehicles(token, companyId as string)),
    enabled: companyId !== undefined,
  });

  const [draft, setDraft] = useState<Draft | undefined>(undefined);
  const archive = useMutation({
    mutationFn: (id: string) =>
      withAccessToken((token) => checksApi.archiveCheckTemplate(token, id)),
    onSuccess: refresh,
  });
  const starter = useMutation({
    mutationFn: () => withAccessToken((token) => checksApi.getStarterTemplate(token)),
    onSuccess: (example) =>
      setDraft({ ...BLANK, name: example.name, items: example.items as CheckItem[] }),
  });

  function edit(t: CheckTemplateDto): void {
    setDraft({
      id: t.id,
      name: t.name,
      appliesTo: t.appliesTo,
      vehicleIds: [...t.vehicleIds],
      items: t.items as CheckItem[],
    });
  }

  return (
    <div>
      <h1>Walk-round checks</h1>
      <p style={{ color: '#6b7280' }}>
        Build the check list your drivers answer before taking a vehicle out. Every firm builds its
        own, so ask what suits you, and make different lists for different vehicles. If you
        don&apos;t want checks, leave this empty.
      </p>
      <p style={{ color: '#6b7280', fontSize: 13 }}>
        The example list is only a starting point and isn&apos;t complete. You are responsible for
        what your checks cover.
      </p>

      {everyCompany && (
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="checks-company">Company </label>
          <CompanySelect
            id="checks-company"
            value={selectedCompanyId}
            onChange={setSelectedCompanyId}
            emptyLabel="Choose a company"
          />
        </div>
      )}

      {companyId === undefined ? (
        <p>Choose a company.</p>
      ) : draft !== undefined ? (
        <Builder
          key={draft.id ?? 'new'}
          initial={draft}
          companyId={companyId}
          vehicles={(vehicles.data ?? []).map((v) => ({ id: v.id, name: v.name }))}
          onDone={() => {
            setDraft(undefined);
            refresh();
          }}
          onCancel={() => setDraft(undefined)}
        />
      ) : (
        <>
          {canBuild && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <button type="button" onClick={() => setDraft(BLANK)}>
                New blank list
              </button>
              <button type="button" onClick={() => starter.mutate()} disabled={starter.isPending}>
                {starter.isPending ? 'Loading…' : 'New list from the example'}
              </button>
            </div>
          )}
          {(templates.isError || archive.isError || starter.isError) && (
            <p style={{ color: '#dc2626' }}>
              {staffErrorMessage(templates.error ?? archive.error ?? starter.error)}
            </p>
          )}
          {templates.isPending ? (
            <p>Loading…</p>
          ) : (templates.data ?? []).length === 0 ? (
            <p>No check lists yet. Your drivers aren&apos;t asked to do any checks.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {(templates.data ?? []).map((t) => (
                <li
                  key={t.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 0',
                    borderBottom: '1px solid #e5e7eb',
                  }}
                >
                  <div>
                    <strong>{t.name}</strong>
                    <div style={{ color: '#6b7280' }}>{describeList(t)}</div>
                  </div>
                  {canBuild && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" onClick={() => edit(t)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={archive.isPending}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Remove "${t.name}"? Checks already done keep their record.`,
                            )
                          ) {
                            archive.mutate(t.id);
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
      )}
    </div>
  );
}

function Builder({
  initial,
  companyId,
  vehicles,
  onDone,
  onCancel,
}: {
  initial: Draft;
  companyId: string;
  vehicles: { id: string; name: string }[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const [name, setName] = useState(initial.name);
  const [appliesTo, setAppliesTo] = useState(initial.appliesTo);
  const [vehicleIds, setVehicleIds] = useState(initial.vehicleIds);
  const [items, setItems] = useState<CheckItem[]>(initial.items);
  const [addKind, setAddKind] = useState<CheckItemKind>('pass_fail');

  const problems = problemsWith({ name, appliesTo, vehicleIds, items });
  const body = { name, appliesTo, vehicleIds: appliesTo === 'all' ? [] : vehicleIds, items };

  const save = useMutation({
    mutationFn: () =>
      withAccessToken((token) =>
        initial.id === undefined
          ? checksApi.createCheckTemplate(token, companyId, {
              ...body,
              id: checkTemplateIdSchema.parse(crypto.randomUUID()),
            })
          : checksApi.updateCheckTemplate(token, initial.id, body),
      ),
    onSuccess: onDone,
  });

  const setItem = (index: number, item: CheckItem) =>
    setItems((all) => all.map((existing, i) => (i === index ? item : existing)));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (problems.length === 0) save.mutate();
      }}
    >
      <h2>{initial.id === undefined ? 'New check list' : 'Edit check list'}</h2>

      <label style={{ display: 'block', marginBottom: 16 }}>
        <strong>Name</strong>
        <input
          value={name}
          maxLength={80}
          placeholder="For example: Tractor unit"
          onChange={(e) => setName(e.target.value)}
          style={{ display: 'block', width: '100%', maxWidth: 420 }}
        />
      </label>

      <fieldset style={{ marginBottom: 16 }}>
        <legend>
          <strong>Which vehicles is it for?</strong>
        </legend>
        <label style={{ display: 'block' }}>
          <input type="radio" checked={appliesTo === 'all'} onChange={() => setAppliesTo('all')} />{' '}
          All our vehicles
        </label>
        <label style={{ display: 'block' }}>
          <input
            type="radio"
            checked={appliesTo === 'selected'}
            onChange={() => setAppliesTo('selected')}
          />{' '}
          Only these:
        </label>
        {appliesTo === 'selected' && (
          <div style={{ marginLeft: 24 }}>
            {vehicles.length === 0 && <span>No vehicles set up yet.</span>}
            {vehicles.map((v) => (
              <label key={v.id} style={{ display: 'block' }}>
                <input
                  type="checkbox"
                  checked={vehicleIds.includes(v.id)}
                  onChange={(e) =>
                    setVehicleIds((ids) =>
                      e.target.checked ? [...ids, v.id] : ids.filter((id) => id !== v.id),
                    )
                  }
                />{' '}
                {v.name}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <h3>Questions</h3>
      {items.length === 0 && <p>No questions yet. Add the first below.</p>}
      <ol style={{ paddingLeft: 20 }}>
        {items.map((item, index) => (
          <li
            key={item.id}
            style={{ marginBottom: 16, padding: 12, border: '1px solid #e5e7eb', borderRadius: 8 }}
          >
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                aria-label={`Question ${index + 1}`}
                value={item.label}
                maxLength={120}
                placeholder="The question"
                onChange={(e) => setItem(index, { ...item, label: e.target.value })}
                style={{ flex: '1 1 260px' }}
              />
              <select
                aria-label="Kind of answer"
                value={item.kind}
                onChange={(e) => setItem(index, changeKind(item, e.target.value as CheckItemKind))}
              >
                {ITEM_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {ITEM_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>
            <input
              aria-label="A hint for the driver"
              value={item.help ?? ''}
              maxLength={300}
              placeholder="A hint for the driver (optional)"
              onChange={(e) =>
                setItem(index, {
                  ...item,
                  help: e.target.value === '' ? undefined : e.target.value,
                })
              }
              style={{ width: '100%', marginTop: 8 }}
            />
            <ItemOptions item={item} onChange={(next) => setItem(index, next)} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                type="button"
                onClick={() => setItems((all) => moveItem(all, index, -1))}
                disabled={index === 0}
              >
                Up
              </button>
              <button
                type="button"
                onClick={() => setItems((all) => moveItem(all, index, 1))}
                disabled={index === items.length - 1}
              >
                Down
              </button>
              <button
                type="button"
                onClick={() => setItems((all) => all.filter((_, i) => i !== index))}
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ol>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
        <select
          aria-label="Kind of question to add"
          value={addKind}
          onChange={(e) => setAddKind(e.target.value as CheckItemKind)}
        >
          {ITEM_KINDS.map((k) => (
            <option key={k} value={k}>
              {ITEM_KIND_LABELS[k]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setItems((all) => [...all, newItem(addKind, crypto.randomUUID())])}
        >
          Add a question
        </button>
      </div>

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
          {save.isPending ? 'Saving…' : 'Save list'}
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

const SEVERITY_OPTIONS = [
  { value: 'advisory', label: 'Fix soon' },
  { value: 'do_not_drive', label: 'Do not drive' },
] as const;

/** The settings that depend on the kind of question. */
function ItemOptions({ item, onChange }: { item: CheckItem; onChange: (next: CheckItem) => void }) {
  const required = (
    <label>
      <input
        type="checkbox"
        checked={item.required}
        onChange={(e) => onChange({ ...item, required: e.target.checked })}
      />{' '}
      Must be answered
    </label>
  );
  const severity = (current: 'advisory' | 'do_not_drive', set: (s: typeof current) => void) => (
    <label>
      If there is a defect:{' '}
      <select value={current} onChange={(e) => set(e.target.value as typeof current)}>
        {SEVERITY_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 8 }}>
      {required}
      {(item.kind === 'pass_fail' || item.kind === 'yes_no') && (
        <>
          {item.kind === 'yes_no' && (
            <label>
              A defect is the answer:{' '}
              <select
                value={item.defectWhen}
                onChange={(e) => onChange({ ...item, defectWhen: e.target.value as 'yes' | 'no' })}
              >
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </label>
          )}
          {severity(item.severity, (s) => onChange({ ...item, severity: s }))}
          <label>
            <input
              type="checkbox"
              checked={item.photoOnDefect}
              onChange={(e) => onChange({ ...item, photoOnDefect: e.target.checked })}
            />{' '}
            Ask for a photo of a defect
          </label>
        </>
      )}
      {item.kind === 'number' && (
        <>
          <label>
            Unit{' '}
            <input
              value={item.unit ?? ''}
              maxLength={20}
              placeholder="miles, psi…"
              onChange={(e) =>
                onChange({ ...item, unit: e.target.value === '' ? undefined : e.target.value })
              }
              style={{ width: 90 }}
            />
          </label>
          <label>
            Lowest OK{' '}
            <input
              type="number"
              value={item.min ?? ''}
              onChange={(e) =>
                onChange({
                  ...item,
                  min: e.target.value === '' ? undefined : Number(e.target.value),
                })
              }
              style={{ width: 90 }}
            />
          </label>
          <label>
            Highest OK{' '}
            <input
              type="number"
              value={item.max ?? ''}
              onChange={(e) =>
                onChange({
                  ...item,
                  max: e.target.value === '' ? undefined : Number(e.target.value),
                })
              }
              style={{ width: 90 }}
            />
          </label>
          {severity(item.severity, (s) => onChange({ ...item, severity: s }))}
        </>
      )}
    </div>
  );
}
