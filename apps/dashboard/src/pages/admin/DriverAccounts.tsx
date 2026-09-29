import { companyIdSchema } from '@wagonwise/contracts/companies';
import type { DriverDto } from '@wagonwise/contracts/identity';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as companiesApi from '../../api/companies';
import * as identityApi from '../../api/identity';
import { useStaffAuthStore } from '../../state/staff-auth-store';
import { staffErrorMessage } from '../staff/messages';

const NO_COMPANY = '';
const DRIVERS_KEY = ['drivers'] as const;
const COMPANIES_KEY = ['companies'] as const;

/** WagonWise admins assign each driver to a company. Admin access for drivers is gone
 *  (P2-M1.12c): the people who run the dashboard have staff accounts, set up under Users. */
export function DriverAccounts() {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const queryClient = useQueryClient();

  const drivers = useQuery({
    queryKey: DRIVERS_KEY,
    queryFn: () => withAccessToken((token) => identityApi.listDrivers(token)),
  });
  const companies = useQuery({
    queryKey: COMPANIES_KEY,
    queryFn: () => withAccessToken((token) => companiesApi.listCompanies(token)),
  });

  const updateDriver = useMutation({
    mutationFn: (input: { id: string; companyId: string | null }) =>
      withAccessToken((token) =>
        identityApi.updateDriver(token, input.id, {
          companyId: input.companyId === null ? null : companyIdSchema.parse(input.companyId),
        }),
      ),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: DRIVERS_KEY }),
  });

  function handleCompanyChange(driver: DriverDto, companyId: string): void {
    updateDriver.mutate({ id: driver.id, companyId: companyId === NO_COMPANY ? null : companyId });
  }

  const error = drivers.error ?? companies.error ?? updateDriver.error;

  return (
    <div>
      <h1>Driver accounts</h1>
      <p style={{ color: '#6b7280' }}>Assign each driver to the company they drive for.</p>

      {error !== null && <p style={{ color: '#dc2626' }}>{staffErrorMessage(error)}</p>}

      {drivers.isPending ? (
        <p>Loading…</p>
      ) : (
        <table style={{ width: '100%', textAlign: 'left' }}>
          <thead>
            <tr>
              <th>Identifier</th>
              <th>Company</th>
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
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
