export type CardErrorCode =
  | 'no_reader'
  | 'no_card'
  | 'card_removed'
  | 'not_driver_card'
  | 'file_missing'
  | 'read_failed'
  | 'signature_failed'
  | 'protocol'
  | 'cancelled';

/** Something went wrong reading a card. `code` says what to tell the driver; `message` is for the log. */
export class CardError extends Error {
  constructor(
    readonly code: CardErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CardError';
  }
}

const TEXT: Record<CardErrorCode, string> = {
  no_reader: 'No card reader found. Plug your reader into the phone and try again.',
  no_card: 'No card in the reader. Put your driver card in, chip first, and try again.',
  card_removed: 'The card was taken out while it was being read. Put it back and start again.',
  not_driver_card: 'That is not a driver card. Put your own driver card in the reader.',
  file_missing:
    'The card did not have something it should. Try again, and if it keeps happening, use another download tool for now.',
  read_failed: 'The card could not be read. Clean the chip, put it back and try again.',
  signature_failed:
    'The card would not sign the data, so the copy would not be a proper download. Try again.',
  protocol:
    'The reader and the card did not understand each other. Try again, or use another download tool for now.',
  cancelled: 'Stopped.',
};

/** What to tell the driver. */
export function cardErrorText(error: unknown): string {
  return error instanceof CardError ? TEXT[error.code] : TEXT.protocol;
}
