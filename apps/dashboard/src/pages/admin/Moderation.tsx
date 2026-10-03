import type { HazardReportDto, ModerateHazardRequest } from '@wagonwise/contracts/hazards';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import * as hazardsApi from '../../api/hazards';
import { useStaffAuthStore } from '../../state/staff-auth-store';
import { staffErrorMessage } from '../staff/messages';

const QUEUE_KEY = ['hazard-moderation-queue'] as const;

const TYPE_LABELS: Record<HazardReportDto['type'], string> = {
  low_bridge: 'Low bridge',
  weight_limit: 'Weight limit',
  width_restriction: 'Width restriction',
  tight_bend: 'Tight bend',
  roadworks: 'Roadworks',
  flooding: 'Flooding',
  no_hgv: 'No HGVs',
  other: 'Other',
};

const REASON_LABELS = {
  blocking_unreviewed: 'New blocking report, not yet checked',
  disputed: 'Drivers disagree (confirmed and dismissed)',
} as const;

const UNIT_FOR_KIND = { height: 'm', width: 'm', weight: 't' } as const;

function measurementText(hazard: HazardReportDto): string {
  return hazard.measurement
    ? `${hazard.measurement.kind} ${hazard.measurement.value} ${hazard.measurement.unit}`
    : '—';
}

/** Where a report is, for a moderator to look at before deciding. OpenStreetMap, since that is the
 *  data the routing engine itself uses. */
function mapLink(hazard: HazardReportDto): string {
  const { lat, lon } = hazard.location;
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=18/${lat}/${lon}`;
}

/**
 * The moderation queue (P2-M7.1, design doc §7): new blocking-type reports and disputed ones, for
 * WagonWise staff to approve, reject, correct or reclassify as permanent or temporary. Every
 * decision is recorded server-side with who made it. This page changes nothing about routing by
 * itself: a pending report keeps affecting routes exactly as before, and only a rejection takes it
 * away.
 */
export function Moderation() {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const queryClient = useQueryClient();
  const queue = useQuery({
    queryKey: QUEUE_KEY,
    queryFn: () => withAccessToken((token) => hazardsApi.listModerationQueue(token)),
    refetchInterval: 30_000,
  });

  const decide = useMutation({
    mutationFn: ({ id, input }: { id: string; input: ModerateHazardRequest }) =>
      withAccessToken((token) => hazardsApi.moderateHazard(token, id, input)),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: QUEUE_KEY }),
  });

  const [editing, setEditing] = useState<string | undefined>(undefined);

  return (
    <div>
      <h1>Moderation</h1>
      <p style={{ color: '#6b7280' }}>
        New low bridge, weight, width and no-HGV reports, and reports drivers disagree about. A
        report waiting here still affects routes; rejecting it is what takes it away.
      </p>

      {(queue.error ?? decide.error) !== null && (
        <p style={{ color: '#dc2626' }}>{staffErrorMessage(queue.error ?? decide.error)}</p>
      )}

      {queue.isPending ? (
        <p>Loading…</p>
      ) : queue.data?.length === 0 ? (
        <p style={{ color: '#6b7280' }}>Nothing waiting for review.</p>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {queue.data?.map(({ hazard, reasons }) => (
            <section
              key={hazard.id}
              style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}
            >
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
                <strong>{TYPE_LABELS[hazard.type]}</strong>
                <span>{measurementText(hazard)}</span>
                <span>
                  {hazard.confirmations} confirmed · {hazard.dismissals} dismissed
                </span>
                <span style={{ color: '#6b7280' }}>
                  reported {new Date(hazard.createdAt).toLocaleString('en-GB')} · driver{' '}
                  {hazard.reporterId.slice(0, 8)}
                </span>
                <a href={mapLink(hazard)} target="_blank" rel="noreferrer">
                  View on map
                </a>
              </div>
              <ul style={{ margin: '6px 0', color: '#92400e' }}>
                {reasons.map((reason) => (
                  <li key={reason}>{REASON_LABELS[reason]}</li>
                ))}
              </ul>
              {hazard.note && <p style={{ margin: '6px 0' }}>“{hazard.note}”</p>}

              {editing === hazard.id ? (
                <EditForm
                  hazard={hazard}
                  busy={decide.isPending}
                  onCancel={() => setEditing(undefined)}
                  onSave={(input) =>
                    decide.mutate(
                      { id: hazard.id, input },
                      { onSuccess: () => setEditing(undefined) },
                    )
                  }
                />
              ) : (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    disabled={decide.isPending}
                    onClick={() => decide.mutate({ id: hazard.id, input: { action: 'approve' } })}
                  >
                    Approve
                  </button>
                  <button
                    className="btn-danger"
                    disabled={decide.isPending}
                    onClick={() => {
                      if (window.confirm('Reject this report? It will stop affecting routes.')) {
                        decide.mutate({ id: hazard.id, input: { action: 'reject' } });
                      }
                    }}
                  >
                    Reject
                  </button>
                  <button disabled={decide.isPending} onClick={() => setEditing(hazard.id)}>
                    Edit…
                  </button>
                  <button
                    disabled={decide.isPending}
                    onClick={() =>
                      decide.mutate({
                        id: hazard.id,
                        input: { action: 'set_lifetime', lifetime: 'permanent' },
                      })
                    }
                  >
                    Make permanent
                  </button>
                  <button
                    disabled={decide.isPending}
                    onClick={() =>
                      decide.mutate({
                        id: hazard.id,
                        input: { action: 'set_lifetime', lifetime: 'temporary' },
                      })
                    }
                  >
                    Make temporary
                  </button>
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/** Correct a report's type and/or measurement. Leaving the measurement box empty leaves it as it
 *  was; "Remove" takes it off. */
function EditForm({
  hazard,
  busy,
  onCancel,
  onSave,
}: {
  hazard: HazardReportDto;
  busy: boolean;
  onCancel: () => void;
  onSave: (input: ModerateHazardRequest) => void;
}) {
  const [type, setType] = useState(hazard.type);
  const [kind, setKind] = useState<'height' | 'width' | 'weight'>(
    hazard.measurement?.kind ?? 'height',
  );
  const [value, setValue] = useState(hazard.measurement ? String(hazard.measurement.value) : '');
  const [remove, setRemove] = useState(false);

  function save(): void {
    const number = Number(value);
    const measurement = remove
      ? null
      : value.trim() === ''
        ? undefined
        : { kind, value: number, unit: UNIT_FOR_KIND[kind] };
    onSave({
      action: 'edit',
      ...(type === hazard.type ? {} : { type }),
      ...(measurement === undefined ? {} : { measurement }),
    });
  }

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <select value={type} onChange={(e) => setType(e.target.value as HazardReportDto['type'])}>
        {Object.entries(TYPE_LABELS).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
      <select
        value={kind}
        disabled={remove}
        onChange={(e) => setKind(e.target.value as 'height' | 'width' | 'weight')}
      >
        <option value="height">Height (m)</option>
        <option value="width">Width (m)</option>
        <option value="weight">Weight (t)</option>
      </select>
      <input
        value={value}
        disabled={remove}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Value"
        inputMode="decimal"
        style={{ width: 80 }}
      />
      {hazard.measurement && (
        <label>
          <input type="checkbox" checked={remove} onChange={(e) => setRemove(e.target.checked)} />{' '}
          Remove measurement
        </label>
      )}
      <button disabled={busy} onClick={save}>
        Save
      </button>
      <button disabled={busy} onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
