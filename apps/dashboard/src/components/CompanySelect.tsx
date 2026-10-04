import { useCompanies } from '../hooks/use-companies';

interface Props {
  readonly id: string;
  /** The chosen company's id, or '' for none. */
  readonly value: string;
  readonly onChange: (companyId: string) => void;
  /** What the empty choice says, e.g. "Choose a company" or "Everyone". */
  readonly emptyLabel: string;
  readonly invalid?: boolean | undefined;
  readonly describedBy?: string | undefined;
}

/** WagonWise staff pick a company by name from a list, instead of pasting its id. */
export function CompanySelect({ id, value, onChange, emptyLabel, invalid, describedBy }: Props) {
  const companies = useCompanies(true);
  const sorted = [...(companies.data ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'en-GB'));
  return (
    <>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={companies.isPending}
        aria-invalid={invalid}
        aria-describedby={describedBy}
      >
        <option value="">{companies.isPending ? 'Loading companies…' : emptyLabel}</option>
        {sorted.map((company) => (
          <option key={company.id} value={company.id}>
            {company.name}
          </option>
        ))}
      </select>
      {companies.error !== null && (
        <p className="field-error" role="alert">
          Could not load the companies. Reload the page to try again.
        </p>
      )}
    </>
  );
}
