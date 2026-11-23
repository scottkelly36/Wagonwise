import { useMutation, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import * as paymentsApi from '../api/payments';
import { useStaffAuthStore } from '../state/staff-auth-store';
import { ErrorNotice } from './ErrorNotice';

/**
 * Adding payment details, for a company's billing people: a button that takes them to the payment provider's own secure page, so card and
 * bank numbers never reach WagonWise. Shown only once a provider is connected; until then it says nothing. A paused company can still use
 * it (it is how it pays its way back). The provider tells us when they are done, so a moment may pass before "on file" shows.
 */
export function PaymentDetails() {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const [params] = useSearchParams();
  const status = useQuery({
    queryKey: ['payment-status'],
    queryFn: () => withAccessToken((token) => paymentsApi.getPaymentStatus(token)),
    retry: false,
    // Coming back from the provider's page: look again shortly, since its message can arrive after the person does.
    refetchInterval: params.get('payment') === 'done' ? 5000 : false,
  });
  const start = useMutation({
    mutationFn: () => withAccessToken((token) => paymentsApi.startPaymentSetup(token)),
    onSuccess: (result) => window.location.assign(result.url),
  });

  const data = status.data;
  if (data === undefined || !data.available) return null;

  return (
    <section className="mb-24 box" aria-label="Payment details">
      <h2 className="mt-0">Payment details</h2>
      {params.get('payment') === 'done' && !data.detailsOnFile && (
        <p role="status">Thank you. It can take a moment for your payment details to show here.</p>
      )}
      <p style={{ margin: '4px 0' }}>
        {data.detailsOnFile
          ? 'Payment details are on file with our payment provider.'
          : 'Add your card or bank details so your invoices can be paid without a bank transfer.'}{' '}
        You enter them on the provider&apos;s secure page; WagonWise never sees your card or bank
        number.
      </p>
      {start.isError && <ErrorNotice error={start.error} />}
      <button
        type="button"
        className={data.detailsOnFile ? undefined : 'btn-primary'}
        disabled={start.isPending}
        onClick={() => start.mutate()}
      >
        {start.isPending
          ? 'Opening…'
          : data.detailsOnFile
            ? 'Change payment details'
            : 'Add payment details'}
      </button>
    </section>
  );
}
