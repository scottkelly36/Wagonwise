import { warningsAtRequestSchema } from '@wagonwise/contracts/weather';
import type { FastifyInstance } from 'fastify';
import type { WarningsCache } from '../application/warnings-cache.js';
import type { WeatherWarning } from '../domain/warning.js';

function toDto(warning: WeatherWarning) {
  return {
    id: warning.id,
    level: warning.level,
    kinds: [...warning.kinds],
    headline: warning.headline,
    ...(warning.details === undefined ? {} : { details: warning.details }),
    validFrom: warning.validFrom.toISOString(),
    validTo: warning.validTo.toISOString(),
    areas: [...warning.areas],
  };
}

/**
 * Met Office weather warnings. The data is public and the same for everyone, so there is no company
 * scoping: `/weather/*` needs a signed-in driver and `/staff/weather/*` a signed-in staff account (both
 * checked by the host's auth hooks before these run). A driver asks about the point they are at; the
 * dashboard gets every warning with its area to draw on the map.
 */
export function registerWeatherRoutes(app: FastifyInstance, cache: WarningsCache): void {
  app.post('/weather/warnings/at', async (request, reply) => {
    const parsed = warningsAtRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    return reply.status(200).send({ warnings: cache.at(parsed.data.location).map(toDto) });
  });

  app.get('/staff/weather/warnings', async (request, reply) => {
    if (request.staffId === undefined) {
      return reply.status(401).send({ error: 'unauthenticated', requestId: request.id });
    }
    const { warnings, updatedAt } = cache.current();
    return reply.status(200).send({
      warnings: warnings.map((w) => ({
        ...toDto(w),
        area: { type: 'MultiPolygon', coordinates: w.area },
      })),
      ...(updatedAt === undefined ? {} : { updatedAt: updatedAt.toISOString() }),
    });
  });
}
