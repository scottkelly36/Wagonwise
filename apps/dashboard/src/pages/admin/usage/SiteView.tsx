import type { SiteReportDto } from '@wagonwise/contracts/usage';
import { HomeRows } from '../../../components/HomeParts';
import { percentOf } from '../../../lib/usage';
import { useUsageSection } from '../../../hooks/use-usage-section';
import { ViewState } from './shared';

/** Visits to the website, counted without cookies (docs/modules.md, "Website visits"). */
function Website({ site }: { site: SiteReportDto }) {
  const total = site.views.reduce((sum, v) => sum + v.views, 0);
  const pageName = (page: string) =>
    page === '/' ? 'Home' : page === '/for-hauliers/' ? 'For hauliers' : page.replaceAll('/', '');
  return (
    <>
      <section className="home-panel">
        <h2>Website, last {site.windowDays} days</h2>
        <HomeRows
          rows={[
            { label: 'Page views', value: String(total), tone: 'quiet' },
            ...site.views.map((v) => ({
              label: pageName(v.page),
              value: String(v.views),
              tone: 'quiet' as const,
            })),
            { label: 'Video played', value: String(site.videoPlays), tone: 'quiet' },
          ]}
        />
        <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
          Counted without cookies: a view is one opening of a page, not one person.
        </p>
      </section>
      <section className="home-panel">
        <h2>Where website visits came from</h2>
        {site.sources.length === 0 ? (
          <p className="muted">No visits yet.</p>
        ) : (
          <HomeRows
            rows={site.sources.map((s) => ({
              label: s.source === 'direct' ? 'Typed in or a bookmark' : s.source,
              value: `${s.views} (${percentOf(s.views, total)})`,
              tone: 'quiet' as const,
            }))}
          />
        )}
        {site.campaigns.length === 0 ? null : (
          <>
            <h3 style={{ fontSize: 14, margin: '12px 0 4px' }}>Campaigns</h3>
            <HomeRows
              rows={site.campaigns.map((c) => ({
                label: c.campaign,
                value: String(c.views),
                tone: 'quiet' as const,
              }))}
            />
          </>
        )}
        <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
          A source is a link's utm_source, or the site the visitor came from. Add
          ?utm_source=facebook&amp;utm_campaign=a-name to a link to see it here.
        </p>
      </section>
    </>
  );
}

export function SiteView() {
  const site = useUsageSection('site');
  return (
    <ViewState query={site}>
      {(data) => (
        <div className="home-panels">
          <Website site={data} />
        </div>
      )}
    </ViewState>
  );
}
