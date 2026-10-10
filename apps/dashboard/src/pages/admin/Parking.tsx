import {
  PARKING_FACILITIES,
  type ParkingSource,
  type SafeParkingSpotDto,
} from '@wagonwise/contracts/parking';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import * as parkingApi from '../../api/parking';
import { DataTable, type Column } from '../../components/DataTable';
import {
  emptyForm,
  facilitiesSummary,
  FACILITY_LABELS,
  formToRequest,
  SOURCE_LABELS,
  sourceOf,
  spotToForm,
  type Known,
  type SpotForm,
} from '../../lib/parking';
import { useStaffAuthStore } from '../../state/staff-auth-store';
import { staffErrorMessage } from '../staff/messages';

const PARKING_KEY = ['parking-spots'] as const;

const KNOWN_LABELS: Record<Known, string> = { unknown: 'Not known', yes: 'Yes', no: 'No' };

/**
 * The parking spots drivers see on the map: WagonWise staff add, change and delete them here. A spot can come from a driver,
 * from staff, or from the one-off OpenStreetMap import that gave the map a starting point. WagonWise staff only.
 */
export function Parking() {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [source, setSource] = useState<ParkingSource | ''>('');
  const [editing, setEditing] = useState<{ id: string | undefined; form: SpotForm } | undefined>(
    undefined,
  );
  const [problem, setProblem] = useState<string | undefined>(undefined);

  const spots = useQuery({
    queryKey: [...PARKING_KEY, search, source],
    queryFn: () =>
      withAccessToken((token) =>
        parkingApi.listParkingSpots(token, {
          q: search,
          ...(source === '' ? {} : { source }),
        }),
      ),
  });
  const refresh = (): void => void queryClient.invalidateQueries({ queryKey: PARKING_KEY });

  const save = useMutation({
    mutationFn: (input: {
      id: string | undefined;
      request: Parameters<typeof parkingApi.addParkingSpot>[1];
    }) =>
      withAccessToken((token) =>
        input.id === undefined
          ? parkingApi.addParkingSpot(token, input.request)
          : parkingApi.updateParkingSpot(token, input.id, input.request),
      ),
    onSuccess: () => {
      setEditing(undefined);
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => withAccessToken((token) => parkingApi.deleteParkingSpot(token, id)),
    onSuccess: refresh,
  });

  const submit = (): void => {
    if (editing === undefined) return;
    const built = formToRequest(editing.form);
    if (!built.ok) {
      setProblem(built.problem);
      return;
    }
    setProblem(undefined);
    save.mutate({ id: editing.id, request: built.request });
  };

  const columns: Column<SafeParkingSpotDto>[] = [
    {
      key: 'name',
      header: 'Place',
      sortValue: (s) => s.name ?? s.note ?? '',
      cell: (s) => (
        <div>
          <strong>{s.name ?? (s.note === undefined ? 'Unnamed' : s.note)}</strong>
          {s.name !== undefined && s.note !== undefined && (
            <div className="muted" style={{ fontSize: 13 }}>
              {s.note}
            </div>
          )}
          <div className="muted" style={{ fontSize: 12 }}>
            {s.location.lat.toFixed(5)}, {s.location.lon.toFixed(5)}
          </div>
        </div>
      ),
    },
    {
      key: 'source',
      header: 'From',
      sortValue: (s) => sourceOf(s),
      cell: (s) => SOURCE_LABELS[sourceOf(s)],
    },
    {
      key: 'capacity',
      header: 'Lorry spaces',
      align: 'right',
      sortValue: (s) => s.capacity ?? -1,
      cell: (s) => s.capacity ?? '',
    },
    { key: 'facilities', header: 'What is there', cell: (s) => facilitiesSummary(s) },
    {
      key: 'drivers',
      header: 'Drivers',
      align: 'right',
      sortValue: (s) => s.reporterCount ?? 0,
      cell: (s) => s.reporterCount ?? 0,
    },
    {
      key: 'added',
      header: 'Last reported',
      sortValue: (s) => s.lastReportedAt ?? s.reportedAt,
      cell: (s) => new Date(s.lastReportedAt ?? s.reportedAt).toLocaleDateString('en-GB'),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (s) => (
        <span style={{ display: 'inline-flex', gap: 8 }}>
          <button
            className="btn-secondary"
            onClick={() => {
              setProblem(undefined);
              setEditing({ id: s.id, form: spotToForm(s) });
            }}
          >
            Edit
          </button>
          <button
            className="btn-danger"
            disabled={remove.isPending}
            onClick={() => {
              if (window.confirm('Delete this parking spot? Drivers will stop seeing it.')) {
                remove.mutate(s.id);
              }
            }}
          >
            Delete
          </button>
        </span>
      ),
    },
  ];

  const error = spots.error ?? save.error ?? remove.error;
  const data = spots.data;

  return (
    <div>
      <h1>Parking spots</h1>
      <p className="muted">
        The places drivers see on the map to park. They come from drivers, from you, and from a
        one-off import of lorry parks and service areas from OpenStreetMap that gave the map a
        starting point. Anything here can be edited or deleted.
      </p>

      {error !== null && <p style={{ color: 'var(--danger)' }}>{staffErrorMessage(error)}</p>}

      {data !== undefined && (
        <p>
          <strong>{data.bySource.driver + data.bySource.admin + data.bySource.osm}</strong> places:{' '}
          {data.bySource.osm} from OpenStreetMap, {data.bySource.driver} from drivers,{' '}
          {data.bySource.admin} added by WagonWise.
        </p>
      )}

      <div
        style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end', marginBottom: 16 }}
      >
        <div className="field">
          <label htmlFor="parking-search">Search</label>
          <input
            id="parking-search"
            type="search"
            placeholder="Name or note"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="parking-source">From</label>
          <select
            id="parking-source"
            value={source}
            onChange={(e) => setSource(e.target.value as ParkingSource | '')}
          >
            <option value="">Anywhere</option>
            {(Object.keys(SOURCE_LABELS) as ParkingSource[]).map((key) => (
              <option key={key} value={key}>
                {SOURCE_LABELS[key]}
              </option>
            ))}
          </select>
        </div>
        <button
          className="btn-primary"
          onClick={() => {
            setProblem(undefined);
            setEditing({ id: undefined, form: emptyForm() });
          }}
        >
          Add a parking spot
        </button>
      </div>

      {editing !== undefined && (
        <form
          className="card"
          style={{ marginBottom: 16, display: 'grid', gap: 12 }}
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <h2 style={{ margin: 0 }}>
            {editing.id === undefined ? 'Add a parking spot' : 'Edit this spot'}
          </h2>
          <div className="field-row">
            <div className="field">
              <label htmlFor="spot-location">Where (latitude, longitude)</label>
              <input
                id="spot-location"
                placeholder="51.5074, -0.1278"
                value={editing.form.location}
                onChange={(e) =>
                  setEditing({ ...editing, form: { ...editing.form, location: e.target.value } })
                }
              />
              <span className="muted" style={{ fontSize: 12 }}>
                On a map, right-click the place and copy the two numbers.
              </span>
            </div>
            <div className="field">
              <label htmlFor="spot-name">Name</label>
              <input
                id="spot-name"
                maxLength={120}
                value={editing.form.name}
                onChange={(e) =>
                  setEditing({ ...editing, form: { ...editing.form, name: e.target.value } })
                }
              />
            </div>
            <div className="field">
              <label htmlFor="spot-capacity">Lorry spaces</label>
              <input
                id="spot-capacity"
                inputMode="numeric"
                value={editing.form.capacity}
                onChange={(e) =>
                  setEditing({ ...editing, form: { ...editing.form, capacity: e.target.value } })
                }
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="spot-note">Note for drivers</label>
            <input
              id="spot-note"
              maxLength={280}
              value={editing.form.note}
              onChange={(e) =>
                setEditing({ ...editing, form: { ...editing.form, note: e.target.value } })
              }
            />
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
              gap: 12,
            }}
          >
            {PARKING_FACILITIES.map((key) => (
              <div className="field" key={key}>
                <label htmlFor={`spot-${key}`}>{FACILITY_LABELS[key]}</label>
                <select
                  id={`spot-${key}`}
                  value={editing.form.facilities[key]}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      form: {
                        ...editing.form,
                        facilities: { ...editing.form.facilities, [key]: e.target.value as Known },
                      },
                    })
                  }
                >
                  {(Object.keys(KNOWN_LABELS) as Known[]).map((known) => (
                    <option key={known} value={known}>
                      {KNOWN_LABELS[known]}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          {problem !== undefined && <p style={{ color: 'var(--danger)', margin: 0 }}>{problem}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save'}
            </button>
            <button className="btn-secondary" type="button" onClick={() => setEditing(undefined)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {data === undefined ? (
        <p>Loading…</p>
      ) : (
        <>
          {data.total > data.spots.length && (
            <p className="muted">
              Showing the newest {data.spots.length} of {data.total}. Search to narrow it down.
            </p>
          )}
          <DataTable
            columns={columns}
            rows={data.spots}
            rowKey={(s) => s.id}
            emptyText="No parking spots match."
          />
        </>
      )}
      <p className="muted" style={{ marginTop: 16, fontSize: 13 }}>
        Places from OpenStreetMap are © OpenStreetMap contributors, available under the{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          Open Database Licence
        </a>
        .
      </p>
    </div>
  );
}
