import { checksDueResponseSchema, type ChecksDueResponse } from '@wagonwise/contracts/checks';

import { dueRows, dueSummary, mergeDue } from './check-due';

function template(id: string, name: string) {
  return {
    id,
    companyId: 'acme',
    name,
    appliesTo: 'all' as const,
    vehicleIds: [],
    items: [{ id: 'q', kind: 'note' as const, label: 'Notes', required: false }],
    version: 1,
    createdAt: '2026-10-09T09:00:00.000Z',
    updatedAt: '2026-10-09T09:00:00.000Z',
  };
}

function due(lists: { id: string; name: string; doneToday: boolean }[]): ChecksDueResponse {
  return checksDueResponseSchema.parse({
    vehicle: { id: 'lorry-1', name: 'Big Wagon' },
    lists: lists.map((l) => ({ template: template(l.id, l.name), doneToday: l.doneToday })),
  });
}

describe('mergeDue', () => {
  it('marks a list the server has as done, one on the phone as waiting, and the rest as due', () => {
    const view = mergeDue(
      due([
        { id: 'a', name: 'Tractor unit', doneToday: true },
        { id: 'b', name: 'Trailer', doneToday: false },
        { id: 'c', name: 'Van', doneToday: false },
      ]),
      [{ templateId: 'b', vehicleId: 'lorry-1' }],
    );
    expect(view.rows.map((r) => [r.template.name, r.state])).toEqual([
      ['Tractor unit', 'done'],
      ['Trailer', 'waiting'],
      ['Van', 'due'],
    ]);
  });

  it('does not count a check queued for a different vehicle', () => {
    const view = mergeDue(due([{ id: 'a', name: 'Tractor unit', doneToday: false }]), [
      { templateId: 'a', vehicleId: 'another-lorry' },
    ]);
    expect(view.rows[0]?.state).toBe('due');
  });

  it('has nothing for a driver with no vehicle', () => {
    const view = mergeDue({ vehicle: null, lists: [] }, []);
    expect(view).toEqual({ vehicle: null, rows: [] });
    expect(dueSummary(view)).toBeUndefined();
  });
});

describe('dueSummary', () => {
  it('names the single list due, or counts several, and says nothing when none is due', () => {
    const one = mergeDue(due([{ id: 'a', name: 'Tractor unit', doneToday: false }]), []);
    expect(dueSummary(one)).toBe('Tractor unit on Big Wagon');
    const two = mergeDue(
      due([
        { id: 'a', name: 'Tractor unit', doneToday: false },
        { id: 'b', name: 'Trailer', doneToday: false },
      ]),
      [],
    );
    expect(dueSummary(two)).toBe('2 checks on Big Wagon');
    expect(dueRows(two)).toHaveLength(2);
    const none = mergeDue(due([{ id: 'a', name: 'Tractor unit', doneToday: true }]), []);
    expect(dueSummary(none)).toBeUndefined();
  });
});
