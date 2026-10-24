import type { FleetLookupRowDto } from '@wagonwise/contracts/maintenance';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import * as maintenanceApi from '../api/maintenance';
import { dayText } from '../lib/maintenance';
import { staffErrorMessage } from '../pages/staff/messages';
import { useStaffAuthStore } from '../state/staff-auth-store';

const keyOf = (row: FleetLookupRowDto, itemId: string): string => `${row.vehicleId}|${itemId}`;

/**
 * "Check MOT and tax for all vehicles": a manager presses it once, every vehicle with a registration is looked up, and the
 * changes are listed for them to accept. Nothing is saved by looking. The dates they tick go in through the same bulk import as
 * a spreadsheet, so a vehicle or item that cannot take one says so. Hidden when looking up is not switched on.
 */
export function FleetLookup({ companyId }: { companyId: string }) {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const queryClient = useQueryClient();
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());

  const status = useQuery({
    queryKey: ['maintenance-lookup-status'],
    queryFn: () => withAccessToken((token) => maintenanceApi.getLookupStatus(token)),
    staleTime: 5 * 60_000,
  });
  const look = useMutation({
    mutationFn: () => withAccessToken((token) => maintenanceApi.lookupFleet(token, companyId)),
    // Everything that would change is ticked to start with; the manager unticks what they do not want.
    onSuccess: (result) =>
      setTicked(new Set(result.rows.flatMap((r) => r.suggestions.map((s) => keyOf(r, s.itemId))))),
  });
  const fill = useMutation({
    mutationFn: async () => {
      const rows = (look.data?.rows ?? []).flatMap((r) =>
        r.suggestions
          .filter((s) => ticked.has(keyOf(r, s.itemId)))
          .map((s) => ({ registration: r.registration, itemName: s.itemName, dueDate: s.dueDate })),
      );
      const results = await withAccessToken((token) =>
        maintenanceApi.importDates(token, companyId, rows),
      );
      return { asked: rows.length, applied: results.filter((x) => x.status === 'applied').length };
    },
    onSuccess: () => {
      look.reset();
      void queryClient.invalidateQueries({ queryKey: ['maintenance-overview'] });
      void queryClient.invalidateQueries({ queryKey: ['vehicle-maintenance'] });
    },
  });

  if (status.data !== true) return null;

  const result = look.data;
  const changes = (result?.rows ?? []).filter((r) => r.suggestions.length > 0);

  return (
    <div style={{ marginBottom: 16 }}>
      <button type="button" onClick={() => look.mutate()} disabled={look.isPending}>
        {look.isPending ? 'Checking every vehicle…' : 'Check MOT and tax for all vehicles'}
      </button>
      {look.isError && <p style={{ color: 'var(--danger)' }}>{staffErrorMessage(look.error)}</p>}
      {fill.isSuccess && (
        <p role="status">
          Filled in {fill.data.applied} of {fill.data.asked} dates.
          {fill.data.applied < fill.data.asked &&
            ' The rest could not be applied; open the vehicle to see why.'}
        </p>
      )}
      {fill.isError && <p style={{ color: 'var(--danger)' }}>{staffErrorMessage(fill.error)}</p>}

      {result !== undefined && (
        <div
          style={{ marginTop: 12, padding: 16, border: '1px solid var(--border)', borderRadius: 8 }}
        >
          <p style={{ marginTop: 0 }}>
            Checked {result.rows.length} {result.rows.length === 1 ? 'vehicle' : 'vehicles'}.
            {result.withoutRegistration > 0 &&
              ` ${result.withoutRegistration} have no registration saved, so could not be checked.`}
            {result.notChecked > 0 &&
              ` ${result.notChecked} more were left for next time: press the button again to check the rest.`}
          </p>

          {changes.length === 0 ? (
            <p>
              Nothing to change: the dates you hold already match, or no item is named MOT or tax.
            </p>
          ) : (
            <>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr>
                    <th align="left" />
                    <th align="left">Vehicle</th>
                    <th align="left">What</th>
                    <th align="left">New due date</th>
                  </tr>
                </thead>
                <tbody>
                  {changes.flatMap((r) =>
                    r.suggestions.map((s) => (
                      <tr key={keyOf(r, s.itemId)}>
                        <td>
                          <input
                            type="checkbox"
                            checked={ticked.has(keyOf(r, s.itemId))}
                            onChange={(e) =>
                              setTicked((before) => {
                                const next = new Set(before);
                                if (e.target.checked) next.add(keyOf(r, s.itemId));
                                else next.delete(keyOf(r, s.itemId));
                                return next;
                              })
                            }
                            aria-label={`Fill in ${s.itemName} for ${r.registration}`}
                          />
                        </td>
                        <td>
                          {r.vehicleName} ({r.registration})
                        </td>
                        <td>{s.itemName}</td>
                        <td>{dayText(s.dueDate)}</td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
              <button
                type="button"
                className="btn-confirm"
                style={{ marginTop: 12 }}
                disabled={ticked.size === 0 || fill.isPending}
                onClick={() => fill.mutate()}
              >
                {fill.isPending ? 'Saving…' : `Fill in ${ticked.size} selected`}
              </button>
            </>
          )}

          {result.rows.some((r) => r.outcome !== 'checked') && (
            <ul style={{ paddingLeft: 18 }}>
              {result.rows
                .filter((r) => r.outcome !== 'checked')
                .map((r) => (
                  <li key={r.vehicleId}>
                    {r.vehicleName} ({r.registration}):{' '}
                    {r.outcome === 'not_found'
                      ? 'not on the record. Check the registration is typed correctly.'
                      : 'could not be checked just now. Try again in a few minutes.'}
                  </li>
                ))}
            </ul>
          )}
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 0 }}>
            From the government&apos;s vehicle records. Check against the paperwork before you rely
            on a date.
          </p>
        </div>
      )}
    </div>
  );
}
