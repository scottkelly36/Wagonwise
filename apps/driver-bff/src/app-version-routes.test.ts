import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerAppVersionRoutes } from './app-version-routes.js';

describe('GET /app/version', () => {
  it('needs no sign-in and gives what is set', async () => {
    const app = Fastify();
    registerAppVersionRoutes(app, {
      appVersion: {
        latestVersion: '1.3.0',
        updateUrl: 'https://play.google.com/store/apps/details?id=x',
      },
    });
    const response = await app.inject({ method: 'GET', url: '/app/version' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      latestVersion: '1.3.0',
      updateUrl: 'https://play.google.com/store/apps/details?id=x',
    });
  });

  it('gives an empty answer when nothing is set, so the app says nothing', async () => {
    const app = Fastify();
    registerAppVersionRoutes(app, { appVersion: {} });
    const response = await app.inject({ method: 'GET', url: '/app/version' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({});
  });
});
