import { companyIdSchema, type CompanyDto } from '@wagonwise/contracts/companies';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import * as companiesApi from '../../api/companies';
import { DataTable, type Column } from '../../components/DataTable';
import { FieldError } from '../../components/FieldError';
import { useStaffAuthStore } from '../../state/staff-auth-store';
import { staffErrorMessage } from '../staff/messages';

const COMPANIES_KEY = ['companies'] as const;

const COLUMNS: Column<CompanyDto>[] = [
  { key: 'name', header: 'Name', sortValue: (company) => company.name, cell: (c) => c.name },
  {
    key: 'created',
    header: 'Created',
    sortValue: (company) => company.createdAt,
    cell: (company) => new Date(company.createdAt).toLocaleDateString('en-GB'),
  },
];

export function Companies() {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const queryClient = useQueryClient();

  const companies = useQuery({
    queryKey: COMPANIES_KEY,
    queryFn: () => withAccessToken((token) => companiesApi.listCompanies(token)),
  });

  const createCompany = useMutation({
    mutationFn: (name: string) =>
      withAccessToken((token) =>
        companiesApi.createCompany(token, {
          id: companyIdSchema.parse(crypto.randomUUID()),
          name,
        }),
      ),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: COMPANIES_KEY }),
  });

  const [name, setName] = useState('');

  const [showError, setShowError] = useState(false);
  const nameError = name.trim().length === 0 ? 'Enter the company name.' : undefined;

  function handleSubmit(): void {
    if (nameError !== undefined) {
      setShowError(true);
      return;
    }
    createCompany.mutate(name.trim(), {
      onSuccess: () => {
        setName('');
        setShowError(false);
      },
    });
  }

  const error = companies.error ?? createCompany.error;

  return (
    <div>
      <h1>Companies</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        noValidate
        style={{ display: 'flex', gap: 8, marginBottom: 24, alignItems: 'flex-start' }}
      >
        <div className="field">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Company name"
            aria-label="Company name"
            aria-invalid={showError && nameError !== undefined}
            aria-describedby="company-name-error"
            autoFocus={showError}
          />
          <FieldError id="company-name-error" message={showError ? nameError : undefined} />
        </div>
        <button type="submit" disabled={createCompany.isPending}>
          {createCompany.isPending ? 'Adding…' : 'Add company'}
        </button>
      </form>

      {error !== null && <p style={{ color: '#dc2626' }}>{staffErrorMessage(error)}</p>}

      {companies.isPending ? (
        <p>Loading…</p>
      ) : (
        <DataTable
          columns={COLUMNS}
          rows={companies.data ?? []}
          rowKey={(company) => company.id}
          searchText={(company) => company.name}
          emptyText="No companies yet."
        />
      )}
    </div>
  );
}
