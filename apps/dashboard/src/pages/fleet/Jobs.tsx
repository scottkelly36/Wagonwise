import { companyIdSchema } from '@wagonwise/contracts/companies';
import type { JobDto, ProofOfDeliveryResponse } from '@wagonwise/contracts/jobs';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import * as companiesApi from '../../api/companies';
import * as fleetApi from '../../api/fleet';
import * as jobsApi from '../../api/jobs';
import * as placesApi from '../../api/places';
import type { SavedPlaceDto } from '@wagonwise/contracts/places';
import { MarkedPlaces } from '../../components/MarkedPlaces';
import { PostcodeField } from '../../components/PostcodeField';
import { SavedLocationPicker } from '../../components/SavedLocationPicker';
import { Seg } from '../../components/Seg';
import { DataTable, type Column } from '../../components/DataTable';
import { FieldError } from '../../components/FieldError';
import { resolvePostcode, usePostcode } from '../../hooks/use-postcode';
import { focusFirstInvalid, hasErrors, type FieldErrors } from '../../lib/forms';
import { formatDuration, formatMiles } from '../../lib/live-map';
import { normalisePostcode } from '../../lib/postcodes';
import { holds, isPlatform } from '../../state/access';
import { useStaffAuthStore } from '../../state/staff-auth-store';
import { jobStatusText } from '../../lib/job-text';
import { staffErrorMessage } from '../staff/messages';

const COMPANIES_KEY = ['companies'] as const;
type StopSource = 'saved' | 'new';
const STOP_SOURCES = [
  { key: 'saved', label: 'Stored location' },
  { key: 'new', label: 'New address' },
] as const;

const TERMINAL: readonly JobDto['status'][] = ['delivered', 'cancelled', 'failed'];

const EMPTY_FORM = {
  reference: '',
  // Whether the load is collected from a place the driver is sent to. Some firms always load at the same
  // place, so the job is just the delivery and the driver says when they are loaded.
  hasPickup: true,
  pickupName: '',
  pickupPostcode: '',
  deliveryName: '',
  deliveryPostcode: '',
  requiresProofOfDelivery: false,
};

/** Dispatch's "create a job, assign a driver and vehicle" slice (P2-M4, design doc §5 steps
 *  1-3). Anyone at the company can see jobs (`canViewJobs` needs no privilege); creating,
 *  assigning and cancelling need `dispatch`, same split as fleet's own pages. Multi-stop routes
 *  and the map pin picker are later nice-to-haves — one pickup and one delivery is enough for a
 *  first pilot firm's jobs. "Require proof of delivery" (P2-M5.5) is the dispatcher's own call at
 *  creation — core refuses the job's `delivered` step until the driver attaches a photo when it's
 *  set; this page only shows whether one's arrived, it doesn't view the photo itself. */
