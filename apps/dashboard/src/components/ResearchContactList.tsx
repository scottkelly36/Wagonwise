import { useQuery } from '@tanstack/react-query';
import * as feedbackApi from '../api/feedback';
import { useStaffAuthStore } from '../state/staff-auth-store';
import { ErrorNotice } from './ErrorNotice';

/**
 * The people at companies who said WagonWise may ask them for feedback: their latest answer is yes, to the current wording. Nobody who is
 * not on this list should be contacted for research. WagonWise staff only. Says so plainly while the option is switched off.
 */
export function ResearchContactList() {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const list = useQuery({
    queryKey: ['research-contacts'],
    queryFn: () => withAccessToken((token) => feedbackApi.listResearchContacts(token)),
  });

  return (
    <section style={{ marginTop: 32 }}>
      <h2>Happy to be asked for feedback</h2>
      {list.isError && <ErrorNotice error={list.error} />}
      {list.data !== undefined && !list.data.available && (
        <p className="muted">
          The option is switched off, so nobody has been asked and nobody can be contacted for
          research. It is switched on with RESEARCH_CONTACT_ENABLED once the wording has been
          checked.
        </p>
      )}
      {list.data?.available === true && (
        <>
          <p className="muted">
            People at companies who said we may ask them for feedback from time to time. Contact
            nobody for research who is not on this list. They can withdraw in Settings at any time,
            and then they come off it.
          </p>
          {list.data.people.length === 0 ? (
            <p className="muted">Nobody yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Name</th>
                  <th style={{ textAlign: 'left' }}>Email</th>
                  <th style={{ textAlign: 'left' }}>Company</th>
                  <th style={{ textAlign: 'left' }}>Said yes</th>
                </tr>
              </thead>
              <tbody>
                {list.data.people.map((p) => (
                  <tr key={p.email}>
                    <td>{p.name}</td>
                    <td>{p.email}</td>
                    <td>{p.company}</td>
                    <td>{new Date(p.at).toLocaleDateString('en-GB')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}
