import { companyIdSchema } from '@wagonwise/contracts/companies';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import * as companiesApi from '../../api/companies';
import * as fleetApi from '../../api/fleet';
import { holds, isPlatform } from '../../state/access';
import { useStaffAuthStore } from '../../state/staff-auth-store';
import { staffErrorMessage } from '../staff/messages';

const COMPANIES_KEY = ['companies'] as const;
const DIMENSION_FIELDS = [
  { key: 'heightM', label: 'Height (m)' },
  { key: 'widthM', label: 'Width (m)' },
  { key: 'lengthM', label: 'Length (m)' },
  { key: 'grossWeightT', label: 'Gross weight (t)' },
] as const;

const EMPTY_FORM = { name: '', heightM: '', widthM: '', lengthM: '', grossWeightT: '' };

/** A company's own vehicles (Phase 2 tech design doc §3's `fleet` context, first slice).
 *  WagonWise staff pick which company to view; a company's own staff with "Manage fleet" only
 *  ever see and manage their own. Core enforces that (and its database refuses other companies'
 *  rows) whatever this page shows, but there's no reason to offer a picker with nothing in it. */
export function VehicleProfiles() {
  const me = useStaffAuthStore((s) => s.session?.staff);
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const everyCompany = isPlatform(me);
  const canManage = holds(me, 'manage_fleet');
  const queryClient = useQueryClient();

  const companies = useQuery({
    queryKey: COMPANIES_KEY,
    queryFn: () => withAccessToken((token) => companiesApi.listCompanies(token)),
    enabled: everyCompany,
  });

  const [selectedCompanyId, setSelectedCompanyId] = useState<string | undefined>(undefined);
  const companyId = everyCompany ? selectedCompanyId : me?.companyId;
  const vehiclesKey = ['fleet-vehicles', companyId] as const;

  const vehicles = useQuery({
    queryKey: vehiclesKey,
    queryFn: () =>
      withAccessToken((token) => fleetApi.listFleetVehicles(token, companyId as string)),
    enabled: canManage && companyId !== undefined,
  });

  const [form, setForm] = useState(EMPTY_FORM);
  const createVehicle = useMutation({
    mutationFn: () =>
      withAccessToken((token) =>
        fleetApi.createFleetVehicle(token, companyId as string, {
          companyId: companyIdSchema.parse(companyId),
          name: form.name,
          dimensions: {
            heightM: Number(form.heightM),
            widthM: Number(form.widthM),
            lengthM: Number(form.lengthM),
            grossWeightT: Number(form.grossWeightT),
          },
        }),
      ),
    onSuccess: () => {
      setForm(EMPTY_FORM);
      void queryClient.invalidateQueries({ queryKey: vehiclesKey });
    },
  });

  const deleteVehicle = useMutation({
    mutationFn: (id: string) => withAccessToken((token) => fleetApi.deleteFleetVehicle(token, id)),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: vehiclesKey }),
  });

  function handleSubmit(): void {
    if (form.name.trim().length === 0 || companyId === undefined) return;
    createVehicle.mutate();
  }

  const error = companies.error ?? vehicles.error ?? createVehicle.error ?? deleteVehicle.error;

  if (!canManage) {
    return (
      <div>
        <h1>Vehicle profiles</h1>
        <p>
          You don't have permission to manage vehicles. Ask someone at your company with the "Manage
          users" privilege to give you "Manage vehicles".
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1>Vehicle profiles</h1>
      <p style={{ color: '#6b7280' }}>Your company's own fleet.</p>

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
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
            style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}
          >
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Vehicle name"
            />
            {DIMENSION_FIELDS.map((field) => (
              <input
                key={field.key}
                value={form[field.key]}
                onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                placeholder={field.label}
                style={{ width: 110 }}
              />
            ))}
            <button type="submit" disabled={createVehicle.isPending || form.name.trim() === ''}>
              {createVehicle.isPending ? 'Adding…' : 'Add vehicle'}
            </button>
          </form>

          {vehicles.isPending ? (
            <p>Loading…</p>
          ) : vehicles.data?.length === 0 ? (
            <p style={{ color: '#6b7280' }}>No vehicles yet.</p>
          ) : (
            <table style={{ width: '100%', textAlign: 'left' }}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Height</th>
                  <th>Width</th>
                  <th>Length</th>
                  <th>Weight</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {vehicles.data?.map((vehicle) => (
                  <tr key={vehicle.id}>
                    <td>{vehicle.name}</td>
                    <td>{vehicle.dimensions.heightM}m</td>
                    <td>{vehicle.dimensions.widthM}m</td>
                    <td>{vehicle.dimensions.lengthM}m</td>
                    <td>{vehicle.dimensions.grossWeightT}t</td>
                    <td>
                      <button
                        onClick={() => deleteVehicle.mutate(vehicle.id)}
                        disabled={deleteVehicle.isPending}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
