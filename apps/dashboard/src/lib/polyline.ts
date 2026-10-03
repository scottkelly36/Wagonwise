// Decodes Valhalla route geometry, polyline6 (1e6 precision), the encoding core passes through
// untouched. A copy of driver-app/src/lib/polyline.ts: the two apps share no code package and the
// algorithm is a few lines, so it is duplicated rather than given a package of its own.
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
