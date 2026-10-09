import type { MonthActualDto, MonthForecastDto } from '@wagonwise/contracts/costing';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import * as costingApi from '../../api/costing';
import { CompanySelect } from '../../components/CompanySelect';
import { chartMonths, forecastWith, isChanged, NO_CHANGE, type WhatIf } from '../../lib/outlook';
import { formatPence, ukToday } from '../../lib/money';
import { holds, isPlatform } from '../../state/access';
import { useStaffAuthStore } from '../../state/staff-auth-store';
import { staffErrorMessage } from '../staff/messages';

const monthName = (month: string): string =>
  new Date(`${month}-01T00:00:00.000Z`).toLocaleDateString('en-GB', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

const profitStyle = (pence: number) => ({
  color: pence < 0 ? 'var(--danger)' : 'var(--btn-confirm-fg)',
  fontWeight: 600,
});

/**
 * Looking ahead: the last six months of what came in and what it cost, and a three-month guess built from them. Revenue,
 * wages and fuel are the average of the last three complete months; running costs and overheads are what you already pay in
 * each month ahead. Three sliders try "what if"; they change nothing that is saved. It reads wages, so it needs
 * `manage_billing`. It is a guide built on the work carrying on as it has, not a promise.
 */
export function Outlook() {
  const me = useStaffAuthStore((s) => s.session?.staff);
  const everyCompany = isPlatform(me);
  const allowed = everyCompany || holds(me, 'manage_billing');
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const companyId = everyCompany ? selectedCompanyId || undefined : me?.companyId;

  return (
    <div>
      <h1>Looking ahead</h1>
      <p style={{ color: 'var(--text-muted)' }}>
        How the last few months went, and a guess at the next three if the work carries on as it
        has. Built from the same figures as Job profit.
      </p>
      {everyCompany && (
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="outlook-company">Company </label>
          <CompanySelect
            id="outlook-company"
            value={selectedCompanyId}
            onChange={setSelectedCompanyId}
            emptyLabel="Choose a company"
          />
        </div>
      )}
      {!allowed ? (
        <p>Only the person who looks after your money can see this page.</p>
      ) : companyId === undefined ? (
        <p>Choose a company.</p>
      ) : (
        <View companyId={companyId} />
      )}
    </div>
  );
}

function Slider({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <label htmlFor={id} style={{ display: 'block', marginBottom: 10 }}>
      <strong>{label}</strong>{' '}
      <span className="muted">{value === 0 ? 'as it is' : `${value > 0 ? '+' : ''}${value}%`}</span>
      <input
        id={id}
        type="range"
        min={-30}
        max={30}
        step={5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ display: 'block', width: '100%', maxWidth: 360 }}
      />
    </label>
  );
}

