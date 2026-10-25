import type { Id } from '../../../shared/brand.js';

export type SosAlertId = Id<'SosAlertId'>;
export type CompanyId = Id<'CompanyId'>;
export type DriverId = Id<'DriverId'>;
export type StaffId = Id<'StaffId'>;

export interface GeoPoint {
  readonly lat: number;
  readonly lon: number;
}

export type SosStatus = 'open' | 'resolved' | 'cancelled';

/**
 * One company told about one driver's SOS. The driver's details are copied in when it is made, so the record says what the office
 * was told whatever changes afterwards. One press can make several (a driver who is not on a job tells every company they drive
 * for); they share a `requestId`, chosen by the app, so a retry does not tell the office twice.
 */
export interface SosAlert {
  readonly id: SosAlertId;
  readonly requestId: string;
  readonly companyId: CompanyId;
  readonly driverId: DriverId;
  readonly driverName: string | undefined;
  /** The number or email the driver signs in with: how to ring them. */
  readonly driverContact: string | undefined;
  readonly vehicleName: string | undefined;
  readonly vehicleRegistration: string | undefined;
  readonly jobReference: string | undefined;
  readonly location: GeoPoint;
  /** Three words joined by dots, when the lookup answered in time. */
  readonly words: string | undefined;
  readonly nearestPlace: string | undefined;
  readonly status: SosStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly resolvedBy: StaffId | undefined;
  readonly resolvedAt: Date | undefined;
}

/** A map link anyone can open, from a position. OpenStreetMap, as elsewhere in the portal. */
export function mapLink(location: GeoPoint): string {
  return `https://www.openstreetmap.org/?mlat=${location.lat}&mlon=${location.lon}#map=18/${location.lat}/${location.lon}`;
}

/** The position as text to read out when there are no three words. */
export function coordinatesText(location: GeoPoint): string {
  return `${location.lat.toFixed(5)}, ${location.lon.toFixed(5)}`;
}

function when(at: Date): string {
  return at.toLocaleString('en-GB', {
    timeZone: 'Europe/London',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function whereLines(alert: SosAlert): string[] {
  const place =
    alert.words === undefined
      ? `Position: ${coordinatesText(alert.location)}`
      : `Where: ///${alert.words}${alert.nearestPlace === undefined ? '' : `, near ${alert.nearestPlace}`}`;
  return [place, `Map: ${mapLink(alert.location)}`];
}

/** The email the office gets when a driver presses SOS: who, where, how to ring them, and what WagonWise did not do. */
export function alertEmail(
  alert: SosAlert,
  portalUrl: string | undefined,
): { subject: string; text: string } {
  const who = alert.driverName ?? 'A driver';
  const vehicle = [alert.vehicleName, alert.vehicleRegistration].filter((v) => v !== undefined);
  const lines = [
    `${who} pressed SOS in the WagonWise app at ${when(alert.createdAt)}.`,
    '',
    ...whereLines(alert),
    ...(alert.driverContact === undefined ? [] : [`Ring the driver: ${alert.driverContact}`]),
    ...(vehicle.length === 0 ? [] : [`Vehicle: ${vehicle.join(' ')}`]),
    ...(alert.jobReference === undefined ? [] : [`Job: ${alert.jobReference}`]),
    '',
    'WagonWise has not contacted the emergency services. Ring the driver. If they cannot answer, or need help, call 999 and give the three words or the map link above.',
    ...(portalUrl === undefined ? [] : ['', `Open it in the portal: ${portalUrl}`]),
    '',
    'Sent by WagonWise.',
  ];
  return {
    subject: `SOS: ${who}${vehicle.length === 0 ? '' : ` (${vehicle.join(' ')})`}`,
    text: lines.join('\n'),
  };
}

/** The follow-up when the driver says it was a mistake or they are all right. */
export function cancelledEmail(alert: SosAlert): { subject: string; text: string } {
  const who = alert.driverName ?? 'The driver';
  return {
    subject: `SOS cancelled: ${who}`,
    text: [
      `${who} has said the SOS sent at ${when(alert.createdAt)} was a mistake or that they are all right.`,
      alert.driverContact === undefined
        ? 'It may still be worth ringing them to check.'
        : `It may still be worth ringing them to check: ${alert.driverContact}`,
      '',
      'Sent by WagonWise.',
    ].join('\n'),
  };
}
