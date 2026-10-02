import type { DomainEvent } from '../../../shared/domain-event.js';
import type { DriverLink } from './driver-link.js';

/** Design doc §3's `DriverJoinedFleet` / `DriverLeftFleet`. */
export interface DriverLinkEventPayload {
  readonly linkId: string;
  readonly companyId: string;
  readonly driverId: string;
}

export interface DriverLeftFleetPayload extends DriverLinkEventPayload {
  /** Who ended it: the driver leaving, or the company removing them. */
  readonly by: 'driver' | 'company';
}

function event<P>(eventId: string, link: DriverLink, eventType: string, payload: P) {
  return { eventId, aggregateType: 'DriverLink', aggregateId: link.id, eventType, payload };
}

function base(link: DriverLink): DriverLinkEventPayload {
  return { linkId: link.id, companyId: link.companyId, driverId: link.driverId ?? '' };
}

export function driverJoinedFleetEvent(
  eventId: string,
  link: DriverLink,
): DomainEvent<DriverLinkEventPayload> {
  return event(eventId, link, 'DriverJoinedFleet', base(link));
}

export function driverLeftFleetEvent(
  eventId: string,
  link: DriverLink,
  by: 'driver' | 'company',
): DomainEvent<DriverLeftFleetPayload> {
  return event(eventId, link, 'DriverLeftFleet', { ...base(link), by });
}
