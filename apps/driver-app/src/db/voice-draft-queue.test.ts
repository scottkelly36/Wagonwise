import type { ParsedVoiceHazardReportDto } from '@wagonwise/contracts/hazards';

import {
  listVoiceHazardDrafts,
  removeVoiceHazardDraft,
  saveVoiceHazardDraft,
  type VoiceHazardDraft,
} from './voice-draft-queue';

interface FakeRow {
  readonly id: string;
  readonly payload: string;
  readonly created_at: string;
}

// Same in-memory stand-in as hazard-queue.test.ts, no real native database (no native build
// toolchain on this machine).
const mockRows: FakeRow[] = [];

// jest-expo's own auto-mock stubs expo-crypto's functions as jest.fn() with no implementation
// (returns undefined) — real enough for a module report-hazard.tsx never had a test to catch
// this in. A plain incrementing id is a fine stand-in — nothing here cares about UUID shape,
// only that each saved draft gets a distinct one.
let mockNextId = 0;
jest.mock('expo-crypto', () => ({
  randomUUID: () => `draft-${(mockNextId += 1)}`,
}));

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: jest.fn(() => ({
    execSync: jest.fn(),
    runAsync: jest.fn(async (sql: string, ...params: unknown[]) => {
      if (sql.startsWith('insert')) {
        const [id, payload, createdAt] = params as [string, string, string];
        mockRows.push({ id, payload, created_at: createdAt });
      } else if (sql.startsWith('delete')) {
        const [id] = params as [string];
        const index = mockRows.findIndex((r) => r.id === id);
        if (index >= 0) mockRows.splice(index, 1);
      }
      return { changes: 1, lastInsertRowId: 0 };
    }),
    getAllAsync: jest.fn(async () =>
      [...mockRows]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((r) => ({ payload: r.payload })),
    ),
  })),
}));

const parsed: ParsedVoiceHazardReportDto = { type: 'low_bridge' };
const origin = { lat: 54.9707, lon: -2.1013 };

beforeEach(() => {
  mockRows.length = 0;
  mockNextId = 0;
});

describe('voice hazard draft queue', () => {
  it('starts empty', async () => {
    expect(await listVoiceHazardDrafts()).toEqual([]);
  });

  it('round-trips a saved draft through listVoiceHazardDrafts, assigning an id and timestamp', async () => {
    const saved = await saveVoiceHazardDraft({ transcript: 'low bridge ahead', parsed, origin });

    expect(saved.id).toEqual(expect.any(String));
    expect(saved.createdAt).toEqual(expect.any(String));
    expect(await listVoiceHazardDrafts()).toEqual([saved]);
  });

  it('preserves a draft with no origin (location unavailable at capture time)', async () => {
    const saved = await saveVoiceHazardDraft({
      transcript: 'flooding somewhere',
      parsed,
      origin: undefined,
    });
    expect((await listVoiceHazardDrafts())[0]).toEqual(saved);
  });

  it('lists drafts newest first', async () => {
    const first = await saveVoiceHazardDraft({ transcript: 'first', parsed, origin });
    await new Promise((resolve) => setTimeout(resolve, 2));
    const second = await saveVoiceHazardDraft({ transcript: 'second', parsed, origin });

    const listed = await listVoiceHazardDrafts();
    expect(listed.map((d: VoiceHazardDraft) => d.id)).toEqual([second.id, first.id]);
  });

  it('removes a draft by id, leaving the others', async () => {
    const first = await saveVoiceHazardDraft({ transcript: 'first', parsed, origin });
    const second = await saveVoiceHazardDraft({ transcript: 'second', parsed, origin });

    await removeVoiceHazardDraft(first.id);

    const listed = await listVoiceHazardDrafts();
    expect(listed.map((d) => d.id)).toEqual([second.id]);
  });
});
