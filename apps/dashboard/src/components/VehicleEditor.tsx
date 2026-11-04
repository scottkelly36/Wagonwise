import type { FleetVehicleDto } from '@wagonwise/contracts/fleet';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import * as fleetApi from '../api/fleet';
import { staffErrorMessage } from '../pages/staff/messages';
import { useStaffAuthStore } from '../state/staff-auth-store';

const DIMENSIONS = [
  { key: 'heightM', label: 'Height (m)' },
  { key: 'widthM', label: 'Width (m)' },
  { key: 'lengthM', label: 'Length (m)' },
  { key: 'grossWeightT', label: 'Gross weight (t)' },
] as const;

/**
 * Changes a company vehicle's name, registration number and measurements. The registration is tidied and checked by
 * core ("ab12 cde" is "AB12CDE"); a blank one removes it. The measurements are the ones routes are planned with, so a
 * change here changes the routes the vehicle is given.
 */
export function VehicleEditor({
  vehicle,
  onDone,
  onCancel,
}: {
  vehicle: FleetVehicleDto;
  onDone: () => void;
  onCancel: () => void;
}) {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const [name, setName] = useState(vehicle.name);
  const [registration, setRegistration] = useState(vehicle.registration ?? '');
  const [dimensions, setDimensions] = useState({
    heightM: String(vehicle.dimensions.heightM),
    widthM: String(vehicle.dimensions.widthM),
    lengthM: String(vehicle.dimensions.lengthM),
    grossWeightT: String(vehicle.dimensions.grossWeightT),
  });

  const numbers = DIMENSIONS.map((d) => Number(dimensions[d.key]));
  const valid = name.trim() !== '' && numbers.every((n) => Number.isFinite(n) && n > 0);

  const save = useMutation({
    mutationFn: () =>
      withAccessToken((token) =>
        fleetApi.updateFleetVehicle(token, vehicle.id, {
          name,
          registration,
          dimensions: {
            heightM: Number(dimensions.heightM),
            widthM: Number(dimensions.widthM),
            lengthM: Number(dimensions.lengthM),
            grossWeightT: Number(dimensions.grossWeightT),
            ...(vehicle.dimensions.axleWeightT === undefined
              ? {}
              : { axleWeightT: vehicle.dimensions.axleWeightT }),
          },
        }),
      ),
    onSuccess: onDone,
  });

  return (
    <section className="mt-24 box">
      <h2 className="mt-0">Edit {vehicle.name}</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) save.mutate();
        }}
        className="flex gap-12 wrap items-end"
      >
        <label>
          <span className="block">Vehicle name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: 220 }} />
        </label>
        <label>
          <span className="block">Registration</span>
          <input
            value={registration}
            maxLength={20}
            placeholder="e.g. NX21 ABC"
            onChange={(e) => setRegistration(e.target.value)}
            style={{ width: 130 }}
          />
        </label>
        {DIMENSIONS.map((d) => (
          <label key={d.key}>
            <span className="block">{d.label}</span>
            <input
              inputMode="decimal"
              value={dimensions[d.key]}
              onChange={(e) => setDimensions((all) => ({ ...all, [d.key]: e.target.value }))}
              style={{ width: 90 }}
            />
          </label>
        ))}
        <button type="submit" disabled={!valid || save.isPending}>
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </form>
      {save.isError && <p className="text-danger">{staffErrorMessage(save.error)}</p>}
    </section>
  );
}
