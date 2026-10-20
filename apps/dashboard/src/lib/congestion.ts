import type { StaffCongestionReportDto } from '@wagonwise/contracts/congestion';

/** A link to the place on a map, so a report can be checked against where it says it is. */
export const mapLink = (report: Pick<StaffCongestionReportDto, 'location'>): string =>
  `https://www.openstreetmap.org/?mlat=${report.location.lat}&mlon=${report.location.lon}#map=15/${report.location.lat}/${report.location.lon}`;

/** "20 min", or "1 h 5 min" for a long one. */
export function waitText(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** How long a report has left, or that it has run out, for a given moment. */
export function timeLeftText(
  report: Pick<StaffCongestionReportDto, 'active' | 'expiresAt'>,
  now: Date,
): string {
  if (!report.active) return 'Expired';
  const minutes = Math.max(
    0,
    Math.ceil((new Date(report.expiresAt).getTime() - now.getTime()) / 60_000),
  );
  return `${waitText(minutes)} left`;
}
