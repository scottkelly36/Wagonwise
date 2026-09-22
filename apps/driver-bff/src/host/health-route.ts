import type { FastifyInstance } from 'fastify';

export interface HealthResponse {
  readonly status: 'ok';
  readonly service: 'driver-bff';
  readonly time: string;
}

export function registerHealthRoute(app: FastifyInstance): void {
  app.get('/health', (): HealthResponse => ({
    status: 'ok',
    service: 'driver-bff',
    time: new Date().toISOString(),
  }));
}
