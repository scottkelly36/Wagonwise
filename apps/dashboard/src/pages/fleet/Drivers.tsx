import type { DriverLinkDto } from '@wagonwise/contracts/fleet';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import * as companiesApi from '../../api/companies';
import * as fleetApi from '../../api/fleet';
import { holds, isPlatform } from '../../state/access';
import { useStaffAuthStore } from '../../state/staff-auth-store';
import { staffErrorMessage } from '../staff/messages';

const COMPANIES_KEY = ['companies'] as const;

/** A company's own roster of drivers (P2-M2.6, following P2-M2's driver links). Two ways in:
 *  staff invite someone by phone or email, or a driver asks with the company's reusable code —
 *  either way, nothing is granted until staff approve it here. WagonWise admins pick which
 *  company to view; a company's own staff with "Manage vehicles & drivers" only ever see and
 *  manage their own (core enforces that regardless of what this page offers). */
export function Drivers() {
  const me = useStaffAuthStore((s) => s.session?.staff);
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const everyCompany = isPlatform(me);
  const canManage = holds(me, 'manage_fleet');
  const queryClient = useQueryClient();

  const companies = useQuery({
    queryKey: COMPANIES_KEY,
    queryFn: () => withAccessToken((token) => companiesApi.listCompanies(token)),
    enabled: everyCompany,
  });

  const [selectedCompanyId, setSelectedCompanyId] = useState<string | undefined>(undefined);
  const companyId = everyCompany ? selectedCompanyId : me?.companyId;
  const linksKey = ['driver-links', companyId] as const;
  const codeKey = ['company-code', companyId] as const;

  const links = useQuery({
    queryKey: linksKey,
    queryFn: () => withAccessToken((token) => fleetApi.listDriverLinks(token, companyId as string)),
    enabled: canManage && companyId !== undefined,
  });

  const code = useQuery({
    queryKey: codeKey,
    queryFn: () => withAccessToken((token) => fleetApi.getCompanyCode(token, companyId as string)),
    enabled: canManage && companyId !== undefined,
  });

  const refreshLinks = () => void queryClient.invalidateQueries({ queryKey: linksKey });

  const [identifier, setIdentifier] = useState('');
  const invite = useMutation({
    mutationFn: () =>
      withAccessToken((token) =>
        fleetApi.inviteDriver(token, companyId as string, { identifier: identifier.trim() }),
      ),
    onSuccess: () => {
      setIdentifier('');
      refreshLinks();
    },
  });

  const approve = useMutation({
    mutationFn: (id: string) => withAccessToken((token) => fleetApi.approveDriverLink(token, id)),
    onSuccess: refreshLinks,
  });
  const decline = useMutation({
    mutationFn: (id: string) => withAccessToken((token) => fleetApi.declineDriverLink(token, id)),
    onSuccess: refreshLinks,
  });
  const remove = useMutation({
    mutationFn: (id: string) => withAccessToken((token) => fleetApi.removeDriverLink(token, id)),
    onSuccess: refreshLinks,
  });

  const regenerateCode = useMutation({
    mutationFn: () =>
      withAccessToken((token) => fleetApi.regenerateCompanyCode(token, companyId as string)),
    onSuccess: (newCode) => queryClient.setQueryData(codeKey, newCode),
  });

  if (!canManage) {
    return (
      <div>
        <h1>Drivers</h1>
        <p>
          You don't have permission to manage drivers. Ask someone at your company with the "Manage
          users" privilege to give you "Manage vehicles & drivers".
        </p>
      </div>
    );
  }

  const error =
    companies.error ??
    links.error ??
    code.error ??
    invite.error ??
    approve.error ??
    decline.error ??
    remove.error ??
    regenerateCode.error;

  const requested = links.data?.filter((l) => l.status === 'requested') ?? [];
  const invited = links.data?.filter((l) => l.status === 'invited') ?? [];
  const active = links.data?.filter((l) => l.status === 'active') ?? [];

  return (
    <div>
      <h1>Drivers</h1>
      <p style={{ color: '#6b7280' }}>Who drives for your company.</p>

      {everyCompany && (
        <div style={{ marginBottom: 16 }}>
          <label>
            Company:{' '}
            <select
              value={selectedCompanyId ?? ''}
              onChange={(e) => setSelectedCompanyId(e.target.value || undefined)}
            >
              <option value="">— choose a company —</option>
              {companies.data?.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {error !== null && <p style={{ color: '#dc2626' }}>{staffErrorMessage(error)}</p>}

      {companyId === undefined ? (
        <p style={{ color: '#6b7280' }}>
          {everyCompany ? 'Choose a company above.' : 'No company assigned to your account.'}
        </p>
      ) : (
        <>
          <section style={{ marginBottom: 24 }}>
            <h2>Join code</h2>
            <p style={{ color: '#6b7280' }}>
              Give this to a driver to ask to join. It never admits anyone by itself — every request
              still needs approval below.
            </p>
            <p style={{ fontSize: 24, fontFamily: 'monospace' }}>
              {code.isPending ? 'Loading…' : code.data}
            </p>
            <button
              onClick={() => {
                if (
                  window.confirm(
                    'Make a new code? The old one will stop working for anyone who hasn’t used it yet.',
                  )
                ) {
                  regenerateCode.mutate();
                }
              }}
              disabled={regenerateCode.isPending}
            >
              {regenerateCode.isPending ? 'Regenerating…' : 'Regenerate code'}
            </button>
          </section>

          <section style={{ marginBottom: 24 }}>
            <h2>Invite a driver</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (identifier.trim() !== '') invite.mutate();
              }}
              style={{ display: 'flex', gap: 8 }}
            >
              <input
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="Phone number or email"
                style={{ width: 260 }}
              />
              <button type="submit" disabled={invite.isPending || identifier.trim() === ''}>
                {invite.isPending ? 'Inviting…' : 'Invite'}
              </button>
            </form>
          </section>

          <DriverLinksSection
            title="Pending requests"
            empty="No one is asking to join right now."
            links={requested}
            renderActions={(link) => (
              <>
                <button onClick={() => approve.mutate(link.id)} disabled={approve.isPending}>
                  Approve
                </button>{' '}
                <button
                  className="btn-danger"
                  onClick={() => decline.mutate(link.id)}
                  disabled={decline.isPending}
                >
                  Reject
                </button>
              </>
            )}
          />

          <DriverLinksSection
            title="Pending invitations"
            empty="No open invitations."
            links={invited}
            renderActions={(link) => (
              <button
                className="btn-danger"
                onClick={() => decline.mutate(link.id)}
                disabled={decline.isPending}
              >
                Cancel
              </button>
            )}
          />

          <DriverLinksSection
            title="Active drivers"
            empty="No drivers yet."
            links={active}
            renderActions={(link) => (
              <button
                className="btn-danger"
                onClick={() => {
                  if (window.confirm('Remove this driver from your company?')) {
                    remove.mutate(link.id);
                  }
                }}
                disabled={remove.isPending}
              >
                Remove
              </button>
            )}
          />
        </>
      )}
    </div>
  );
}

function DriverLinksSection(props: {
  title: string;
  empty: string;
  links: readonly DriverLinkDto[];
  renderActions: (link: DriverLinkDto) => ReactNode;
}) {
  return (
    <section style={{ marginBottom: 24 }}>
      <h2>{props.title}</h2>
      {props.links.length === 0 ? (
        <p style={{ color: '#6b7280' }}>{props.empty}</p>
      ) : (
        <table style={{ width: '100%', textAlign: 'left' }}>
          <thead>
            <tr>
              <th>Who</th>
              <th>Since</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {props.links.map((link) => (
              <tr key={link.id}>
                <td>{link.invitedIdentifier ?? link.driverIdentifier ?? link.driverId}</td>
                <td>{new Date(link.createdAt).toLocaleDateString()}</td>
                <td>{props.renderActions(link)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
