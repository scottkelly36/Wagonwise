import { useQuery } from '@tanstack/react-query';
import * as billingApi from '../../api/billing';
import * as hazardsApi from '../../api/hazards';
import { HomeNote, HomePanel, HomeRows, HomeTiles } from '../../components/HomeParts';
import { chartMonths, platformRows, platformTiles, pounds } from '../../lib/home';
import { useStaffAuthStore } from '../../state/staff-auth-store';

const MINUTE = 60_000;

const monthLabel = (month: string): string =>
  new Date(`${month}-01T00:00:00.000Z`).toLocaleDateString('en-GB', {
    month: 'short',
    timeZone: 'UTC',
  });

/**
 * WagonWise's own home: this month's money from the Finances page, the invoices waiting, and what needs moderating.
 * One that fails to load leaves its part out.
 */
export function PlatformHome() {
  const me = useStaffAuthStore((s) => s.session?.staff);
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);

  const finance = useQuery({
    queryKey: ['finance-report', undefined],
    queryFn: () => withAccessToken((t) => billingApi.getFinanceReport(t)),
    refetchInterval: 5 * MINUTE,
    retry: false,
  });
  const invoices = useQuery({
    queryKey: ['invoices'],
    queryFn: () => withAccessToken((t) => billingApi.listInvoices(t)),
    refetchInterval: 5 * MINUTE,
    retry: false,
  });
  const queue = useQuery({
    queryKey: ['moderation-queue'],
    queryFn: () => withAccessToken((t) => hazardsApi.listModerationQueue(t)),
    refetchInterval: MINUTE,
    retry: false,
  });

  const tiles =
    finance.data === undefined || invoices.data === undefined
      ? []
      : platformTiles({ finance: finance.data, invoices: invoices.data });
  const chart = finance.data === undefined ? [] : chartMonths(finance.data);
  const rows =
    invoices.data === undefined && queue.data === undefined
      ? []
      : platformRows({ moderationQueue: queue.data?.length ?? 0, invoices: invoices.data ?? [] });

  return (
    <div>
      <h1>Hello{me === undefined ? '' : `, ${me.name.split(' ')[0] ?? me.name}`}</h1>
      {finance.isPending || invoices.isPending ? (
        <HomeNote>Loading…</HomeNote>
      ) : finance.isError || invoices.isError ? (
        <HomeNote>Couldn&apos;t load the figures. Reload the page to try again.</HomeNote>
      ) : (
        <HomeTiles tiles={tiles} loading={false} />
      )}
      <div className="home-panels">
        <HomePanel
          title="Revenue and costs, last 6 months"
          area="money"
          to="/admin/finances"
          linkLabel="Open finances"
        >
          {chart.length === 0 ? (
            <HomeNote>No figures yet.</HomeNote>
          ) : (
            <>
              <div className="home-chart" role="img" aria-label="Revenue and costs by month">
                {chart.map((m) => (
                  <div key={m.month} className="home-chart-month">
                    <div className="home-chart-bars">
                      <i
                        className="rev"
                        style={{ height: `${Math.round(m.revenue * 100)}%` }}
                        title={`${monthLabel(m.month)} revenue ${pounds(m.revenuePence)}`}
                      />
                      <i
                        className="cost"
                        style={{ height: `${Math.round(m.costs * 100)}%` }}
                        title={`${monthLabel(m.month)} costs ${pounds(m.costsPence)}`}
                      />
                    </div>
                    <span>{monthLabel(m.month)}</span>
                  </div>
                ))}
              </div>
              <p className="muted home-note">
                <span className="home-dot" data-area="money" /> Invoiced &nbsp;
                <span className="home-dot" data-area="admin" /> Costs
              </p>
            </>
          )}
        </HomePanel>
        <HomePanel
          title="Needs action"
          area="admin"
          to="/admin/moderation"
          linkLabel="Open moderation"
        >
          {rows.length === 0 ? <HomeNote>Nothing to show.</HomeNote> : <HomeRows rows={rows} />}
        </HomePanel>
      </div>
    </div>
  );
}
