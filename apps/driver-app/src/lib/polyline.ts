// Decodes Valhalla's route geometry — pinned to polyline6 specifically (decision 52,
// docs/progress.md's M2.3 notes: Valhalla's own default encoding, confirmed against a real
// response, never re-encoded elsewhere in this codebase). Hand-rolled rather than a dependency:
// the algorithm is small and well-understood (AGENTS.md rule 6's "hand-roll small,
// well-understood things," the same reasoning `sha256Hex` and the BFF's `core-client.ts` use).
const PRECISION = 1e6;

/** Returns [lon, lat] pairs — GeoJSON's coordinate order, not [lat, lon] — since the only
 *  consumer (components/route-map.tsx) feeds this straight into a GeoJSON LineString. */
export function decodePolyline6(encoded: string): [number, number][] {
  const coordinates: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lon = 0;

  while (index < encoded.length) {
    lat += decodeSignedValue(encoded, index);
    index = advanceIndex(encoded, index);

    lon += decodeSignedValue(encoded, index);
    index = advanceIndex(encoded, index);

    coordinates.push([lon / PRECISION, lat / PRECISION]);
  }

  return coordinates;
}

function advanceIndex(encoded: string, start: number): number {
  let index = start;
  let byte: number;
  do {
    byte = encoded.charCodeAt(index++) - 63;
  } while (byte >= 0x20);
  return index;
}

function decodeSignedValue(encoded: string, start: number): number {
  let index = start;
  let shift = 0;
  let result = 0;
  let byte: number;
  do {
    byte = encoded.charCodeAt(index++) - 63;
    result |= (byte & 0x1f) << shift;
    shift += 5;
  } while (byte >= 0x20);
  return result & 1 ? ~(result >> 1) : result >> 1;
}
