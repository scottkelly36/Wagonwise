import type { HazardTypeDto, MeasurementDto } from '@wagonwise/contracts/hazards';

import type { IconName } from '../components/ui/icon';
import { formatMeasurement, HAZARD_TYPE_LABELS } from './hazard-labels';
import { formatHeightWithFeetInches, formatRouteDistance, type DistanceUnit } from './units';

/** The picture on a hazard's map marker, so a low bridge, roadworks and a flood are told apart without a tap. */
export const HAZARD_MARKER_ICONS: Record<HazardTypeDto, IconName> = {
  low_bridge: 'bridge',
  weight_limit: 'weight',
  width_restriction: 'arrow-expand-horizontal',
  tight_bend: 'arrow-u-right-top',
  roadworks: 'traffic-cone',
  flooding: 'waves',
  speed_camera: 'camera',
  mobile_camera: 'police-badge-outline',
  no_hgv: 'truck-remove-outline',
  other: 'alert',
};

/** The figure written on the marker beside the picture: the height, width or weight when the report has one. */
export function hazardMarkerFigure(measurement: MeasurementDto | undefined): string | undefined {
  return measurement === undefined ? undefined : formatMeasurement(measurement);
}

/** The figures of the vehicle the route was planned for, as far as they are known. */
export interface VehicleFigures {
  readonly heightM?: number | undefined;
  readonly widthM?: number | undefined;
  readonly grossWeightT?: number | undefined;
}

function vehicleFigure(
  measurement: MeasurementDto,
  vehicle: VehicleFigures | undefined,
): string | undefined {
  if (vehicle === undefined) return undefined;
  if (measurement.kind === 'height') {
    return vehicle.heightM === undefined ? undefined : formatHeightWithFeetInches(vehicle.heightM);
  }
  if (measurement.kind === 'width') {
    return vehicle.widthM === undefined ? undefined : `${vehicle.widthM}m`;
  }
  return vehicle.grossWeightT === undefined ? undefined : `${vehicle.grossWeightT}t`;
}

/**
 * One hazard in the route overview's list: what it is, its figure, the vehicle's own figure beside it, and how far along the
 * route it is. Both figures are stated and nothing more: the app never says a vehicle will or will not clear something.
 */
export function hazardOnRouteLine(input: {
  readonly type: HazardTypeDto;
  readonly measurement?: MeasurementDto | undefined;
  readonly vehicle?: VehicleFigures | undefined;
  /** How far along the route, in metres; left out when the hazard could not be placed on the line. */
  readonly offsetM?: number | undefined;
  readonly distanceUnit: DistanceUnit;
}): string {
  const parts: string[] = [HAZARD_TYPE_LABELS[input.type]];
  if (input.measurement !== undefined) {
    parts.push(formatMeasurement(input.measurement));
    const own = vehicleFigure(input.measurement, input.vehicle);
    if (own !== undefined) parts.push(`your vehicle ${own}`);
  }
  if (input.offsetM !== undefined) {
    parts.push(`${formatRouteDistance(input.offsetM / 1000, input.distanceUnit)} in`);
  }
  return parts.join(' · ');
}

/** The line on a route card saying how many reported hazards are on that route. */
export function hazardCountLine(count: number): string {
  if (count === 0) return 'No hazards reported on this route';
  return count === 1
    ? '1 hazard reported on this route'
    : `${count} hazards reported on this route`;
}
