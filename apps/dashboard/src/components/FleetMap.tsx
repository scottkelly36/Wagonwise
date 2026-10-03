import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';

import { maptilerApiKey } from '../api/config';
import { mapStyleUrl } from '../lib/live-map';

export interface MapMarker {
  readonly id: string;
  readonly lat: number;
  readonly lon: number;
  readonly label: string;
  readonly color: string;
  /** A vehicle is a filled circle; a stop (shown for the selected job) is a smaller square. */
  readonly kind: 'vehicle' | 'stop';
  readonly selected?: boolean;
}

interface Props {
  readonly markers: readonly MapMarker[];
  readonly selectedId: string | undefined;
  readonly onSelect: (id: string) => void;
}

// A UK-wide view until there is something to fit to.
const UK_CENTRE: [number, number] = [-2.5, 54.5];

function markerElement(marker: MapMarker, onSelect: (id: string) => void): HTMLElement {
  const el = document.createElement('div');
  const size = marker.kind === 'vehicle' ? 22 : 14;
  Object.assign(el.style, {
    width: `${size}px`,
    height: `${size}px`,
    background: marker.color,
    border: `${marker.selected ? 4 : 2}px solid #fff`,
    borderRadius: marker.kind === 'vehicle' ? '50%' : '3px',
    boxShadow: '0 0 0 1px rgba(0,0,0,0.35)',
    cursor: marker.kind === 'vehicle' ? 'pointer' : 'default',
    boxSizing: 'border-box',
  });
  el.title = marker.label;
  if (marker.kind === 'vehicle') el.addEventListener('click', () => onSelect(marker.id));
  return el;
}

/** The dispatcher's map (P2-M6.2): one marker per vehicle on the road, plus the selected job's
 *  stops. Imperative MapLibre inside one effect each for creating the map and for syncing markers —
 *  React owns the data, MapLibre owns the pixels. */
export function FleetMap({ markers, selectedId, onSelect }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const live = useRef(new Map<string, maplibregl.Marker>());
  const fitted = useRef(false);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (container.current === null) return;
    const instance = new maplibregl.Map({
      container: container.current,
      style: mapStyleUrl(maptilerApiKey),
      center: UK_CENTRE,
      zoom: 5,
    });
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.current = instance;
    const markersByKey = live.current;
    return () => {
      for (const marker of markersByKey.values()) marker.remove();
      markersByKey.clear();
      instance.remove();
      map.current = null;
      fitted.current = false;
    };
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (instance === null) return;
    const existing = live.current;
    const wanted = new Set(markers.map((m) => `${m.kind}:${m.id}`));

    for (const [key, marker] of existing) {
      if (!wanted.has(key)) {
        marker.remove();
        existing.delete(key);
      }
    }
    for (const m of markers) {
      const key = `${m.kind}:${m.id}`;
      // Rebuilt rather than patched: colour, label and highlight can all change between polls, and
      // there are a handful of markers at most.
      existing.get(key)?.remove();
      const marker = new maplibregl.Marker({
        element: markerElement(m, (id) => onSelectRef.current(id)),
      })
        .setLngLat([m.lon, m.lat])
        .addTo(instance);
      existing.set(key, marker);
    }

    const vehicles = markers.filter((m) => m.kind === 'vehicle');
    if (!fitted.current && vehicles.length > 0) {
      fitted.current = true;
      const bounds = new maplibregl.LngLatBounds();
      for (const v of vehicles) bounds.extend([v.lon, v.lat]);
      instance.fitBounds(bounds, { padding: 80, maxZoom: 11, duration: 0 });
    }
  }, [markers]);

  useEffect(() => {
    const target = markers.find((m) => m.kind === 'vehicle' && m.id === selectedId);
    if (target !== undefined) {
      map.current?.easeTo({ center: [target.lon, target.lat], duration: 500 });
    }
    // Only when the selection changes — not on every poll, which would fight the dispatcher's panning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  return <div ref={container} style={{ width: '100%', height: '100%', minHeight: 360 }} />;
}
