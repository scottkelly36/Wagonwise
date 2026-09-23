import { ApiError } from '../api/errors';
import { hazardsErrorMessage, routingErrorMessage } from './error-messages';

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
