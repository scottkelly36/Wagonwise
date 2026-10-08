import { useQuery } from '@tanstack/react-query';
import { WEATHER_ATTRIBUTION } from '@wagonwise/contracts/weather';
import { useState } from 'react';

import * as weatherApi from '../api/weather';
import { LEVEL_COLOURS, warningTitle, warningWhen, worstLevel } from '../lib/weather';
import { useStaffAuthStore } from '../state/staff-auth-store';

const REFRESH_MS = 5 * 60 * 1000;

/** The Met Office warnings in force or starting within a day, as a strip above every page. Shows nothing
 *  when there are none, and a quiet error never gets in the way of the page. Click to read them. */
export function WeatherBanner() {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const [open, setOpen] = useState(false);
  const warnings = useQuery({
    queryKey: ['weather-warnings'],
    queryFn: () => withAccessToken((token) => weatherApi.listWeatherWarnings(token)),
    refetchInterval: REFRESH_MS,
    retry: false,
  });

  const list = warnings.data?.warnings ?? [];
  const worst = worstLevel(list);
  if (worst === undefined) return null;

  return (
    <section
      className="weather-banner"
      style={{ borderLeftColor: LEVEL_COLOURS[worst] }}
      aria-label="Weather warnings"
    >
      <button
        type="button"
        className="weather-banner-head"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="weather-dot" style={{ background: LEVEL_COLOURS[worst] }} />
        <strong>
          {list.length === 1 ? '1 weather warning' : `${list.length} weather warnings`}
        </strong>
        <span className="weather-banner-sub">
          {list
            .slice(0, 2)
            .map((w) => warningTitle(w))
            .join(', ')}
          {list.length > 2 ? ` and ${list.length - 2} more` : ''}
        </span>
        <span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <ul className="weather-banner-list">
          {list.map((w) => (
            <li key={w.id}>
              <span className="weather-dot" style={{ background: LEVEL_COLOURS[w.level] }} />
              <div>
                <strong>{warningTitle(w)}</strong> · {warningWhen(w)}
                <div className="weather-banner-sub">{w.areas.join(', ')}</div>
                <div>{w.headline}</div>
              </div>
            </li>
          ))}
          <li className="weather-banner-sub">{WEATHER_ATTRIBUTION}</li>
        </ul>
      )}
    </section>
  );
}