function View({ companyId }: { companyId: string }) {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const month = ukToday().slice(0, 7);
  const outlook = useQuery({
    queryKey: ['outlook', companyId, month],
    queryFn: () => withAccessToken((t) => costingApi.getOutlook(t, companyId, month)),
    retry: false,
  });
  const [what, setWhat] = useState<WhatIf>(NO_CHANGE);

  if (outlook.isPending) return <p>Loading…</p>;
  if (outlook.isError) return <p className="error">{staffErrorMessage(outlook.error)}</p>;
  const data = outlook.data;
  const forecast = forecastWith(data, what);
  const chart = chartMonths(data.history, forecast?.months ?? []);

  const figures = (m: MonthActualDto | MonthForecastDto) => (
    <>
      <td style={{ textAlign: 'right' }}>{formatPence(m.revenuePence)}</td>
      <td style={{ textAlign: 'right' }}>{formatPence(m.wagesPence)}</td>
      <td style={{ textAlign: 'right' }}>{formatPence(m.fuelPence)}</td>
      <td style={{ textAlign: 'right' }}>{formatPence(m.runningPence + m.overheadsPence)}</td>
      <td style={{ textAlign: 'right', ...profitStyle(m.profitPence) }}>
        {formatPence(m.profitPence)}
      </td>
    </>
  );

  return (
    <>
      {forecast === undefined ? (
        <p className="muted">
          There is nothing to build a forecast on yet: no complete month has a delivered job. Once a
          month has finished with jobs delivered, a look ahead appears here. The months so far are
          below.
        </p>
      ) : (
        <div className="report-stats">
          <div className="report-stat">
            <div className="report-stat-value" style={profitStyle(forecast.totalProfitPence)}>
              {formatPence(forecast.totalProfitPence)}
            </div>
            <div className="report-stat-label">Profit over the next 3 months</div>
            <div className="report-stat-note muted">
              {isChanged(what)
                ? 'with your what-if'
                : `from ${data.forecast?.basedOn.map(monthName).join(', ')}`}
            </div>
          </div>
          <div className="report-stat">
            <div className="report-stat-value">{formatPence(forecast.revenuePence)}</div>
            <div className="report-stat-label">Revenue a month</div>
          </div>
          <div className="report-stat">
            <div className="report-stat-value">{formatPence(forecast.breakEvenRevenuePence)}</div>
            <div className="report-stat-label">Needed a month to break even</div>
            <div className="report-stat-note muted">
              {forecast.revenuePence >= forecast.breakEvenRevenuePence
                ? 'you are above it'
                : 'you are below it'}
            </div>
          </div>
        </div>
      )}

      <div
        className="home-chart"
        role="img"
        aria-label="Revenue and cost by month"
        style={{ height: 150 }}
      >
        {chart.map((m) => (
          <div key={m.month} className="home-chart-month">
            <div className="home-chart-bars" style={{ opacity: m.forecast ? 0.55 : 1 }}>
              <i
                className="rev"
                style={{ height: `${Math.round(m.revenue * 100)}%` }}
                title={`${monthName(m.month)} revenue ${formatPence(m.revenuePence)}`}
              />
              <i
                className="cost"
                style={{ height: `${Math.round(m.cost * 100)}%` }}
                title={`${monthName(m.month)} cost ${formatPence(m.costPence)}`}
              />
            </div>
            <span>
              {monthName(m.month).split(' ')[0]}
              {m.forecast ? ' (guess)' : m.partial ? ' (so far)' : ''}
            </span>
          </div>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 13 }}>
        <span className="home-dot" data-area="money" /> Revenue &nbsp;{' '}
        <span className="home-dot" data-area="admin" /> Cost. Faded bars are the guess.
      </p>

      {forecast !== undefined && (
        <section className="card">
          <h2>What if</h2>
          <p className="muted" style={{ fontSize: 13 }}>
            Try a change to see its effect on the next three months. Nothing here is saved.
          </p>
          <Slider
            id="what-revenue"
            label="Revenue"
            value={what.revenuePct}
            onChange={(n) => setWhat({ ...what, revenuePct: n })}
          />
          <Slider
            id="what-fuel"
            label="What fuel costs"
            value={what.fuelPct}
            onChange={(n) => setWhat({ ...what, fuelPct: n })}
          />
          <Slider
            id="what-wages"
            label="What drivers cost"
            value={what.wagesPct}
            onChange={(n) => setWhat({ ...what, wagesPct: n })}
          />
          {isChanged(what) && (
            <button type="button" onClick={() => setWhat(NO_CHANGE)}>
              Put it back
            </button>
          )}
        </section>
      )}

      <div className="data-table-scroll" style={{ marginTop: 16 }}>
        <table>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Month</th>
              <th style={{ textAlign: 'right' }}>Revenue</th>
              <th style={{ textAlign: 'right' }}>Wages</th>
              <th style={{ textAlign: 'right' }}>Fuel</th>
              <th style={{ textAlign: 'right' }}>Vehicle costs and overheads</th>
              <th style={{ textAlign: 'right' }}>Profit</th>
            </tr>
          </thead>
          <tbody>
            {data.history.map((m) => (
              <tr key={m.month}>
                <td>
                  {monthName(m.month)}
                  {m.partial && <span className="muted"> (so far)</span>}
                </td>
                {figures(m)}
              </tr>
            ))}
            {forecast?.months.map((m) => (
              <tr key={m.month} style={{ background: 'var(--bg)' }}>
                <td>
                  {monthName(m.month)} <span className="muted">(guess)</span>
                </td>
                {figures(m)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details style={{ marginTop: 24 }}>
        <summary>How the guess is made</summary>
        <ul className="muted" style={{ fontSize: 14 }}>
          <li>
            Revenue, wages and fuel are each the average of the last three complete months that had
            jobs, because they move with how much work there is.
          </li>
          <li>
            Vehicle running costs and overheads are what you already pay in each month ahead, from
            Running costs and pay, so a cost you have stopped or started is reflected.
          </li>
          <li>
            The month in progress is shown but not used. It assumes the work carries on as it has,
            and it is not a promise.
          </li>
        </ul>
      </details>
    </>
  );
}
