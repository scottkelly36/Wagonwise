import { companyIdSchema } from '@wagonwise/contracts/companies';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import * as companiesApi from '../../api/companies';
import { ApiError } from '../../api/errors';
import { useAuthStore } from '../../state/auth-store';

const COMPANIES_KEY = ['companies'] as const;

export function Companies() {
  const accessToken = useAuthStore((s) =>
    s.state.status === 'signedIn' ? s.state.accessToken : undefined,
  );
  const queryClient = useQueryClient();

  const companies = useQuery({
    queryKey: COMPANIES_KEY,
    queryFn: () => companiesApi.listCompanies(accessToken as string),
    enabled: accessToken !== undefined,
  });

  const createCompany = useMutation({
    mutationFn: (name: string) =>
      companiesApi.createCompany(accessToken as string, {
        id: companyIdSchema.parse(crypto.randomUUID()),
        name,
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: COMPANIES_KEY }),
  });

  const [name, setName] = useState('');

  function handleSubmit(): void {
    if (name.trim().length === 0) return;
    createCompany.mutate(name.trim(), { onSuccess: () => setName('') });
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
        style={{ display: 'flex', gap: 8, marginBottom: 24 }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Company name" />
        <button type="submit" disabled={createCompany.isPending || name.trim().length === 0}>
          {createCompany.isPending ? 'Adding…' : 'Add company'}
        </button>
      </form>

      {error !== null && (
        <p style={{ color: '#dc2626' }}>
          {error instanceof ApiError ? error.tag : 'Something went wrong.'}
        </p>
      )}

      {companies.isPending ? (
        <p>Loading…</p>
      ) : companies.data?.length === 0 ? (
        <p style={{ color: '#6b7280' }}>No companies yet.</p>
      ) : (
        <table style={{ width: '100%', textAlign: 'left' }}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {companies.data?.map((company) => (
              <tr key={company.id}>
                <td>{company.name}</td>
                <td>{new Date(company.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
