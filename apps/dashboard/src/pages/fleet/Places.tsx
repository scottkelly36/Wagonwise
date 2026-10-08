import type { PlaceCategory, SavedPlaceDto } from '@wagonwise/contracts/places';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import * as placesApi from '../../api/places';
import { CompanySelect } from '../../components/CompanySelect';
import { PostcodeField } from '../../components/PostcodeField';
import { resolvePostcode, usePostcode } from '../../hooks/use-postcode';
import { companyIdSchema } from '@wagonwise/contracts/companies';
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

  // Adding a location: a customer's site or a depot, from a postcode (the driver marks the exact gate later).
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<PlaceCategory>('other');
  const [newPostcode, setNewPostcode] = useState('');
  const [newNote, setNewNote] = useState('');
  const [showAddErrors, setShowAddErrors] = useState(false);
  const newPostcodeLookup = usePostcode(newPostcode);
  const add = useMutation({
    mutationFn: async () => {
      const resolved = await resolvePostcode(queryClient, newPostcode);
      return withAccessToken((token) =>
        placesApi.createPlace(token, companyId as string, {
          id: crypto.randomUUID(),
          companyId: companyIdSchema.parse(companyId),
          category: newCategory,
          name: newName.trim(),
          ...(newNote.trim() === '' ? {} : { note: newNote.trim() }),
          location: resolved.location,
        }),
      );
    },
    onSuccess: () => {
      setNewName('');
      setNewPostcode('');
      setNewNote('');
      setShowAddErrors(false);
      refresh();
    },
  });
  const addProblem =
    newName.trim() === ''
      ? 'Enter a name.'
      : newPostcodeLookup.data === undefined
        ? 'Enter a postcode we can find.'
        : undefined;
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

  const error = places.error ?? save.error ?? remove.error ?? add.error;

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

      {canEdit && companyId !== undefined && (
        <section className="card" style={{ maxWidth: 720, marginBottom: 16 }}>
          <h2>Add a location</h2>
          <form
            noValidate
            className="job-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (addProblem !== undefined) {
                setShowAddErrors(true);
                return;
              }
              add.mutate();
            }}
          >
            <div className="field">
              <label htmlFor="place-name">Name</label>
              <input
                id="place-name"
                value={newName}
                maxLength={80}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Hexham Mart"
              />
            </div>
            <div className="field">
              <label htmlFor="place-type">Type</label>
              <select
                id="place-type"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as PlaceCategory)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {PLACE_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
            <PostcodeField
              id="place-postcode"
              label="Postcode"
              value={newPostcode}
              onChange={setNewPostcode}
              lookup={newPostcodeLookup}
              error={showAddErrors && addProblem?.includes('postcode') ? addProblem : undefined}
            />
            <div className="field">
              <label htmlFor="place-note">Note for drivers (optional)</label>
              <input
                id="place-note"
                value={newNote}
                maxLength={500}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="e.g. Weighbridge first, then gate B"
              />
            </div>
            <div className="job-form-actions">
              {showAddErrors && addProblem === 'Enter a name.' && (
                <span className="error">{addProblem}</span>
              )}
              <button type="submit" disabled={add.isPending}>
                {add.isPending ? 'Adding…' : 'Add location'}
              </button>
            </div>
          </form>
        </section>
      )}

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
