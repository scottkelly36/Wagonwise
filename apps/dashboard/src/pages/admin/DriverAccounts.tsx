import { companyIdSchema } from '@wagonwise/contracts/companies';
import { DRIVER_SCOPES, type DriverDto, type DriverScope } from '@wagonwise/contracts/identity';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as companiesApi from '../../api/companies';
import * as identityApi from '../../api/identity';
import { ApiError } from '../../api/errors';
import { useAuthStore } from '../../state/auth-store';

const NO_COMPANY = '';
const DRIVERS_KEY = ['drivers'] as const;
const COMPANIES_KEY = ['companies'] as const;

export function DriverAccounts() {
  const accessToken = useAuthStore((s) =>
    s.state.status === 'signedIn' ? s.state.accessToken : undefined,
  );
  const queryClient = useQueryClient();

  const drivers = useQuery({
    queryKey: DRIVERS_KEY,
    queryFn: () => identityApi.listDrivers(accessToken as string),
    enabled: accessToken !== undefined,
  });
  const companies = useQuery({
    queryKey: COMPANIES_KEY,
    queryFn: () => companiesApi.listCompanies(accessToken as string),
    enabled: accessToken !== undefined,
  });

  const updateDriver = useMutation({
    mutationFn: (input: {
      id: string;
      companyId?: string | null;
      isAdmin?: boolean;
      scopes?: readonly DriverScope[];
    }) =>
      identityApi.updateDriver(accessToken as string, input.id, {
        ...(input.companyId === undefined
          ? {}
          : {
              companyId: input.companyId === null ? null : companyIdSchema.parse(input.companyId),
            }),
        ...(input.isAdmin === undefined ? {} : { isAdmin: input.isAdmin }),
        ...(input.scopes === undefined ? {} : { scopes: input.scopes }),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: DRIVERS_KEY }),
  });

  function handleCompanyChange(driver: DriverDto, companyId: string): void {
    updateDriver.mutate({ id: driver.id, companyId: companyId === NO_COMPANY ? null : companyId });
  }

  function handleAdminToggle(driver: DriverDto): void {
    updateDriver.mutate({ id: driver.id, isAdmin: !driver.isAdmin });
  }

  /** Fleet-user scopes (Phase 2 tech design doc's decision log, 2026-09-27) — a fixed list, one
   *  checkbox per scope, replacing the whole set on toggle (plain-PATCH semantics, not a merge). */
  function handleScopeToggle(driver: DriverDto, scope: DriverScope): void {
    const next = driver.scopes.includes(scope)
      ? driver.scopes.filter((s) => s !== scope)
      : [...driver.scopes, scope];
    updateDriver.mutate({ id: driver.id, scopes: next });
  }

  const error = drivers.error ?? companies.error ?? updateDriver.error;

  return (
    <div>
      <h1>Driver accounts</h1>
      <p style={{ color: '#6b7280' }}>Assign a company, or grant/revoke admin access.</p>

      {error !== null && (
        <p style={{ color: '#dc2626' }}>
          {error instanceof ApiError ? error.tag : 'Something went wrong.'}
        </p>
      )}

      {drivers.isPending ? (
        <p>Loading…</p>
      ) : (
        <table style={{ width: '100%', textAlign: 'left' }}>
          <thead>
            <tr>
              <th>Identifier</th>
              <th>Company</th>
              <th>Admin</th>
              <th>Scopes</th>
            </tr>
          </thead>
          <tbody>
            {drivers.data?.map((driver) => {
              const saving = updateDriver.isPending && updateDriver.variables?.id === driver.id;
              return (
                <tr key={driver.id}>
                  <td>{driver.identifier}</td>
                  <td>
                    <select
                      value={driver.companyId ?? NO_COMPANY}
                      disabled={saving}
                      onChange={(e) => handleCompanyChange(driver, e.target.value)}
                    >
                      <option value={NO_COMPANY}>— none —</option>
                      {companies.data?.map((company) => (
                        <option key={company.id} value={company.id}>
                          {company.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <label>
                      <input
                        type="checkbox"
                        checked={driver.isAdmin}
                        disabled={saving}
                        onChange={() => handleAdminToggle(driver)}
                      />{' '}
                      Admin
                    </label>
                  </td>
                  <td>
                    {driver.companyId === undefined ? (
                      <span style={{ color: '#9ca3af' }}>— needs a company —</span>
                    ) : (
                      DRIVER_SCOPES.map((scope) => (
                        <label key={scope} style={{ marginRight: 12 }}>
                          <input
                            type="checkbox"
                            checked={driver.scopes.includes(scope)}
                            disabled={saving}
                            onChange={() => handleScopeToggle(driver, scope)}
                          />{' '}
                          {scope}
                        </label>
                      ))
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
