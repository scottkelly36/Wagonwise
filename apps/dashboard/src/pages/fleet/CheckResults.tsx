import type { CheckDetailDto, CheckSummaryDto } from '@wagonwise/contracts/checks';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import * as checksApi from '../../api/checks';
import { CompanySelect } from '../../components/CompanySelect';
import { DataTable, type Column } from '../../components/DataTable';
import {
  answerText,
  RANGE_LABELS,
  rangeFor,
  RESULT_LABELS,
  STATUS_LABELS,
  whenText,
  type RangeChoice,
} from '../../lib/check-results';
import { ukToday } from '../../lib/money';
import { isPlatform } from '../../state/access';
import { useStaffAuthStore } from '../../state/staff-auth-store';
import { staffErrorMessage } from '../staff/messages';

const RESULT_COLOURS = {
  clear: '#15803d',
  advisory: 'var(--warning)',
  do_not_drive: 'var(--danger)',
} as const;

/**
 * Check results: the walk-round checks drivers have done, newest first, and any one in full with the questions as
 * they were when it was done, the answers and the photos. For fleet managers, dispatchers and report viewers.
 */
export function CheckResults() {
  const me = useStaffAuthStore((s) => s.session?.staff);
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const everyCompany = isPlatform(me);

  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const companyId = everyCompany ? selectedCompanyId || undefined : me?.companyId;
  const [choice, setChoice] = useState<RangeChoice>('7');
  const [openId, setOpenId] = useState<string | undefined>(undefined);
  const range = rangeFor(choice, ukToday());

  const checks = useQuery({
    queryKey: ['check-results', companyId, range.from, range.to],
    queryFn: () =>
      withAccessToken((token) => checksApi.listCheckResults(token, companyId as string, range)),
    enabled: companyId !== undefined,
  });

  const columns: Column<CheckSummaryDto>[] = [
    {
      key: 'when',
      header: 'Done',
      sortValue: (c) => c.submittedAt,
      cell: (c) => whenText(c.submittedAt),
    },
    {
      key: 'vehicle',
      header: 'Vehicle',
      sortValue: (c) => c.vehicleName,
      cell: (c) => c.vehicleName,
    },
    { key: 'list', header: 'Check', sortValue: (c) => c.templateName, cell: (c) => c.templateName },
    {
      key: 'driver',
      header: 'Driver',
      sortValue: (c) => c.driverLabel ?? '',
      cell: (c) => c.driverLabel ?? 'Unknown',
    },
    {
      key: 'result',
      header: 'Result',
      sortValue: (c) => c.result,
      cell: (c) => (
        <strong style={{ color: RESULT_COLOURS[c.result] }}>{RESULT_LABELS[c.result]}</strong>
      ),
    },
    {
      key: 'defects',
      header: 'Defects',
      align: 'right',
      sortValue: (c) => c.defectCount,
      cell: (c) => c.defectCount,
    },
    {
      key: 'open',
      header: '',
      align: 'right',
      cell: (c) => (
        <button type="button" onClick={() => setOpenId(c.id)}>
          Open
        </button>
      ),
    },
  ];

  return (
    <div>
      <h1>Check results</h1>
      <p style={{ color: 'var(--text-muted)' }}>
        The walk-round checks your drivers have done. Defects they found are on the Defects page.
      </p>

      {everyCompany && (
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="results-company">Company </label>
          <CompanySelect
            id="results-company"
            value={selectedCompanyId}
            onChange={setSelectedCompanyId}
            emptyLabel="Choose a company"
          />
        </div>
      )}

      {companyId === undefined ? (
        <p>Choose a company.</p>
      ) : (
        <>
          <div style={{ marginBottom: 16 }}>
            <label>
              Show{' '}
              <select value={choice} onChange={(e) => setChoice(e.target.value as RangeChoice)}>
                {(Object.keys(RANGE_LABELS) as RangeChoice[]).map((c) => (
                  <option key={c} value={c}>
                    {RANGE_LABELS[c]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {checks.isError && (
            <p style={{ color: 'var(--danger)' }}>{staffErrorMessage(checks.error)}</p>
          )}
          {checks.isPending ? (
            <p>Loading…</p>
          ) : (
            <DataTable
              columns={columns}
              rows={checks.data ?? []}
              rowKey={(c) => c.id}
              searchText={(c) => `${c.vehicleName} ${c.templateName} ${c.driverLabel ?? ''}`}
              emptyText="No checks in this time."
            />
          )}
          {openId !== undefined && (
            <CheckDetail key={openId} id={openId} onClose={() => setOpenId(undefined)} />
          )}
        </>
      )}
    </div>
  );
}

function CheckDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const detail = useQuery({
    queryKey: ['check-result', id],
    queryFn: () => withAccessToken((token) => checksApi.getCheckResult(token, id)),
  });
  // A photo is fetched only when asked for: they are large.
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const loadPhoto = useMutation({
    mutationFn: async (itemId: string) => {
      const photo = await withAccessToken((token) => checksApi.getCheckPhoto(token, id, itemId));
      return { itemId, src: `data:${photo.contentType};base64,${photo.dataBase64}` };
    },
    onSuccess: ({ itemId, src }) => setPhotos((all) => ({ ...all, [itemId]: src })),
  });

  return (
    <section
      style={{ marginTop: 24, padding: 16, border: '1px solid var(--border)', borderRadius: 8 }}
    >
      {detail.isPending && <p>Loading…</p>}
      {detail.isError && (
        <p style={{ color: 'var(--danger)' }}>{staffErrorMessage(detail.error)}</p>
      )}
      {detail.data !== undefined && (
        <Body detail={detail.data} photos={photos} onPhoto={(item) => loadPhoto.mutate(item)} />
      )}
      {loadPhoto.isError && (
        <p style={{ color: 'var(--danger)' }}>{staffErrorMessage(loadPhoto.error)}</p>
      )}
      <button type="button" onClick={onClose} style={{ marginTop: 12 }}>
        Close
      </button>
    </section>
  );
}

function Body({
  detail,
  photos,
  onPhoto,
}: {
  detail: CheckDetailDto;
  photos: Record<string, string>;
  onPhoto: (itemId: string) => void;
}) {
  return (
    <>
      <h2 style={{ marginTop: 0 }}>
        {detail.templateName} on {detail.vehicleName}
      </h2>
      <p style={{ color: 'var(--text-muted)' }}>
        Done {whenText(detail.submittedAt)} by {detail.driverLabel ?? 'an unknown driver'}. List
        version {detail.templateVersion}. Result:{' '}
        <strong style={{ color: RESULT_COLOURS[detail.result] }}>
          {RESULT_LABELS[detail.result]}
        </strong>
        .
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {detail.items.map((item) => {
            const answer = detail.answers.find((a) => a.itemId === item.id);
            const defect = detail.defects.find((d) => d.itemId === item.id);
            return (
              <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '8px 6px', verticalAlign: 'top' }}>{item.label}</td>
                <td style={{ padding: '8px 6px', verticalAlign: 'top' }}>
                  <span
                    style={
                      defect === undefined ? undefined : { color: 'var(--danger)', fontWeight: 700 }
                    }
                  >
                    {answerText(item, answer)}
                  </span>
                  {defect !== undefined && (
                    <div style={{ fontSize: 13 }}>
                      {defect.detail}. {defect.note !== undefined && <em>“{defect.note}”. </em>}
                      {STATUS_LABELS[defect.status]}.
                    </div>
                  )}
                  {detail.photoItemIds.includes(item.id) &&
                    (photos[item.id] === undefined ? (
                      <button type="button" onClick={() => onPhoto(item.id)}>
                        Show photo
                      </button>
                    ) : (
                      <img
                        src={photos[item.id]}
                        alt={`Photo for ${item.label}`}
                        style={{ display: 'block', maxWidth: 360, marginTop: 6, borderRadius: 6 }}
                      />
                    ))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
