import type { PlaceReportReasonDto, ReportedPlaceDto } from '@wagonwise/contracts/places';

const REASON_LABELS: Record<PlaceReportReasonDto, string> = {
  wrong_place: 'In the wrong place',
  private_property: 'Someone’s home or private land',
  offensive: 'Offensive name or note',
  other: 'Something else',
};

/** The reasons drivers gave, most common first, e.g. "Offensive name or note × 2, In the wrong place". */
export function reasonsText(reasons: ReportedPlaceDto['reasons']): string {
  return [...reasons]
    .sort((a, b) => b.count - a.count)
    .map((r) => (r.count > 1 ? `${REASON_LABELS[r.reason]} × ${r.count}` : REASON_LABELS[r.reason]))
    .join(', ');
}

/** Where a reported place is, to look at before deciding. OpenStreetMap, as for hazard reports. */
export function placeMapLink(location: { lat: number; lon: number }): string {
  return `https://www.openstreetmap.org/?mlat=${location.lat}&mlon=${location.lon}#map=18/${location.lat}/${location.lon}`;
}

export function reportedPlaceSearchText(r: ReportedPlaceDto): string {
  return `${r.place.name} ${r.place.note ?? ''} ${reasonsText(r.reasons)}`.toLowerCase();
}
