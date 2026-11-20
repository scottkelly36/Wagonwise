import * as SecureStore from 'expo-secure-store';
import * as StoreReview from 'expo-store-review';

import { useReviewPromptStore } from './review-prompt-store';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('expo-store-review', () => ({
  hasAction: jest.fn().mockResolvedValue(true),
  requestReview: jest.fn().mockResolvedValue(undefined),
}));

const requestReview = jest.mocked(StoreReview.requestReview);
const hasAction = jest.mocked(StoreReview.hasAction);

beforeEach(() => {
  jest.clearAllMocks();
  hasAction.mockResolvedValue(true);
  useReviewPromptStore.setState({ tripDays: [], lastAskedAt: null });
});

it('asks once trips have ended on two days, remembers when, and does not ask again soon', async () => {
  const store = useReviewPromptStore.getState();
  await store.tripEnded(new Date('2026-11-20T10:00:00Z'));
  expect(requestReview).not.toHaveBeenCalled();
  await store.tripEnded(new Date('2026-11-21T10:00:00Z'));
  expect(requestReview).toHaveBeenCalledTimes(1);
  expect(useReviewPromptStore.getState().lastAskedAt).toBe('2026-11-21T10:00:00.000Z');
  expect(jest.mocked(SecureStore.setItemAsync)).toHaveBeenLastCalledWith(
    'wagonwise.reviewPrompt',
    JSON.stringify({
      tripDays: ['2026-11-20', '2026-11-21'],
      lastAskedAt: '2026-11-21T10:00:00.000Z',
    }),
  );
  await store.tripEnded(new Date('2026-11-25T10:00:00Z'));
  expect(requestReview).toHaveBeenCalledTimes(1);
});

it('does not ask, or count it as asked, where the phone has no review prompt', async () => {
  hasAction.mockResolvedValue(false);
  useReviewPromptStore.setState({ tripDays: ['2026-11-19'], lastAskedAt: null });
  await useReviewPromptStore.getState().tripEnded(new Date('2026-11-21T10:00:00Z'));
  expect(requestReview).not.toHaveBeenCalled();
  expect(useReviewPromptStore.getState().lastAskedAt).toBeNull();
});

it('restores what was saved, and starts again from something unreadable', async () => {
  jest
    .mocked(SecureStore.getItemAsync)
    .mockResolvedValue(JSON.stringify({ tripDays: ['2026-11-01'], lastAskedAt: null }));
  await useReviewPromptStore.getState().restore();
  expect(useReviewPromptStore.getState().tripDays).toEqual(['2026-11-01']);
  useReviewPromptStore.setState({ tripDays: [], lastAskedAt: null });
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue('not json');
  await useReviewPromptStore.getState().restore();
  expect(useReviewPromptStore.getState().tripDays).toEqual([]);
});
