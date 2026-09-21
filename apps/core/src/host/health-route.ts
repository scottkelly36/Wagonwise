import type { FastifyInstance } from 'fastify';
import { PRODUCT_NAME } from '../config.js';
import type { Clock } from '../shared/ports/clock.js';

export interface HealthResponse {
  readonly status: 'ok';
  readonly service: 'core';
  readonly product: string;
  readonly time: string;
}

export function registerHealthRoute(app: FastifyInstance, deps: { readonly clock: Clock }): void {
  app.get('/health', (): HealthResponse => ({
    status: 'ok',
    service: 'core',
    product: PRODUCT_NAME,
    time: deps.clock.now().toISOString(),
  }));
}
