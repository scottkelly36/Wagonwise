import {
  isDeliveryBlockedByProof,
  prepareProofPhoto,
  proofOfDeliveryStatus,
} from './proof-of-delivery';

describe('prepareProofPhoto', () => {
  it('builds the upload request, defaulting to JPEG', () => {
    expect(prepareProofPhoto({ base64: 'aGVsbG8=' })).toEqual({
      contentType: 'image/jpeg',
      dataBase64: 'aGVsbG8=',
    });
  });

  it('keeps the camera-reported type', () => {
    expect(prepareProofPhoto({ base64: 'aGVsbG8=', mimeType: 'image/png' })?.contentType).toBe(
      'image/png',
    );
  });

  it('refuses a photo with no data', () => {
    expect(prepareProofPhoto({})).toBeUndefined();
    expect(prepareProofPhoto({ base64: null })).toBeUndefined();
    expect(prepareProofPhoto({ base64: '' })).toBeUndefined();
  });

  it('refuses data that is not base64', () => {
    expect(prepareProofPhoto({ base64: 'not base64!!' })).toBeUndefined();
  });

  it('refuses a photo over the contract size cap rather than queueing it forever', () => {
    expect(prepareProofPhoto({ base64: 'A'.repeat(7_000_004) })).toBeUndefined();
  });
});

describe('proofOfDeliveryStatus', () => {
  const optional = { requiresProofOfDelivery: false, hasProofOfDelivery: false };

  it('says optional or required until a photo exists', () => {
    expect(proofOfDeliveryStatus(optional, false)).toBe('optional');
    expect(proofOfDeliveryStatus({ ...optional, requiresProofOfDelivery: true }, false)).toBe(
      'required',
    );
  });

  it('says received once the server has one', () => {
    expect(proofOfDeliveryStatus({ ...optional, hasProofOfDelivery: true }, false)).toBe(
      'received',
    );
  });

  it('prefers a photo waiting on the phone over the server flag (a retake in progress)', () => {
    expect(proofOfDeliveryStatus({ ...optional, hasProofOfDelivery: true }, true)).toBe(
      'waiting-to-upload',
    );
    expect(proofOfDeliveryStatus(optional, true)).toBe('waiting-to-upload');
  });
});

describe('isDeliveryBlockedByProof', () => {
  it('blocks only a required job whose photo has not reached the server', () => {
    expect(
      isDeliveryBlockedByProof({ requiresProofOfDelivery: true, hasProofOfDelivery: false }),
    ).toBe(true);
    expect(
      isDeliveryBlockedByProof({ requiresProofOfDelivery: true, hasProofOfDelivery: true }),
    ).toBe(false);
    expect(
      isDeliveryBlockedByProof({ requiresProofOfDelivery: false, hasProofOfDelivery: false }),
    ).toBe(false);
  });
});
