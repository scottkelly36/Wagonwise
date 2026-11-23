import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';

import * as companiesApi from '../api/companies';
import { accountBanner } from '../lib/account-banner';
import { ukToday } from '../lib/money';
import { holds } from '../state/access';
import { useStaffAuthStore } from '../state/staff-auth-store';

const REFRESH_MS = 5 * 60 * 1000;

/**
 * What a company's own staff are told about their account above every page: that it is paused, overdue, or that the free period is
 * nearly over. WagonWise staff have no company of their own, so they never see it (and never ask for it). A quiet error never gets
 * in the way of the page.
 */
export function AccountBanner() {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const staff = useStaffAuthStore((s) => s.session?.staff);
  const location = useLocation();
  const state = useQuery({
    queryKey: ['own-account-state'],
    queryFn: () => withAccessToken((token) => companiesApi.getOwnAccountState(token)),
    refetchInterval: REFRESH_MS,
    retry: false,
  });

  if (state.data === undefined) return null;
  const banner = accountBanner(state.data, ukToday());
  if (banner === undefined) return null;

  return (
    <section className={`account-banner account-banner-${banner.tone}`} role="status">
      {banner.text}
      {holds(staff, 'manage_billing') && location.pathname !== '/staff/plan' && (
        <>
          {' '}
          <Link to="/staff/plan">See your plan and invoices</Link>
        </>
      )}
    </section>
  );
}
