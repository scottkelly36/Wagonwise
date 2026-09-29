import type { FastifyInstance } from 'fastify';

export interface HealthResponse {
  readonly status: 'ok';
  readonly service: 'staff-bff';
  readonly time: string;
}

export function registerHealthRoute(app: FastifyInstance): void {
  app.get('/health', (): HealthResponse => ({
    status: 'ok',
    service: 'staff-bff',
    time: new Date().toISOString(),
  }));
}
