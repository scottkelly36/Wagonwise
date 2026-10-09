import { companyIdSchema } from '@wagonwise/contracts/companies';
import type { FleetVehicleDto } from '@wagonwise/contracts/fleet';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import * as companiesApi from '../../api/companies';
import * as fleetApi from '../../api/fleet';
import { DataTable, IconButton, type Column } from '../../components/DataTable';
import { FieldError } from '../../components/FieldError';
import { VehicleEditor } from '../../components/VehicleEditor';
import { VehicleMaintenance } from '../../components/VehicleMaintenance';
import { focusFirstInvalid, hasErrors, type FieldErrors } from '../../lib/forms';
import { holds, isPlatform } from '../../state/access';
import { useStaffAuthStore } from '../../state/staff-auth-store';
import { staffErrorMessage } from '../staff/messages';

const COMPANIES_KEY = ['companies'] as const;
const DIMENSION_FIELDS = [
  { key: 'heightM', label: 'Height (m)', noun: 'height in metres', example: '3.8' },
  { key: 'widthM', label: 'Width (m)', noun: 'width in metres', example: '2.55' },
  { key: 'lengthM', label: 'Length (m)', noun: 'length in metres', example: '16.5' },
  { key: 'grossWeightT', label: 'Gross weight (t)', noun: 'gross weight in tonnes', example: '44' },
] as const;

