import type { HazardTypeDto } from '@wagonwise/contracts/hazards';

import type { IconName } from '../components/ui/icon';

/** The two kinds of camera a driver can report. They are stored as hazard types, but the app keeps them apart from hazards. */
export const CAMERA_HAZARD_TYPES = ['speed_camera', 'mobile_camera'] as const;
export type CameraHazardType = (typeof CAMERA_HAZARD_TYPES)[number];

export function isCameraType(type: HazardTypeDto): type is CameraHazardType {
  return (CAMERA_HAZARD_TYPES as readonly HazardTypeDto[]).includes(type);
}

/** Everything that is not a camera: for the hazard picker and the "hazards on this route" list. */
export function withoutCameras<T extends { readonly type: HazardTypeDto }>(
  items: readonly T[],
): T[] {
  return items.filter((item) => !isCameraType(item.type));
}

export interface CameraChoice {
  readonly type: CameraHazardType;
  readonly title: string;
  readonly detail: string;
  readonly icon: IconName;
}

export const CAMERA_CHOICES: readonly CameraChoice[] = [
  {
    type: 'speed_camera',
    title: 'Fixed camera',
    detail: 'A camera on a pole or gantry. It stays until drivers say it has gone.',
    icon: 'camera-outline',
  },
  {
    type: 'mobile_camera',
    title: 'Mobile camera or police check',
    detail:
      'A van or a speed check. It drops off the map after 6 hours unless another driver sees it too.',
    icon: 'police-badge-outline',
  },
];