export function Jobs() {
  const me = useStaffAuthStore((s) => s.session?.staff);
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const everyCompany = isPlatform(me);
  const myEmail = me?.kind === 'fleet' ? me.email.trim().toLowerCase() : undefined;
  const canDispatch = holds(me, 'dispatch');
  const queryClient = useQueryClient();

  const companies = useQuery({
    queryKey: COMPANIES_KEY,
    queryFn: () => withAccessToken((token) => companiesApi.listCompanies(token)),
    enabled: everyCompany,
  });

  const [selectedCompanyId, setSelectedCompanyId] = useState<string | undefined>(undefined);
  const companyId = everyCompany ? selectedCompanyId : me?.companyId;
  const jobsKey = ['jobs', companyId] as const;
  const driversKey = ['driver-links', companyId] as const;
  const vehiclesKey = ['fleet-vehicles', companyId] as const;

  const jobs = useQuery({
    queryKey: jobsKey,
    queryFn: () => withAccessToken((token) => jobsApi.listJobs(token, companyId as string)),
    enabled: companyId !== undefined,
  });

  const drivers = useQuery({
    queryKey: driversKey,
    queryFn: () => withAccessToken((token) => fleetApi.listDriverLinks(token, companyId as string)),
    enabled: canDispatch && companyId !== undefined,
  });

  const vehicles = useQuery({
    queryKey: vehiclesKey,
    queryFn: () =>
      withAccessToken((token) => fleetApi.listFleetVehicles(token, companyId as string)),
    enabled: canDispatch && companyId !== undefined,
  });

  const refreshJobs = () => void queryClient.invalidateQueries({ queryKey: jobsKey });

  const [form, setForm] = useState(EMPTY_FORM);
  const pickupPostcode = usePostcode(form.pickupPostcode);
  const deliveryPostcode = usePostcode(form.deliveryPostcode);
  // A rural postcode often lands away from the gate. Entrances drivers have marked near it are offered,
  // and one chosen here sends the driver to the real spot, with its note on the stop.
  const markedPlaces = useQuery({
    queryKey: ['places', companyId],
    queryFn: () => withAccessToken((token) => placesApi.listPlaces(token, companyId as string)),
    enabled: companyId !== undefined,
  });
  const [pickupPlace, setPickupPlace] = useState<SavedPlaceDto | undefined>(undefined);
  const [deliveryPlace, setDeliveryPlace] = useState<SavedPlaceDto | undefined>(undefined);
  // Each stop is a stored location or a new address. With none stored yet it starts on a new address.
  const [pickupSource, setPickupSource] = useState<StopSource | undefined>(undefined);
  const [deliverySource, setDeliverySource] = useState<StopSource | undefined>(undefined);
  const [savePickup, setSavePickup] = useState(true);
  const [saveDelivery, setSaveDelivery] = useState(true);
  const defaultSource: StopSource = (markedPlaces.data?.length ?? 0) > 0 ? 'saved' : 'new';
  const pickupFrom = pickupSource ?? defaultSource;
  const deliveryFrom = deliverySource ?? defaultSource;
  const createJob = useMutation({
    mutationFn: async () => {
      // A stored location supplies the stop as it is. A new address is resolved here rather than trusting
      // the live hint's state, so a fast click on Create can't outrun the lookup; the cache makes it free
      // when the hint has already got the answer.
      const resolveStop = async (
        kind: 'pickup' | 'delivery',
        source: StopSource,
        place: SavedPlaceDto | undefined,
        name: string,
        postcodeText: string,
      ) => {
        if (source === 'saved' && place !== undefined) {
          return {
            stop: {
              kind,
              name: place.name,
              location: place.location,
              ...(place.note === undefined ? {} : { notes: place.note }),
            },
            isNew: false,
          };
        }
        const resolved = await resolvePostcode(queryClient, postcodeText);
        return {
          stop: {
            kind,
            name,
            location: place?.location ?? resolved.location,
            ...(place?.note === undefined ? {} : { notes: place.note }),
          },
          // A marked entrance chosen near the postcode is already stored.
          isNew: place === undefined,
        };
      };
      const [pickup, delivery] = await Promise.all([
        form.hasPickup
          ? resolveStop('pickup', pickupFrom, pickupPlace, form.pickupName, form.pickupPostcode)
          : Promise.resolve(undefined),
        resolveStop(
          'delivery',
          deliveryFrom,
          deliveryPlace,
          form.deliveryName,
          form.deliveryPostcode,
        ),
      ]);
      const job = await withAccessToken((token) =>
        jobsApi.createJob(token, companyId as string, {
          companyId: companyIdSchema.parse(companyId),
          reference: form.reference,
          stops: [...(pickup === undefined ? [] : [pickup.stop]), delivery.stop],
          requiresProofOfDelivery: form.requiresProofOfDelivery,
        }),
      );
      // New addresses ticked "Save this location for next time" are stored for the company. The job is
      // already made, so a failure here is not the dispatcher's problem.
      const toStore = [
        pickup !== undefined && pickup.isNew && pickupFrom === 'new' && savePickup
          ? pickup
          : undefined,
        delivery.isNew && deliveryFrom === 'new' && saveDelivery ? delivery : undefined,
      ].filter((s) => s !== undefined);
      await Promise.all(
        toStore.map((s) =>
          withAccessToken((token) =>
            placesApi.createPlace(token, companyId as string, {
              id: crypto.randomUUID(),
              companyId: companyIdSchema.parse(companyId),
              category: 'other',
              name: s.stop.name,
              location: s.stop.location,
            }),
          ).catch(() => undefined),
        ),
      );
      if (toStore.length > 0)
        void queryClient.invalidateQueries({ queryKey: ['places', companyId] });
      return job;
    },
    onSuccess: () => {
      // Keep their choice of pickup or not: a firm that never has one should not have to switch it every time.
      setForm({ ...EMPTY_FORM, hasPickup: form.hasPickup });
      setPickupPlace(undefined);
      setDeliveryPlace(undefined);
      setShowErrors(false);
      refreshJobs();
    },
  });

  const [showErrors, setShowErrors] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const errors: FieldErrors<
    | 'reference'
    | 'pickupName'
    | 'pickupPostcode'
    | 'pickupPlace'
    | 'deliveryName'
    | 'deliveryPostcode'
    | 'deliveryPlace'
  > = {};
  if (form.reference.trim() === '') errors.reference = 'Enter a reference, like the order number.';
  const pickupNew = form.hasPickup && pickupFrom === 'new';
  const deliveryNew = deliveryFrom === 'new';
  if (pickupNew && form.pickupName.trim() === '') {
    errors.pickupName = 'Enter where the load is collected from.';
  }
  if (form.hasPickup && pickupFrom === 'saved' && pickupPlace === undefined) {
    errors.pickupPlace = 'Choose a stored location, or switch to New address.';
  }
  if (deliveryNew && form.deliveryName.trim() === '') {
    errors.deliveryName = 'Enter where the load is going.';
  }
  if (deliveryFrom === 'saved' && deliveryPlace === undefined) {
    errors.deliveryPlace = 'Choose a stored location, or switch to New address.';
  }
  const postcodeProblem = (text: string, which: string): string | undefined => {
    if (text.trim() === '') return `Enter the ${which} postcode.`;
    if (normalisePostcode(text) === undefined) {
      return 'That does not look like a UK postcode. It should be like NE46 3JA.';
    }
    return undefined;
  };
  const pickupPostcodeProblem = pickupNew
    ? postcodeProblem(form.pickupPostcode, 'pickup')
    : undefined;
  if (pickupPostcodeProblem !== undefined) errors.pickupPostcode = pickupPostcodeProblem;
  const deliveryPostcodeProblem = deliveryNew
    ? postcodeProblem(form.deliveryPostcode, 'delivery')
    : undefined;
  if (deliveryPostcodeProblem !== undefined) errors.deliveryPostcode = deliveryPostcodeProblem;
  const shown = (field: keyof typeof errors): string | undefined =>
    showErrors ? errors[field] : undefined;

  const [viewing, setViewing] = useState<{ id: string; reference: string } | undefined>();

  const proofPhoto = useQuery({
    queryKey: ['proof-of-delivery', viewing?.id],
    queryFn: () =>
      withAccessToken((token) => jobsApi.getProofOfDelivery(token, viewing?.id as string)),
    enabled: viewing !== undefined,
    retry: false,
    // A retake replaces the photo, so don't show a stale one from an earlier look.
    staleTime: 0,
  });
  const [assigning, setAssigning] = useState<
    Record<string, { driverId: string; vehicleId: string }>
  >({});
  const assign = useMutation({
    mutationFn: (jobId: string) => {
      const picked = assigning[jobId];
      if (picked === undefined || picked.driverId === '' || picked.vehicleId === '') {
        return Promise.reject(new Error('pick a driver and a vehicle first'));
      }
      return withAccessToken((token) => jobsApi.assignJob(token, jobId, picked));
    },
    onSuccess: refreshJobs,
  });

  const cancel = useMutation({
    mutationFn: (jobId: string) => withAccessToken((token) => jobsApi.cancelJob(token, jobId)),
    onSuccess: refreshJobs,
  });

  function handleCreate(): void {
    if (companyId === undefined) return;
    if (hasErrors(errors)) {
      setShowErrors(true);
      focusFirstInvalid(formRef.current);
      return;
    }
    createJob.mutate();
  }

  // Assign stays clickable; if a driver or vehicle is missing it says so under the controls.
  const [assignHint, setAssignHint] = useState<Record<string, string>>({});
  function handleAssign(jobId: string, picked: { driverId: string; vehicleId: string }): void {
    if (picked.driverId === '' || picked.vehicleId === '') {
      setAssignHint((h) => ({
        ...h,
        [jobId]:
          picked.driverId === '' && picked.vehicleId === ''
            ? 'Choose a driver and a vehicle first.'
            : picked.driverId === ''
              ? 'Choose a driver first.'
              : 'Choose a vehicle first.',
      }));
      return;
    }
    setAssignHint((h) => Object.fromEntries(Object.entries(h).filter(([id]) => id !== jobId)));
    assign.mutate(jobId);
  }

  const activeDrivers = (drivers.data ?? []).filter(
    (link) => link.status === 'active' && link.driverId !== undefined,
  );

  const jobColumns: Column<JobDto>[] = [
    {
      key: 'reference',
      header: 'Reference',
      sortValue: (j) => j.reference,
      cell: (j) => j.reference,
    },
    {
      key: 'stops',
      header: 'Stops',
      sortValue: (j) => j.stops.map((stop) => stop.name).join(' '),
      cell: (j) => j.stops.map((stop) => stop.name).join(' → '),
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (j) => jobStatusText(j),
      cell: (j) => jobStatusText(j),
    },
    {
      key: 'proof',
      header: 'Proof of delivery',
      cell: (job) =>
        job.hasProofOfDelivery ? (
          <>
            Received{' '}
            <button
              type="button"
              onClick={() => setViewing({ id: job.id, reference: job.reference })}
            >
              View photo
            </button>
          </>
        ) : job.requiresProofOfDelivery ? (
          'Required — not yet received'
        ) : (
          '—'
        ),
    },
    ...(canDispatch
      ? [
          {
            key: 'actions',
            header: '',
            cell: (job: JobDto) => {
              const picked = assigning[job.id] ?? { driverId: '', vehicleId: '' };
              return (
                <div>
                  {job.status === 'draft' && (
                    <>
                      <span className="assign-controls">
                        <select
                          aria-label={`Driver for ${job.reference}`}
                          value={picked.driverId}
                          onChange={(e) =>
                            setAssigning((a) => ({
                              ...a,
                              [job.id]: { ...picked, driverId: e.target.value },
                            }))
                          }
                        >
                          <option value="">Driver…</option>
                          {activeDrivers.map((link) => (
                            <option key={link.id} value={link.driverId}>
                              {link.driverIdentifier ?? link.driverId}
                              {myEmail !== undefined &&
                              link.driverIdentifier?.toLowerCase() === myEmail
                                ? ' (you)'
                                : ''}
                            </option>
                          ))}
                        </select>
                        <select
                          aria-label={`Vehicle for ${job.reference}`}
                          value={picked.vehicleId}
                          onChange={(e) =>
                            setAssigning((a) => ({
                              ...a,
                              [job.id]: { ...picked, vehicleId: e.target.value },
                            }))
                          }
                        >
                          <option value="">Vehicle…</option>
                          {vehicles.data?.map((vehicle) => (
                            <option key={vehicle.id} value={vehicle.id}>
                              {vehicle.name}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleAssign(job.id, picked)}
                          disabled={assign.isPending}
                        >
                          Assign
                        </button>
                      </span>
                      {assignHint[job.id] !== undefined && (
                        <p className="field-error" role="alert" style={{ margin: '4px 0 0' }}>
                          {assignHint[job.id]}
                        </p>
                      )}
                      {picked.vehicleId !== '' && (
                        <RoutePreview jobId={job.id} vehicleId={picked.vehicleId} />
                      )}
                    </>
                  )}
                  {!TERMINAL.includes(job.status) && (
                    <button
                      className="btn-danger"
                      onClick={() => {
                        if (window.confirm('Cancel this job?')) cancel.mutate(job.id);
                      }}
                      disabled={cancel.isPending}
                      style={{ marginTop: job.status === 'draft' ? 6 : 0 }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              );
            },
          },
        ]
      : []),
  ];

  const error =
    companies.error ??
    jobs.error ??
    drivers.error ??
    vehicles.error ??
    createJob.error ??
    assign.error ??
    cancel.error;

  return (
    <div>
      <h1>Jobs</h1>
      <p style={{ color: '#6b7280' }}>Create jobs, and assign a driver and vehicle to each.</p>

      {everyCompany && (
        <div style={{ marginBottom: 16 }}>
          <label>
            Company:{' '}
            <select
              value={selectedCompanyId ?? ''}
              onChange={(e) => setSelectedCompanyId(e.target.value || undefined)}
            >
              <option value="">— choose a company —</option>
              {companies.data?.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {error !== null && <p style={{ color: '#dc2626' }}>{staffErrorMessage(error)}</p>}

      {viewing !== undefined && (
        <ProofPhotoDialog
          reference={viewing.reference}
          photo={proofPhoto}
          onClose={() => setViewing(undefined)}
        />
      )}

      {companyId === undefined ? (
        <p style={{ color: '#6b7280' }}>
          {everyCompany ? 'Choose a company above.' : 'No company assigned to your account.'}
        </p>
      ) : (
        <>
          {canDispatch && (
            <section style={{ marginBottom: 24 }}>
              <h2>Create a job</h2>
              <form
                ref={formRef}
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  handleCreate();
                }}
                className="job-form"
              >
                <div className="field">
                  <label htmlFor="job-reference">Reference</label>
                  <input
                    id="job-reference"
                    value={form.reference}
                    onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
                    aria-invalid={shown('reference') !== undefined}
                    aria-describedby="job-reference-error"
                  />
                  <FieldError id="job-reference-error" message={shown('reference')} />
                </div>
                <div className="job-form-break" />
                <div className="field">
                  <label>Collect from</label>
                  <div className="seg" role="group" aria-label="Collect from">
                    <button
                      type="button"
                      className={form.hasPickup ? 'on' : undefined}
                      aria-pressed={form.hasPickup}
                      onClick={() => setForm((f) => ({ ...f, hasPickup: true }))}
                    >
                      Add a pickup
                    </button>
                    <button
                      type="button"
                      className={form.hasPickup ? undefined : 'on'}
                      aria-pressed={!form.hasPickup}
                      onClick={() => setForm((f) => ({ ...f, hasPickup: false }))}
                    >
                      No pickup
                    </button>
                  </div>
                  {!form.hasPickup && (
                    <small className="hint">
                      The driver is not sent anywhere to load. They tell the app when they are
                      loaded and ready.
                    </small>
                  )}
                </div>
                {form.hasPickup && (
                  <>
                    <div className="field">
                      <label>Pickup</label>
                      <Seg
                        ariaLabel="Pickup"
                        value={pickupFrom}
                        onChange={(source) => {
                          setPickupSource(source);
                          setPickupPlace(undefined);
                        }}
                        options={STOP_SOURCES}
                      />
                    </div>
                    {pickupFrom === 'saved' ? (
                      <SavedLocationPicker
                        id="job-pickup-saved"
                        label="Stored location"
                        places={markedPlaces.data ?? []}
                        chosen={pickupPlace}
                        onChoose={setPickupPlace}
                        error={shown('pickupPlace')}
                      />
                    ) : (
                      <>
                        <div className="field">
                          <label htmlFor="job-pickup-name">Pickup name</label>
                          <input
                            id="job-pickup-name"
                            value={form.pickupName}
                            onChange={(e) => setForm((f) => ({ ...f, pickupName: e.target.value }))}
                            placeholder="e.g. Hexham Quarry"
                            aria-invalid={shown('pickupName') !== undefined}
                            aria-describedby="job-pickup-name-error"
                          />
                          <FieldError id="job-pickup-name-error" message={shown('pickupName')} />
                        </div>
                        <PostcodeField
                          id="job-pickup-postcode"
                          label="Pickup postcode"
                          value={form.pickupPostcode}
                          onChange={(value) => setForm((f) => ({ ...f, pickupPostcode: value }))}
                          lookup={pickupPostcode}
                          error={shown('pickupPostcode')}
                        />
                        <MarkedPlaces
                          places={markedPlaces.data ?? []}
                          near={pickupPostcode.data?.location}
                          chosen={pickupPlace}
                          onChoose={setPickupPlace}
                        />
                        <label className="check">
                          <input
                            type="checkbox"
                            checked={savePickup}
                            onChange={(e) => setSavePickup(e.target.checked)}
                          />
                          Save this location for next time
                        </label>
                      </>
                    )}
                  </>
                )}
                <div className="field">
                  <label>Deliver to</label>
                  <Seg
                    ariaLabel="Deliver to"
                    value={deliveryFrom}
                    onChange={(source) => {
                      setDeliverySource(source);
                      setDeliveryPlace(undefined);
                    }}
                    options={STOP_SOURCES}
                  />
                </div>
                {deliveryFrom === 'saved' ? (
                  <SavedLocationPicker
                    id="job-delivery-saved"
                    label="Stored location"
                    places={markedPlaces.data ?? []}
                    chosen={deliveryPlace}
                    onChoose={setDeliveryPlace}
                    error={shown('deliveryPlace')}
                  />
                ) : (
                  <>
                    <div className="field">
                      <label htmlFor="job-delivery-name">Delivery name</label>
                      <input
                        id="job-delivery-name"
                        value={form.deliveryName}
                        onChange={(e) => setForm((f) => ({ ...f, deliveryName: e.target.value }))}
                        placeholder="e.g. Hebburn depot"
                        aria-invalid={shown('deliveryName') !== undefined}
                        aria-describedby="job-delivery-name-error"
                      />
                      <FieldError id="job-delivery-name-error" message={shown('deliveryName')} />
                    </div>
                    <PostcodeField
                      id="job-delivery-postcode"
                      label="Delivery postcode"
                      value={form.deliveryPostcode}
                      onChange={(value) => setForm((f) => ({ ...f, deliveryPostcode: value }))}
                      lookup={deliveryPostcode}
                      error={shown('deliveryPostcode')}
                    />
                    <MarkedPlaces
                      places={markedPlaces.data ?? []}
                      near={deliveryPostcode.data?.location}
                      chosen={deliveryPlace}
                      onChoose={setDeliveryPlace}
                    />
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={saveDelivery}
                        onChange={(e) => setSaveDelivery(e.target.checked)}
                      />
                      Save this location for next time
                    </label>
                  </>
                )}
                <div className="job-form-actions">
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={form.requiresProofOfDelivery}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, requiresProofOfDelivery: e.target.checked }))
                      }
                    />
                    Require proof of delivery
                  </label>
                  <button type="submit" disabled={createJob.isPending}>
                    {createJob.isPending ? 'Creating…' : 'Create job'}
                  </button>
                </div>
              </form>
            </section>
          )}

          <section>
            <h2>All jobs</h2>
            {jobs.isPending ? (
              <p>Loading…</p>
            ) : (
              <DataTable
                columns={jobColumns}
                rows={jobs.data ?? []}
                rowKey={(job) => job.id}
                searchText={(job) =>
                  `${job.reference} ${job.stops.map((stop) => stop.name).join(' ')} ${jobStatusText(job)}`
                }
                emptyText="No jobs yet."
                maxHeight="70vh"
              />
            )}
          </section>
        </>
      )}
    </div>
  );
}

/** The delivery photo a driver attached, full size over the page. Fetched when opened (photos are
 *  megabytes, so the job list never carries them) and shown from a `data:` URL — the response's
 *  content type is validated as `image/*` by the contract, so it can't be a web page. */
function ProofPhotoDialog({
  reference,
  photo,
  onClose,
}: {
  reference: string;
  photo: UseQueryResult<ProofOfDeliveryResponse>;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Proof of delivery for ${reference}`}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          color: '#111827',
          borderRadius: 8,
          padding: 16,
          maxWidth: '90vw',
          maxHeight: '90vh',
          overflow: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <strong>Proof of delivery — {reference}</strong>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
        {photo.isPending ? (
          <p>Loading…</p>
        ) : photo.data === undefined ? (
          <p style={{ color: '#dc2626' }}>{staffErrorMessage(photo.error)}</p>
        ) : (
          <>
            <img
              src={`data:${photo.data.contentType};base64,${photo.data.dataBase64}`}
              alt={`Proof of delivery for ${reference}`}
              style={{ display: 'block', maxWidth: '100%', maxHeight: '75vh', marginTop: 12 }}
            />
            <p style={{ color: '#6b7280', marginBottom: 0 }}>
              Taken {new Date(photo.data.capturedAt).toLocaleString('en-GB')}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/** The assign step's route preview (design doc §5 step 2): as soon as a vehicle is picked, how far
 *  and how long the job is for that vehicle, or that it can't be done at all. Checked before
 *  assigning, not after the driver has been told. An estimate: it ignores traffic and hazards. */
function RoutePreview({ jobId, vehicleId }: { jobId: string; vehicleId: string }) {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const preview = useQuery({
    queryKey: ['job-route-preview', jobId, vehicleId],
    queryFn: () => withAccessToken((token) => jobsApi.previewJobRoute(token, jobId, vehicleId)),
    retry: false,
    staleTime: 5 * 60_000,
  });
  const style = { display: 'block', marginTop: 4, fontSize: 13 } as const;
  if (preview.isPending)
    return <small style={{ ...style, color: '#6b7280' }}>Checking the route…</small>;
  if (preview.data === undefined) {
    return <small style={{ ...style, color: '#dc2626' }}>{staffErrorMessage(preview.error)}</small>;
  }
  if (preview.data.legs.length === 0) {
    return (
      <small style={{ ...style, color: '#374151' }}>
        No pickup, so the route is planned from where the driver is when they set off.
      </small>
    );
  }
  return (
    <small style={{ ...style, color: '#374151' }}>
      {formatMiles(preview.data.distanceKm * 1000)}, about{' '}
      {formatDuration(preview.data.durationMin)} for this vehicle (estimate)
    </small>
  );
}