const EMPTY_FORM = {
  name: '',
  registration: '',
  heightM: '',
  widthM: '',
  lengthM: '',
  grossWeightT: '',
};

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
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [maintenanceId, setMaintenanceId] = useState<string | undefined>(undefined);
  const createVehicle = useMutation({
    mutationFn: () =>
      withAccessToken((token) =>
        fleetApi.createFleetVehicle(token, companyId as string, {
          companyId: companyIdSchema.parse(companyId),
          name: form.name,
          registration: form.registration,
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
      setShowErrors(false);
      void queryClient.invalidateQueries({ queryKey: vehiclesKey });
    },
  });

  const deleteVehicle = useMutation({
    mutationFn: (id: string) => withAccessToken((token) => fleetApi.deleteFleetVehicle(token, id)),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: vehiclesKey }),
  });

  const [showErrors, setShowErrors] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const errors: FieldErrors<'name' | (typeof DIMENSION_FIELDS)[number]['key']> = {};
  if (form.name.trim() === '') errors.name = 'Enter a name so you can tell vehicles apart.';
  for (const field of DIMENSION_FIELDS) {
    const value = form[field.key].trim();
    if (value === '') errors[field.key] = `Enter the ${field.noun}, like ${field.example}.`;
    else if (!(Number(value) > 0)) errors[field.key] = `Enter ${field.noun} as a number above 0.`;
  }
  const shown = (field: keyof typeof errors): string | undefined =>
    showErrors ? errors[field] : undefined;

  function handleSubmit(): void {
    if (companyId === undefined) return;
    if (hasErrors(errors)) {
      setShowErrors(true);
      focusFirstInvalid(formRef.current);
      return;
    }
    createVehicle.mutate();
  }

  const vehicleColumns: Column<FleetVehicleDto>[] = [
    { key: 'name', header: 'Name', sortValue: (v) => v.name, cell: (v) => v.name },
    {
      key: 'registration',
      header: 'Registration',
      sortValue: (v) => v.registration ?? '',
      cell: (v) => v.registration ?? '—',
    },
    {
      key: 'height',
      header: 'Height',
      sortValue: (v) => v.dimensions.heightM,
      cell: (v) => `${v.dimensions.heightM} m`,
    },
    {
      key: 'width',
      header: 'Width',
      sortValue: (v) => v.dimensions.widthM,
      cell: (v) => `${v.dimensions.widthM} m`,
    },
    {
      key: 'length',
      header: 'Length',
      sortValue: (v) => v.dimensions.lengthM,
      cell: (v) => `${v.dimensions.lengthM} m`,
    },
    {
      key: 'weight',
      header: 'Weight',
      sortValue: (v) => v.dimensions.grossWeightT,
      cell: (v) => `${v.dimensions.grossWeightT} t`,
    },
    {
      key: 'edit',
      header: '',
      align: 'right',
      cell: (v) => (
        <span style={{ display: 'inline-flex', gap: 6 }}>
          <button type="button" onClick={() => setMaintenanceId(v.id)}>
            Maintenance
          </button>
          <button type="button" onClick={() => setEditingId(v.id)}>
            Edit
          </button>
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (v) => (
        <IconButton
          icon="delete"
          danger
          label={`Delete ${v.name}`}
          disabled={deleteVehicle.isPending}
          onClick={() => {
            if (window.confirm(`Delete ${v.name}?`)) deleteVehicle.mutate(v.id);
          }}
        />
      ),
    },
  ];

  const editing = (vehicles.data ?? []).find((v) => v.id === editingId);
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
      <p style={{ color: 'var(--text-muted)' }}>Your company's own fleet.</p>

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

      {error !== null && <p style={{ color: 'var(--danger)' }}>{staffErrorMessage(error)}</p>}

      {companyId === undefined ? (
        <p style={{ color: 'var(--text-muted)' }}>
          {everyCompany ? 'Choose a company above.' : 'No company assigned to your account.'}
        </p>
      ) : (
        <>
          <form
            ref={formRef}
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
            className="form-row"
          >
            <div className="field" style={{ flex: '2 1 200px' }}>
              <label htmlFor="vehicle-name">Vehicle name</label>
              <input
                id="vehicle-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Scania R450, NX21 ABC"
                aria-invalid={shown('name') !== undefined}
                aria-describedby="vehicle-name-error"
              />
              <FieldError id="vehicle-name-error" message={shown('name')} />
            </div>
            <div className="field" style={{ flex: '1 1 140px' }}>
              <label htmlFor="vehicle-registration">Registration</label>
              <input
                id="vehicle-registration"
                value={form.registration}
                maxLength={20}
                onChange={(e) => setForm((f) => ({ ...f, registration: e.target.value }))}
                placeholder="e.g. NX21 ABC"
              />
            </div>
            {DIMENSION_FIELDS.map((field) => (
              <div key={field.key} className="field" style={{ flex: '1 1 120px' }}>
                <label htmlFor={`vehicle-${field.key}`}>{field.label}</label>
                <input
                  id={`vehicle-${field.key}`}
                  inputMode="decimal"
                  value={form[field.key]}
                  onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                  placeholder={field.example}
                  aria-invalid={shown(field.key) !== undefined}
                  aria-describedby={`vehicle-${field.key}-error`}
                />
                <FieldError id={`vehicle-${field.key}-error`} message={shown(field.key)} />
              </div>
            ))}
            <button type="submit" disabled={createVehicle.isPending} className="form-row-button">
              {createVehicle.isPending ? 'Adding…' : 'Add vehicle'}
            </button>
          </form>

          {vehicles.isPending ? (
            <p>Loading…</p>
          ) : (
            <DataTable
              columns={vehicleColumns}
              rows={vehicles.data ?? []}
              rowKey={(vehicle) => vehicle.id}
              searchText={(vehicle) => `${vehicle.name} ${vehicle.registration ?? ''}`}
              emptyText="No vehicles yet."
            />
          )}
          {maintenanceId !== undefined && (
            <VehicleMaintenance
              key={maintenanceId}
              vehicleId={maintenanceId}
              canManage={holds(me, 'manage_maintenance')}
              onClose={() => setMaintenanceId(undefined)}
            />
          )}
          {editing !== undefined && (
            <VehicleEditor
              key={editing.id}
              vehicle={editing}
              onCancel={() => setEditingId(undefined)}
              onDone={() => {
                setEditingId(undefined);
                void queryClient.invalidateQueries({ queryKey: vehiclesKey });
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
