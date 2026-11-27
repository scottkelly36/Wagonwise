/** A driver card download built by hand, for tests: an identification record in a download's own layout. Invented people only. */
const pad = (text: string, length: number): number[] => {
  const bytes = [...text].map((c) => c.charCodeAt(0));
  while (bytes.length < length) bytes.push(0x20);
  return bytes.slice(0, length);
};
const time = (iso: string): number[] => {
  const seconds = Date.parse(iso) / 1000;
  return [(seconds >>> 24) & 0xff, (seconds >>> 16) & 0xff, (seconds >>> 8) & 0xff, seconds & 0xff];
};

export function cardFile(card: {
  cardNumber: string;
  surname: string;
  firstNames: string;
  expiresAt: string;
}): Buffer {
  const identification = [
    0x01, // issuing state
    ...pad(card.cardNumber, 16),
    0x01,
    ...pad('Test Authority', 35),
    ...time('2021-03-01T00:00:00Z'),
    ...time('2021-03-01T00:00:00Z'),
    ...time(card.expiresAt),
    0x01,
    ...pad(card.surname, 35),
    0x01,
    ...pad(card.firstNames, 35),
    0x19,
    0x90,
    0x01,
    0x01, // birth date
    0x65,
    0x6e, // language
  ];
  const length = identification.length;
  return Buffer.from([0x05, 0x20, 0x00, length >> 8, length & 0xff, ...identification]);
}
