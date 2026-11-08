import {
  LEGAL_FORMS,
  RELATIONSHIPS,
  type ProspectDto,
  type Relationship,
  type LegalForm,
} from '@wagonwise/contracts/sales';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import * as salesApi from '../api/sales';
import { LEGAL_FORM_LABELS } from '../lib/sales';
import { staffErrorMessage } from '../pages/staff/messages';
import { useStaffAuthStore } from '../state/staff-auth-store';

const blankToNull = (text: string): string | null => (text.trim() === '' ? null : text.trim());

/**
 * Adds a firm, or changes one: the details only (a firm's stage moves when a contact is logged). On a change a blank box
 * clears that detail.
 */
export function SalesFirmForm({
  firm,
  onDone,
  onCancel,
}: {
  firm?: ProspectDto | undefined;
  onDone: () => void;
  onCancel: () => void;
}) {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const queryClient = useQueryClient();
  const [name, setName] = useState(firm?.name ?? '');
  const [town, setTown] = useState(firm?.town ?? '');
  const [fleetSize, setFleetSize] = useState(
    firm?.fleetSize === undefined ? '' : String(firm.fleetSize),
  );
  const [haulageType, setHaulageType] = useState(firm?.haulageType ?? '');
  const [website, setWebsite] = useState(firm?.website ?? '');
  const [phone, setPhone] = useState(firm?.phone ?? '');
  const [email, setEmail] = useState(firm?.email ?? '');
  const [contactPerson, setContactPerson] = useState(firm?.contactPerson ?? '');
  const [legalForm, setLegalForm] = useState<LegalForm>(firm?.legalForm ?? 'unknown');
  const [relationship, setRelationship] = useState<Relationship>(firm?.relationship ?? 'new');
  const [notes, setNotes] = useState(firm?.notes ?? '');

  const fleetOk = fleetSize.trim() === '' || /^\d{1,5}$/.test(fleetSize.trim());
  const valid = name.trim() !== '' && fleetOk;

  const save = useMutation({
    mutationFn: () =>
      withAccessToken((token) =>
        firm === undefined
          ? salesApi.createProspect(token, {
              name,
              town,
              ...(fleetSize.trim() === '' ? {} : { fleetSize: Number(fleetSize) }),
              haulageType,
              website,
              phone,
              email,
              contactPerson,
              legalForm,
              relationship,
              notes,
            })
          : salesApi.updateProspect(token, firm.id, {
              name,
              town: blankToNull(town),
              fleetSize: fleetSize.trim() === '' ? null : Number(fleetSize),
              haulageType: blankToNull(haulageType),
              website: blankToNull(website),
              phone: blankToNull(phone),
              email: blankToNull(email),
              contactPerson: blankToNull(contactPerson),
              legalForm,
              relationship,
              notes: blankToNull(notes),
            }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sales'] });
      onDone();
    },
  });

  return (
    <section className="box mb-16">
      <h2 className="mt-0">{firm === undefined ? 'Add a firm' : `Edit ${firm.name}`}</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) save.mutate();
        }}
        className="flex gap-12 wrap items-end"
      >
        <label>
          <span className="block">Firm name</span>
          <input
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
            style={{ width: 240 }}
          />
        </label>
        <label>
          <span className="block">Town</span>
          <input
            value={town}
            maxLength={80}
            onChange={(e) => setTown(e.target.value)}
            style={{ width: 160 }}
          />
        </label>
        <label>
          <span className="block">About how many lorries</span>
          <input
            inputMode="numeric"
            value={fleetSize}
            aria-invalid={!fleetOk}
            onChange={(e) => setFleetSize(e.target.value)}
            style={{ width: 90 }}
          />
        </label>
        <label>
          <span className="block">Type of haulage</span>
          <input
            value={haulageType}
            maxLength={200}
            onChange={(e) => setHaulageType(e.target.value)}
            style={{ width: 240 }}
          />
        </label>
        <label>
          <span className="block">Website</span>
          <input
            value={website}
            maxLength={200}
            onChange={(e) => setWebsite(e.target.value)}
            style={{ width: 220 }}
          />
        </label>
        <label>
          <span className="block">Phone</span>
          <input
            value={phone}
            maxLength={60}
            onChange={(e) => setPhone(e.target.value)}
            style={{ width: 160 }}
          />
        </label>
        <label>
          <span className="block">Company mailbox</span>
          <input
            value={email}
            maxLength={254}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: 240 }}
          />
        </label>
        <label>
          <span className="block">Who to ask for</span>
          <input
            value={contactPerson}
            maxLength={80}
            onChange={(e) => setContactPerson(e.target.value)}
            style={{ width: 180 }}
          />
        </label>
        <label>
          <span className="block">Kind of business</span>
          <select value={legalForm} onChange={(e) => setLegalForm(e.target.value as LegalForm)}>
            {LEGAL_FORMS.map((form) => (
              <option key={form} value={form}>
                {LEGAL_FORM_LABELS[form]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="block">Do you know them?</span>
          <select
            value={relationship}
            onChange={(e) => setRelationship(e.target.value as Relationship)}
          >
            {RELATIONSHIPS.map((r) => (
              <option key={r} value={r}>
                {r === 'warm' ? 'Yes, an existing contact' : 'No, a new contact'}
              </option>
            ))}
          </select>
        </label>
        <label style={{ flexBasis: '100%' }}>
          <span className="block">Notes</span>
          <textarea
            value={notes}
            maxLength={2000}
            rows={2}
            onChange={(e) => setNotes(e.target.value)}
            style={{ width: '100%' }}
          />
        </label>
        <button type="submit" className="btn-primary" disabled={!valid || save.isPending}>
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </form>
      {!fleetOk && (
        <p className="text-danger">
          Enter the number of lorries as a whole number, or leave it blank.
        </p>
      )}
      {save.isError && <p className="text-danger">{staffErrorMessage(save.error)}</p>}
    </section>
  );
}
