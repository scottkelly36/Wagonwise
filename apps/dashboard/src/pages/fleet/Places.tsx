import type { PlaceCategory, SavedPlaceDto } from '@wagonwise/contracts/places';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import * as placesApi from '../../api/places';
import { CompanySelect } from '../../components/CompanySelect';
import { DataTable, type Column } from '../../components/DataTable';
import { mapLink, PLACE_CATEGORY_LABELS } from '../../lib/places';
import { holds, isPlatform } from '../../state/access';
import { useStaffAuthStore } from '../../state/staff-auth-store';
import { staffErrorMessage } from '../staff/messages';

const CATEGORIES = Object.keys(PLACE_CATEGORY_LABELS) as PlaceCategory[];

/**
 * Places (saved by drivers): the gates and entrances a company's drivers have marked, such as a farm
 * whose postcode lands somewhere else. Anyone at the company sees them; dispatchers (the `dispatch`
 * privilege) can improve a note, rename or retype one, and remove one. New ones are marked by drivers, on
 * the spot, from the app.
 */
export function Places() {
  const me = useStaffAuthStore((s) => s.session?.staff);
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const everyCompany = isPlatform(me);
  const canEdit = everyCompany || holds(me, 'dispatch');
  const queryClient = useQueryClient();

  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const companyId = everyCompany ? selectedCompanyId || undefined : me?.companyId;
  const key = ['places', companyId] as const;

  const places = useQuery({
    queryKey: key,
    queryFn: () => withAccessToken((token) => placesApi.listPlaces(token, companyId as string)),
    enabled: companyId !== undefined,
  });

  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<PlaceCategory>('farm');
  const [note, setNote] = useState('');

  const refresh = () => void queryClient.invalidateQueries({ queryKey: key });
  const save = useMutation({
    mutationFn: (id: string) =>
      withAccessToken((token) => placesApi.updatePlace(token, id, { name, category, note })),
    onSuccess: () => {
      setEditingId(undefined);
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => withAccessToken((token) => placesApi.deletePlace(token, id)),
    onSuccess: refresh,
  });

  function startEditing(place: SavedPlaceDto): void {
    setEditingId(place.id);
    setName(place.name);
    setCategory(place.category);
    setNote(place.note ?? '');
    save.reset();
  }

  const columns: Column<SavedPlaceDto>[] = [
    {
      key: 'name',
      header: 'Name',
      sortValue: (p) => p.name,
      cell: (p) =>
        editingId === p.id ? (
          <input
            aria-label="Name"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
          />
        ) : (
          p.name
        ),
    },
    {
      key: 'category',
      header: 'Type',
      sortValue: (p) => p.category,
      cell: (p) =>
        editingId === p.id ? (
          <select
            aria-label="Type"
            value={category}
            onChange={(e) => setCategory(e.target.value as PlaceCategory)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {PLACE_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        ) : (
          PLACE_CATEGORY_LABELS[p.category]
        ),
    },
    {
      key: 'note',
      header: 'Note for drivers',
      cell: (p) =>
        editingId === p.id ? (
          <textarea
            aria-label="Note for drivers"
            value={note}
            maxLength={500}
            rows={3}
            onChange={(e) => setNote(e.target.value)}
            style={{ width: '100%', minWidth: 220 }}
          />
        ) : (
          (p.note ?? '')
        ),
    },
    {
      key: 'where',
      header: 'Where',
      cell: (p) => (
        <a href={mapLink(p.location)} target="_blank" rel="noreferrer">
          View on map
        </a>
      ),
    },
    {
      key: 'marked',
      header: 'Marked',
      sortValue: (p) => p.createdAt,
      cell: (p) => new Date(p.createdAt).toLocaleDateString('en-GB'),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (p) =>
        !canEdit ? null : editingId === p.id ? (
          <>
            <button type="button" disabled={save.isPending} onClick={() => save.mutate(p.id)}>
              {save.isPending ? 'Saving…' : 'Save'}
            </button>{' '}
            <button type="button" className="secondary" onClick={() => setEditingId(undefined)}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button type="button" className="secondary" onClick={() => startEditing(p)}>
              Edit
            </button>{' '}
            <button
              type="button"
              className="secondary"
              disabled={remove.isPending}
              onClick={() => {
                if (window.confirm(`Remove ${p.name}? Drivers will no longer see it.`)) {
                  remove.mutate(p.id);
                }
              }}
            >
              Remove
            </button>
          </>
        ),
    },
  ];

  const error = places.error ?? save.error ?? remove.error;

  return (
    <div>
      <h1>Places</h1>
      <p className="muted">
        Gates and entrances your drivers have marked, such as a farm whose postcode lands somewhere
        else. They are offered when you create a job near that postcode.
        {canEdit
          ? ' You can improve a note, rename one or remove it. Drivers mark new ones from the app.'
          : ' Dispatchers can edit them.'}
      </p>

      {everyCompany && (
        <div className="report-filters">
          <label>
            Company{' '}
            <CompanySelect
              id="places-company"
              value={selectedCompanyId}
              onChange={setSelectedCompanyId}
              emptyLabel="— choose a company —"
            />
          </label>
        </div>
      )}
      {error !== null && error !== undefined && <p className="error">{staffErrorMessage(error)}</p>}
      {places.isPending && companyId !== undefined && <p>Loading…</p>}

      {places.data !== undefined && (
        <DataTable
          columns={columns}
          rows={places.data}
          rowKey={(p) => p.id}
          searchText={(p) => `${p.name} ${PLACE_CATEGORY_LABELS[p.category]} ${p.note ?? ''}`}
          emptyText="Nothing marked yet. When a driver marks a gate or entrance in the app, it shows here."
        />
      )}
    </div>
  );
}
