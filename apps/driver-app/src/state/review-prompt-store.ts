import * as SecureStore from 'expo-secure-store';
import * as StoreReview from 'expo-store-review';
import { create } from 'zustand';

import { afterTrip, shouldAskForReview, type ReviewState } from '../lib/review-prompt';

const KEY = 'wagonwise.reviewPrompt';

export interface ReviewPromptStore extends ReviewState {
  restore(): Promise<void>;
  /** After a driver ends a personal trip: notes the day and, when it is time, shows the phone's own review prompt. Never throws. */
  tripEnded(now?: Date): Promise<void>;
}

const parse = (raw: string | null): ReviewState | null => {
  if (raw === null) return null;
  try {
    const v = JSON.parse(raw) as Partial<ReviewState>;
    return {
      tripDays: Array.isArray(v.tripDays) ? v.tripDays.filter((d) => typeof d === 'string') : [],
      lastAskedAt: typeof v.lastAskedAt === 'string' ? v.lastAskedAt : null,
    };
  } catch {
    return null;
  }
};

/** Kept on the phone only: the days trips ended and when the review prompt was last asked for (`lib/review-prompt.ts`). */
export const useReviewPromptStore = create<ReviewPromptStore>((set, get) => ({
  tripDays: [],
  lastAskedAt: null,

  async restore() {
    try {
      const stored = parse(await SecureStore.getItemAsync(KEY));
      if (stored !== null) set(stored);
    } catch {
      // Unreadable: start again, which only delays the prompt.
    }
  },

  async tripEnded(now = new Date()) {
    try {
      let state: ReviewState = afterTrip(get(), now);
      if (shouldAskForReview(state, now) && (await StoreReview.hasAction())) {
        await StoreReview.requestReview();
        state = { ...state, lastAskedAt: now.toISOString() };
      }
      set(state);
      await SecureStore.setItemAsync(
        KEY,
        JSON.stringify({ tripDays: state.tripDays, lastAskedAt: state.lastAskedAt }),
      );
    } catch {
      // A prompt that cannot be shown or remembered is not worth bothering the driver about.
    }
  },
}));
