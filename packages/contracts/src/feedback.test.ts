import { describe, expect, it } from 'vitest';
import { feedbackNoteSchema, submitFeedbackRequestSchema } from './feedback.js';

describe('submitFeedbackRequestSchema', () => {
  it('requires message, appVersion and deviceInfo — no driverId field', () => {
    const result = submitFeedbackRequestSchema.safeParse({
      message: 'The route avoided a bridge that was fine.',
      appVersion: '1.0.0',
      deviceInfo: 'ios 17.2',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a blank message', () => {
    const result = submitFeedbackRequestSchema.safeParse({
      message: '',
      appVersion: '1.0.0',
      deviceInfo: 'ios 17.2',
    });
    expect(result.success).toBe(false);
  });

  it('ignores an extraneous driverId field rather than requiring or rejecting it', () => {
    const result = submitFeedbackRequestSchema.safeParse({
      driverId: 'driver-1',
      message: 'Feedback',
      appVersion: '1.0.0',
      deviceInfo: 'ios 17.2',
    });
    expect(result.success).toBe(true);
  });
});

describe('feedbackNoteSchema', () => {
  it('parses a real response shape', () => {
    const result = feedbackNoteSchema.safeParse({
      id: '11111111-1111-4111-8111-111111111111',
      driverId: 'driver-1',
      message: 'Feedback',
      appVersion: '1.0.0',
      deviceInfo: 'ios 17.2',
      createdAt: '2026-06-15T08:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });
});
