import { ApiError } from '../api/errors';
import { routingErrorMessage } from './error-messages';

describe('routingErrorMessage', () => {
  it('maps a known tag to plain UK-English wording', () => {
    expect(routingErrorMessage(new ApiError('InvalidDimensions', 400))).toBe(
      'Every measurement must be a positive number.',
    );
    expect(routingErrorMessage(new ApiError('VehicleProfileNotFound', 404))).toBe(
      "That vehicle isn't there any more.",
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
