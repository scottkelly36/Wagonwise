import { BILLING_FIELD_MAX, type BillingDetailsDto } from '@wagonwise/contracts/billing';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import * as billingApi from '../../api/billing';
import { useStaffAuthStore } from '../../state/staff-auth-store';
import { staffErrorMessage } from '../staff/messages';

type FieldName = keyof typeof BILLING_FIELD_MAX;

const FIELDS: { name: FieldName; label: string; hint: string; multiline?: boolean }[] = [
  { name: 'tradingName', label: 'Trading name', hint: 'The name invoices are issued in.' },
  {
    name: 'address',
    label: 'Address',
    hint: 'Your registered or trading address.',
    multiline: true,
  },
  { name: 'contactEmail', label: 'Billing email', hint: 'Where customers send queries.' },
  {
    name: 'paymentDetails',
    label: 'Payment details',
    hint: 'Bank name, sort code and account number: how customers pay you.',
    multiline: true,
  },
  {
    name: 'vatStatus',
    label: 'VAT',
    hint: 'Your VAT number, or "Not VAT registered".',
  },
  { name: 'paymentTerms', label: 'Payment terms', hint: 'For example "Payment within 14 days".' },
];

const KEY = ['billing-details'] as const;

/**
 * WagonWise's own details as they print on invoices. Only WagonWise admins can open this page, and core
 * refuses anyone else. Anything still in [square brackets] is a placeholder: invoices can be drafted but not
 * issued until every one has been replaced.
 */
export function BillingDetails() {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const queryClient = useQueryClient();

  const details = useQuery({
    queryKey: KEY,
    queryFn: () => withAccessToken((token) => billingApi.getBillingDetails(token)),
  });

  if (details.isPending) return <p>Loading…</p>;
  if (details.isError) {
    return <p style={{ color: 'var(--danger)' }}>{staffErrorMessage(details.error)}</p>;
  }
  return (
    <BillingForm
      key={details.data.updatedAt}
      current={details.data}
      onSave={(input) => withAccessToken((token) => billingApi.updateBillingDetails(token, input))}
      onSaved={(saved) => queryClient.setQueryData(KEY, saved)}
    />
  );
}

function BillingForm({
  current,
  onSave,
  onSaved,
}: {
  current: BillingDetailsDto;
  onSave: (input: Record<FieldName, string>) => Promise<BillingDetailsDto>;
  onSaved: (saved: BillingDetailsDto) => void;
}) {
  const [values, setValues] = useState<Record<FieldName, string>>({
    tradingName: current.tradingName,
    address: current.address,
    contactEmail: current.contactEmail,
    paymentDetails: current.paymentDetails,
    vatStatus: current.vatStatus,
    paymentTerms: current.paymentTerms,
  });

  const save = useMutation({ mutationFn: onSave, onSuccess: onSaved });
  const dirty = FIELDS.some((f) => values[f.name] !== current[f.name]);
  const stillPlaceholders = FIELDS.filter((f) => /\[[^\]]*\]/.test(values[f.name]));

  return (
    <div style={{ maxWidth: 560 }}>
      <h1>Billing details</h1>
      <p style={{ color: 'var(--text-muted)' }}>
        These print on every invoice you send. Replace anything in [square brackets]; invoices
        can&apos;t be issued while any are left.
      </p>

      {stillPlaceholders.length > 0 ? (
        <p style={{ color: 'var(--warning)' }}>
          Still to fill in: {stillPlaceholders.map((f) => f.label).join(', ')}.
        </p>
      ) : (
        <p style={{ color: '#15803d' }}>All set. Invoices can be issued.</p>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate(values);
        }}
      >
        {FIELDS.map((f) => (
          <label key={f.name} style={{ display: 'block', marginBottom: 16 }}>
            <strong>{f.label}</strong>
            <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: 13 }}>
              {f.hint}
            </span>
            {f.multiline === true ? (
              <textarea
                value={values[f.name]}
                maxLength={BILLING_FIELD_MAX[f.name]}
                rows={3}
                onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
                style={{ width: '100%' }}
              />
            ) : (
              <input
                value={values[f.name]}
                maxLength={BILLING_FIELD_MAX[f.name]}
                onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
                style={{ width: '100%' }}
              />
            )}
          </label>
        ))}

        <button type="submit" disabled={!dirty || save.isPending}>
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
        {save.isSuccess && !dirty && <span style={{ marginLeft: 12 }}>Saved.</span>}
        {save.isError && <p style={{ color: 'var(--danger)' }}>{staffErrorMessage(save.error)}</p>}
      </form>
    </div>
  );
}
