import type { SosAlertDto } from '@wagonwise/contracts/sos';

/** A link to ring or email the driver: a phone number rings, an email address writes, anything else is just text. */
export function contactHref(contact: string): string | undefined {
  const trimmed = contact.trim();
  if (trimmed.includes('@')) return `mailto:${trimmed}`;
  const digits = trimmed.replace(/[\s()-]/g, '');
  return /^\+?\d{6,15}$/.test(digits) ? `tel:${digits}` : undefined;
}

/** How long ago it was sent, in words a person reads at a glance. */
export function sinceText(createdAt: string, now: Date): string {
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(createdAt).getTime()) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes === 1) return '1 minute ago';
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
}

/** Where the driver is: the three words with the nearest town, or the position when there are none. */
export function whereText(alert: Pick<SosAlertDto, 'words' | 'nearestPlace' | 'location'>): string {
  if (alert.words !== undefined) {
    return `///${alert.words}${alert.nearestPlace === undefined ? '' : `, near ${alert.nearestPlace}`}`;
  }
  return `${alert.location.lat.toFixed(5)}, ${alert.location.lon.toFixed(5)}`;
}

/** The lorry: its name and registration, whichever there are. */
export function vehicleText(
  alert: Pick<SosAlertDto, 'vehicleName' | 'vehicleRegistration'>,
): string | undefined {
  const parts = [alert.vehicleName, alert.vehicleRegistration].filter((p) => p !== undefined);
  return parts.length === 0 ? undefined : parts.join(' ');
}

/** A map link anyone can open. OpenStreetMap, as for hazard reports. */
export function sosMapLink(location: { lat: number; lon: number }): string {
  return `https://www.openstreetmap.org/?mlat=${location.lat}&mlon=${location.lon}#map=18/${location.lat}/${location.lon}`;
}
