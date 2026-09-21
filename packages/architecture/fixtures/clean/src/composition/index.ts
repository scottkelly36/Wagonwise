import { buildApp } from '../host/build-app';
import { listActive } from '../modules/hazards/api';
import { systemClock } from '../platform/system-clock';

export const wiring = { listActive, app: buildApp(systemClock) };
