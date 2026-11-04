import type { IconName } from '../components/ui/icon';
import { PRODUCT_NAME } from '../product';

export interface WalkthroughStep {
  readonly icon: IconName;
  readonly title: string;
  readonly body: string;
}

/** The first-run tour: what the app does and where to find it, in the order a driver meets it. Keep each step to what is built. */
export const WALKTHROUGH_STEPS: readonly WalkthroughStep[] = [
  {
    icon: 'truck-outline',
    title: 'Routes that fit your vehicle',
    body: 'Save your vehicle’s height, width, length and weight once, under More, Vehicle profiles. Then search for a place on the map and the route keeps clear of low bridges and roads you can’t use.',
  },
  {
    icon: 'alert-outline',
    title: 'Hazards ahead, spoken aloud',
    body: `${PRODUCT_NAME} warns you about hazards on your route so you can keep your eyes on the road. Report one with a tap or by voice. Reports are shared with other drivers without your name.`,
  },
  {
    icon: 'parking',
    title: 'Parking, fuel and breaks',
    body: 'Find lay-bys and services with toilets, showers and food, and see nearby fuel prices. The driving-hours clock plans breaks into your route. It is a guide only: your tachograph is the legal record.',
  },
  {
    icon: 'briefcase-outline',
    title: 'Driving for a company?',
    body: 'Join your company under More, My companies. Then accept its jobs, follow the stops and take proof-of-delivery photos. Your company sees where you are only while you are on one of its jobs.',
  },
];

/** Shown under the last step: the one line that matters more than the rest. */
export const WALKTHROUGH_CLOSING = `${PRODUCT_NAME} is a planning aid. Road signs and the law always come first.`;
