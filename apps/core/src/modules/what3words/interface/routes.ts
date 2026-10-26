import {
  locationToWordsRequestSchema,
  wordsToLocationRequestSchema,
} from '@wagonwise/contracts/what3words';
import type { FastifyInstance } from 'fastify';
import { locationToWords, wordsToLocation } from '../application/lookup.js';
import type { WordsProvider } from '../application/words-provider.js';
import type { What3wordsAddress } from '../domain/words.js';

function dto(address: What3wordsAddress) {
  return {
    words: address.words,
    location: address.location,
    ...(address.nearestPlace === undefined ? {} : { nearestPlace: address.nearestPlace }),
    ...(address.country === undefined ? {} : { country: address.country }),
  };
}

const STATUS = { InvalidWords: 400, WordsNotFound: 404, LookupUnavailable: 503 } as const;

/**
 * what3words lookups for the driver app and, as `/staff/what3words/to-location`, for the portal's job form (the host's auth hook needs a signed-in driver for `/what3words/`). The key never leaves core.
 * Both answer 200 with the address or the error's tag with a status the app can tell apart: 400 not three words, 404 no such square,
 * 503 the lookup is off or down.
 */
export function registerWhat3wordsRoutes(app: FastifyInstance, provider: WordsProvider): void {
  app.post('/what3words/to-location', async (request, reply) => {
    const parsed = wordsToLocationRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const result = await wordsToLocation(provider, parsed.data.words);
    return result.ok
      ? reply.status(200).send(dto(result.value))
      : reply
          .status(STATUS[result.error.tag])
          .send({ tag: result.error.tag, requestId: request.id });
  });

  // The portal's job form: three words to the spot for a stop. Any signed-in staff account (the host's staff auth checks the
  // token); the same answers and statuses as the driver's.
  app.post('/staff/what3words/to-location', async (request, reply) => {
    const parsed = wordsToLocationRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const result = await wordsToLocation(provider, parsed.data.words);
    return result.ok
      ? reply.status(200).send(dto(result.value))
      : reply
          .status(STATUS[result.error.tag])
          .send({ tag: result.error.tag, requestId: request.id });
  });

  app.post('/what3words/to-words', async (request, reply) => {
    const parsed = locationToWordsRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const result = await locationToWords(provider, parsed.data.location);
    return result.ok
      ? reply.status(200).send(dto(result.value))
      : reply
          .status(STATUS[result.error.tag])
          .send({ tag: result.error.tag, requestId: request.id });
  });
}
