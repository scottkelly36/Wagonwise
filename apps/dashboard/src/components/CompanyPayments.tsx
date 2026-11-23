import { useQuery } from '@tanstack/react-query';
import * as paymentsApi from '../api/payments';
import { formatPence } from '../lib/money';
import { useStaffAuthStore } from '../state/staff-auth-store';

const STATUS_TEXT = { requested: 'asked for, waiting', paid: 'paid', failed: 'failed' } as const;

/** WagonWise staff, in a company's account editor: whether it has added payment details, and the latest attempts to collect from it. */
export function CompanyPayments({ companyId }: { companyId: string }) {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const payments = useQuery({
    queryKey: ['company-payments', companyId],
    queryFn: () => withAccessToken((token) => paymentsApi.getCompanyPayments(token, companyId)),
    retry: false,
  });
  if (payments.data === undefined) return null;
  const p = payments.data;

  return (
    <div style={{ maxWidth: 720, padding: '0 0 16px' }}>
      <strong>Payment details</strong>
      {!p.available ? (
        <p className="muted">No payment provider is connected yet, so nothing can be collected.</p>
      ) : (
        <>
          <p style={{ margin: '4px 0' }}>
            {p.detailsOnFile ? 'On file with the payment provider.' : 'Not added yet.'}
          </p>
          {p.collections.length > 0 && (
            <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
              {p.collections.map((c) => (
                <li key={c.id}>
                  {new Date(c.requestedAt).toLocaleDateString('en-GB')}:{' '}
                  {formatPence(c.amountPence)} {STATUS_TEXT[c.status]}
                  {c.failureReason === null ? '' : ` (${c.failureReason})`}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
