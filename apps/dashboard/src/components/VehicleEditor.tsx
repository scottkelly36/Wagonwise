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

const KPH_PER_MPH = 1.609344;
/** 19 to 80 mph, which is core's 30 to 130 km/h. */
const MIN_TOP_SPEED_MPH = 19;
const MAX_TOP_SPEED_MPH = 80;

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

  // Kept in km/h, shown in mph (what a lorry's limiter is called here). An untouched box sends the stored figure back as it was, so
  // opening and saving a vehicle never nudges its speed through the round trip.
  const storedMph =
    vehicle.dimensions.topSpeedKph === undefined
      ? ''
      : String(Math.round(vehicle.dimensions.topSpeedKph / KPH_PER_MPH));
  const [topSpeedMph, setTopSpeedMph] = useState(storedMph);
  const topSpeedText = topSpeedMph.trim();
  const topSpeedValue = Number(topSpeedText);
  const topSpeedValid =
    topSpeedText === '' ||
    (Number.isFinite(topSpeedValue) &&
      topSpeedValue >= MIN_TOP_SPEED_MPH &&
      topSpeedValue <= MAX_TOP_SPEED_MPH);
  const topSpeedKph =
    topSpeedText === ''
      ? undefined
      : topSpeedText === storedMph
        ? vehicle.dimensions.topSpeedKph
        : Math.round(topSpeedValue * KPH_PER_MPH * 10) / 10;

  // Yes, no, or not stated: a vehicle is never assumed to meet Euro VI. Not stated is kept as absent.
  const [euroVI, setEuroVI] = useState<'' | 'yes' | 'no'>(
    vehicle.dimensions.euroVI === undefined ? '' : vehicle.dimensions.euroVI ? 'yes' : 'no',
  );

  const numbers = DIMENSIONS.map((d) => Number(dimensions[d.key]));
  const valid =
    name.trim() !== '' && numbers.every((n) => Number.isFinite(n) && n > 0) && topSpeedValid;

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
            ...(topSpeedKph === undefined ? {} : { topSpeedKph }),
            ...(euroVI === '' ? {} : { euroVI: euroVI === 'yes' }),
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
        <label>
          <span className="block">Top speed (mph, optional)</span>
          <input
            inputMode="decimal"
            value={topSpeedMph}
            placeholder="55"
            aria-label="Top speed in miles per hour"
            aria-invalid={!topSpeedValid}
            onChange={(e) => setTopSpeedMph(e.target.value)}
            style={{ width: 90 }}
          />
        </label>
        <label>
          <span className="block">Euro VI engine</span>
          <select
            value={euroVI}
            aria-label="Whether the vehicle meets Euro VI"
            onChange={(e) => setEuroVI(e.target.value as '' | 'yes' | 'no')}
          >
            <option value="">Not stated</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
        <button type="submit" disabled={!valid || save.isPending}>
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </form>
      <p className="mt-12 text-muted text-13">
        Top speed is what arrival times are worked out at for this vehicle, such as a speed limiter
        (56 mph on most lorries). Leave it blank for the usual 55 mph. It changes the time a route
        takes, not which road is chosen. Euro VI is what the low emission and clean air zones ask
        about; "Not stated" is treated as a charge that may apply, never as compliant.
      </p>
      {!topSpeedValid && (
        <p className="text-danger">
          Top speed should be between {MIN_TOP_SPEED_MPH} and {MAX_TOP_SPEED_MPH} mph.
        </p>
      )}
      {save.isError && <p className="text-danger">{staffErrorMessage(save.error)}</p>}
    </section>
  );
}
