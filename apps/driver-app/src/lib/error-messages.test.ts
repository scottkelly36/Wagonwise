import { ApiError } from '../api/errors';
import {
  feedbackErrorMessage,
  fleetErrorMessage,
  hazardsErrorMessage,
  identityErrorMessage,
  jobsErrorMessage,
  routingErrorMessage,
} from './error-messages';

describe('routingErrorMessage', () => {
  it('maps a known tag to plain UK-English wording', () => {
    expect(routingErrorMessage(new ApiError('InvalidDimensions', 400))).toBe(
      'Every measurement must be a positive number.',
    );
    expect(routingErrorMessage(new ApiError('VehicleProfileNotFound', 404))).toBe(
      "That vehicle isn't there any more.",
    );
    expect(routingErrorMessage(new ApiError('TripAlreadyActive', 409))).toBe(
      'You already have a trip in progress.',
    );
  });

  it('falls back to a generic message for an unrecognised tag', () => {
    expect(routingErrorMessage(new ApiError('SomeNewTag', 500))).toBe(
      'Something went wrong. Try again.',
    );
  });

  it('falls back to a network message for a non-ApiError (e.g. fetch failure)', () => {
    expect(routingErrorMessage(new TypeError('Network request failed'))).toBe(
      "Couldn't reach the server. Check your connection.",
    );
  });
});

describe('hazardsErrorMessage', () => {
  it('maps a known tag to plain UK-English wording', () => {
    expect(hazardsErrorMessage(new ApiError('InvalidMeasurement', 400))).toBe(
      'The measurement must be a positive number.',
    );
    expect(hazardsErrorMessage(new ApiError('HazardReportNotFound', 404))).toBe(
      "That report isn't there any more.",
    );
  });

  it('falls back to a generic message for an unrecognised tag', () => {
    expect(hazardsErrorMessage(new ApiError('SomeNewTag', 500))).toBe(
      'Something went wrong. Try again.',
    );
  });

  it('falls back to a network message for a non-ApiError', () => {
    expect(hazardsErrorMessage(new TypeError('Network request failed'))).toBe(
      "Couldn't reach the server. Check your connection.",
    );
  });
});

describe('feedbackErrorMessage', () => {
  it('maps a known tag to plain UK-English wording', () => {
    expect(feedbackErrorMessage(new ApiError('InvalidMessage', 400))).toBe(
      'Write a note before sending.',
    );
  });

  it('falls back to a generic message for an unrecognised tag', () => {
    expect(feedbackErrorMessage(new ApiError('SomeNewTag', 500))).toBe(
      'Something went wrong. Try again.',
    );
  });

  it('falls back to a network message for a non-ApiError', () => {
    expect(feedbackErrorMessage(new TypeError('Network request failed'))).toBe(
      "Couldn't reach the server. Check your connection.",
    );
  });
});

describe('identityErrorMessage', () => {
  it('maps a known tag to plain UK-English wording', () => {
    expect(identityErrorMessage(new ApiError('DriverNotFound', 404))).toBe(
      "Your account isn't there any more.",
    );
  });

  it('falls back to a generic message for an unrecognised tag', () => {
    expect(identityErrorMessage(new ApiError('SomeNewTag', 500))).toBe(
      'Something went wrong. Try again.',
    );
  });

  it('falls back to a network message for a non-ApiError', () => {
    expect(identityErrorMessage(new TypeError('Network request failed'))).toBe(
      "Couldn't reach the server. Check your connection.",
    );
  });
});

describe('fleetErrorMessage', () => {
  it('maps a known tag to plain UK-English wording', () => {
    expect(fleetErrorMessage(new ApiError('InvalidCode', 400))).toBe(
      "That code isn't right. Check it with your company and try again.",
    );
    expect(fleetErrorMessage(new ApiError('TooManyAttempts', 429))).toBe(
      'Too many wrong codes. Try again in 15 minutes.',
    );
  });

  it('falls back to a generic message for an unrecognised tag', () => {
    expect(fleetErrorMessage(new ApiError('SomeNewTag', 500))).toBe(
      'Something went wrong. Try again.',
    );
  });

  it('falls back to a network message for a non-ApiError', () => {
    expect(fleetErrorMessage(new TypeError('Network request failed'))).toBe(
      "Couldn't reach the server. Check your connection.",
    );
  });
});

describe('jobsErrorMessage', () => {
  it('maps a known tag to plain UK-English wording', () => {
    expect(jobsErrorMessage(new ApiError('JobNotFound', 404))).toBe(
      "That job isn't there any more.",
    );
    expect(jobsErrorMessage(new ApiError('ProofOfDeliveryRequired', 409))).toBe(
      'Take a photo of the delivery first — this job needs one.',
    );
    expect(jobsErrorMessage(new ApiError('InvalidTransition', 409))).toBe(
      'That job has already moved on — pull to refresh.',
    );
  });

  it('falls back to a generic message for an unrecognised tag', () => {
    expect(jobsErrorMessage(new ApiError('SomeNewTag', 500))).toBe(
      'Something went wrong. Try again.',
    );
  });

  it('falls back to a network message for a non-ApiError', () => {
    expect(jobsErrorMessage(new TypeError('Network request failed'))).toBe(
      "Couldn't reach the server. Check your connection.",
    );
  });
});
