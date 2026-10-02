import { companyIdSchema } from '@wagonwise/contracts/companies';
import type { JobDto } from '@wagonwise/contracts/jobs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import * as companiesApi from '../../api/companies';
import * as fleetApi from '../../api/fleet';
import * as jobsApi from '../../api/jobs';
import { holds, isPlatform } from '../../state/access';
import { useStaffAuthStore } from '../../state/staff-auth-store';
import { staffErrorMessage } from '../staff/messages';

const COMPANIES_KEY = ['companies'] as const;
const TERMINAL: readonly JobDto['status'][] = ['delivered', 'cancelled', 'failed'];

const EMPTY_FORM = {
  reference: '',
  pickupName: '',
  pickupLat: '',
  pickupLon: '',
  deliveryName: '',
  deliveryLat: '',
  deliveryLon: '',
};

/** Dispatch's "create a job, assign a driver and vehicle" slice (P2-M4, design doc §5 steps
 *  1-3). Anyone at the company can see jobs (`canViewJobs` needs no privilege); creating,
 *  assigning and cancelling need `dispatch`, same split as fleet's own pages. Multi-stop routes
 *  and the map pin picker are later nice-to-haves — one pickup and one delivery is enough for a
 *  first pilot firm's jobs. */
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
  const createJob = useMutation({
    mutationFn: () =>
      withAccessToken((token) =>
        jobsApi.createJob(token, companyId as string, {
          companyId: companyIdSchema.parse(companyId),
          reference: form.reference,
          stops: [
            {
              kind: 'pickup',
              name: form.pickupName,
              location: { lat: Number(form.pickupLat), lon: Number(form.pickupLon) },
            },
            {
              kind: 'delivery',
              name: form.deliveryName,
              location: { lat: Number(form.deliveryLat), lon: Number(form.deliveryLon) },
            },
          ],
        }),
      ),
    onSuccess: () => {
      setForm(EMPTY_FORM);
      refreshJobs();
    },
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
                <input
                  value={form.pickupLat}
                  onChange={(e) => setForm((f) => ({ ...f, pickupLat: e.target.value }))}
                  placeholder="Pickup lat"
                  style={{ width: 90 }}
                />
                <input
                  value={form.pickupLon}
                  onChange={(e) => setForm((f) => ({ ...f, pickupLon: e.target.value }))}
                  placeholder="Pickup lon"
                  style={{ width: 90 }}
                />
                <input
                  value={form.deliveryName}
                  onChange={(e) => setForm((f) => ({ ...f, deliveryName: e.target.value }))}
                  placeholder="Delivery name"
                  style={{ width: 140 }}
                />
                <input
                  value={form.deliveryLat}
                  onChange={(e) => setForm((f) => ({ ...f, deliveryLat: e.target.value }))}
                  placeholder="Delivery lat"
                  style={{ width: 90 }}
                />
                <input
                  value={form.deliveryLon}
                  onChange={(e) => setForm((f) => ({ ...f, deliveryLon: e.target.value }))}
                  placeholder="Delivery lon"
                  style={{ width: 90 }}
                />
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
                        {canDispatch && (
                          <td>
                            {job.status === 'draft' && (
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
