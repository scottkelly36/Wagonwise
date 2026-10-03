import { companyIdSchema } from '@wagonwise/contracts/companies';
import type { JobDto, ProofOfDeliveryResponse } from '@wagonwise/contracts/jobs';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import * as companiesApi from '../../api/companies';
import * as fleetApi from '../../api/fleet';
import * as jobsApi from '../../api/jobs';
import { resolvePostcode, usePostcode } from '../../hooks/use-postcode';
import { formatDuration, formatMiles } from '../../lib/live-map';
import { PostcodeNotFoundError, type ResolvedPostcode } from '../../lib/postcodes';
import { holds, isPlatform } from '../../state/access';
import { useStaffAuthStore } from '../../state/staff-auth-store';
import { staffErrorMessage } from '../staff/messages';

const COMPANIES_KEY = ['companies'] as const;
const TERMINAL: readonly JobDto['status'][] = ['delivered', 'cancelled', 'failed'];

const EMPTY_FORM = {
  reference: '',
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
  const createJob = useMutation({
    mutationFn: async () => {
      // Resolved here rather than trusting the live hint's state, so a fast click on Create can't
      // outrun the lookup; the cache makes it free when the hint has already got the answer.
      const [pickup, delivery] = await Promise.all([
        resolvePostcode(queryClient, form.pickupPostcode),
        resolvePostcode(queryClient, form.deliveryPostcode),
      ]);
      return withAccessToken((token) =>
        jobsApi.createJob(token, companyId as string, {
          companyId: companyIdSchema.parse(companyId),
          reference: form.reference,
          stops: [
            { kind: 'pickup', name: form.pickupName, location: pickup.location },
            { kind: 'delivery', name: form.deliveryName, location: delivery.location },
          ],
          requiresProofOfDelivery: form.requiresProofOfDelivery,
        }),
      );
    },
    onSuccess: () => {
      setForm(EMPTY_FORM);
      refreshJobs();
    },
  });

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
    if (
      form.reference.trim() === '' ||
      form.pickupName.trim() === '' ||
      form.deliveryName.trim() === '' ||
      form.pickupPostcode.trim() === '' ||
      form.deliveryPostcode.trim() === '' ||
      companyId === undefined
    ) {
      return;
    }
    createJob.mutate();
  }

  const activeDrivers = (drivers.data ?? []).filter(
    (link) => link.status === 'active' && link.driverId !== undefined,
  );

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
                onSubmit={(e) => {
                  e.preventDefault();
                  handleCreate();
                }}
                style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}
              >
                <input
                  value={form.reference}
                  onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
                  placeholder="Reference"
                  style={{ width: 120 }}
                />
                <input
                  value={form.pickupName}
                  onChange={(e) => setForm((f) => ({ ...f, pickupName: e.target.value }))}
                  placeholder="Pickup name"
                  style={{ width: 140 }}
                />
                <PostcodeField
                  value={form.pickupPostcode}
                  onChange={(value) => setForm((f) => ({ ...f, pickupPostcode: value }))}
                  placeholder="Pickup postcode"
                  lookup={pickupPostcode}
                />
                <input
                  value={form.deliveryName}
                  onChange={(e) => setForm((f) => ({ ...f, deliveryName: e.target.value }))}
                  placeholder="Delivery name"
                  style={{ width: 140 }}
                />
                <PostcodeField
                  value={form.deliveryPostcode}
                  onChange={(value) => setForm((f) => ({ ...f, deliveryPostcode: value }))}
                  placeholder="Delivery postcode"
                  lookup={deliveryPostcode}
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, height: 36 }}>
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
              </form>
            </section>
          )}

          <section>
            <h2>All jobs</h2>
            {jobs.isPending ? (
              <p>Loading…</p>
            ) : jobs.data?.length === 0 ? (
              <p style={{ color: '#6b7280' }}>No jobs yet.</p>
            ) : (
              <table style={{ width: '100%', textAlign: 'left' }}>
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Stops</th>
                    <th>Status</th>
                    <th>Proof of delivery</th>
                    {canDispatch && <th />}
                  </tr>
                </thead>
                <tbody>
                  {jobs.data?.map((job) => {
                    const picked = assigning[job.id] ?? { driverId: '', vehicleId: '' };
                    return (
                      <tr key={job.id}>
                        <td>{job.reference}</td>
                        <td>{job.stops.map((s) => s.name).join(' → ')}</td>
                        <td>{job.status}</td>
                        <td>
                          {job.hasProofOfDelivery ? (
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
                          )}
                        </td>
                        {canDispatch && (
                          <td>
                            {job.status === 'draft' && (
                              <>
                                <span style={{ display: 'inline-flex', gap: 4 }}>
                                  <select
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
                                      </option>
                                    ))}
                                  </select>
                                  <select
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
                                    onClick={() => assign.mutate(job.id)}
                                    disabled={
                                      assign.isPending ||
                                      picked.driverId === '' ||
                                      picked.vehicleId === ''
                                    }
                                  >
                                    Assign
                                  </button>
                                </span>
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
                                style={{ marginLeft: 4 }}
                              >
                                Cancel
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  );
}

/** A postcode box with the place it resolves to underneath, so a typo that happens to be another
 *  real postcode ("NE46" vs "NE45") is caught by the dispatcher before the driver is sent there. */
function PostcodeField({
  value,
  onChange,
  placeholder,
  lookup,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  lookup: UseQueryResult<ResolvedPostcode>;
}) {
  let hint: { text: string; color: string } | undefined;
  if (lookup.isFetching) {
    hint = { text: 'Looking up…', color: '#6b7280' };
  } else if (lookup.data !== undefined) {
    hint = { text: `✓ ${lookup.data.place}`, color: '#15803d' };
  } else if (lookup.error instanceof PostcodeNotFoundError) {
    hint = { text: "Can't find that postcode", color: '#dc2626' };
  } else if (lookup.error !== null) {
    hint = { text: "Couldn't check it just now", color: '#b45309' };
  }
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        style={{ width: 130, textTransform: 'uppercase' }}
      />
      <small style={{ color: hint?.color, minHeight: 16 }}>{hint?.text}</small>
    </span>
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
  return (
    <small style={{ ...style, color: '#374151' }}>
      {formatMiles(preview.data.distanceKm * 1000)}, about{' '}
      {formatDuration(preview.data.durationMin)} for this vehicle (estimate)
    </small>
  );
}
