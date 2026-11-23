import type { UsageFirmDto } from '@wagonwise/contracts/usage';
import { Link } from 'react-router-dom';
import { DataTable, type Column } from '../../../components/DataTable';
import { ago } from '../../../lib/usage';
import { useUsageSection } from '../../../hooks/use-usage-section';
import { ViewState } from './shared';

/** Every firm, with how much it has set up and when it was last used. */
export function FirmsView() {
  const firms = useUsageSection('firms');
  return (
    <ViewState query={firms}>
      {(u) => {
        const now = new Date(u.generatedAt);
        const columns: Column<UsageFirmDto>[] = [
          { key: 'name', header: 'Firm', sortValue: (f) => f.name, cell: (f) => f.name },
          {
            key: 'drivers',
            header: 'Drivers',
            align: 'right',
            sortValue: (f) => f.drivers,
            cell: (f) => f.drivers,
          },
          {
            key: 'vehicles',
            header: 'Vehicles',
            align: 'right',
            sortValue: (f) => f.vehicles,
            cell: (f) => f.vehicles,
          },
          {
            key: 'staff',
            header: 'Office staff',
            align: 'right',
            sortValue: (f) => f.staff,
            cell: (f) => f.staff,
          },
          {
            key: 'jobs',
            header: 'Jobs this month',
            align: 'right',
            sortValue: (f) => f.jobsThisMonth,
            cell: (f) => f.jobsThisMonth,
          },
          {
            key: 'last',
            header: 'Last used',
            sortValue: (f) => f.lastActiveAt ?? '',
            cell: (f) => ago(f.lastActiveAt, now),
          },
        ];
        return (
          <>
            <DataTable
              columns={columns}
              rows={u.firmList}
              rowKey={(f) => f.id}
              searchText={(f) => f.name}
              emptyText="No firms yet."
            />
            <p className="muted mt-12">
              <Link to="/admin/companies">Open a firm</Link> to see its detail.
            </p>
          </>
        );
      }}
    </ViewState>
  );
}
