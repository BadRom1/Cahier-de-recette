import { rm } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, TEST_WRITE_TOKEN, type TestApp } from '../helpers/build-test-app.js';
import { CREPES_SOURCE, SALADE_SOURCE } from '../helpers/fakes.js';

const authorized = { authorization: `Bearer ${TEST_WRITE_TOKEN}` };

describe('HTTP API', () => {
  let context: TestApp;

  beforeAll(async () => {
    context = await buildTestApp();
  });

  afterAll(async () => {
    await context.app.close();
    await rm(context.recipesDir, { recursive: true, force: true });
  });

  it('responds to the health check', async () => {
    const response = await context.app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('starts with an empty collection', async () => {
    const response = await context.app.inject({ method: 'GET', url: '/api/recipes' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
  });

  it('rejects an unauthenticated create', async () => {
    const response = await context.app.inject({
      method: 'POST',
      url: '/api/recipes',
      payload: { source: CREPES_SOURCE },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe('UNAUTHORIZED');
  });

  it('rejects a create with a wrong token', async () => {
    const response = await context.app.inject({
      method: 'POST',
      url: '/api/recipes',
      headers: { authorization: 'Bearer nope' },
      payload: { source: CREPES_SOURCE },
    });
    expect(response.statusCode).toBe(401);
  });

  it('creates a recipe with the write token', async () => {
    const response = await context.app.inject({
      method: 'POST',
      url: '/api/recipes',
      headers: authorized,
      payload: { source: CREPES_SOURCE },
    });
    expect(response.statusCode).toBe(201);
    expect(response.headers.location).toBe('/api/recipes/crepes');
    const body = response.json();
    expect(body.slug).toBe('crepes');
    expect(body.title).toBe('Crêpes');
    expect(body.ingredients).toHaveLength(2);
  });

  it('rejects a duplicate slug with 409', async () => {
    const response = await context.app.inject({
      method: 'POST',
      url: '/api/recipes',
      headers: authorized,
      payload: { source: CREPES_SOURCE },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('RECIPE_ALREADY_EXISTS');
  });

  it('reads a recipe publicly', async () => {
    const response = await context.app.inject({ method: 'GET', url: '/api/recipes/crepes' });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.title).toBe('Crêpes');
    expect(body.source).toContain('@farine{250%g}');
    expect(body.steps.length).toBeGreaterThan(0);
  });

  it('serves the raw .cook file for the Cooklang apps', async () => {
    const response = await context.app.inject({ method: 'GET', url: '/recipes/crepes.cook' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.body).toBe(CREPES_SOURCE);
  });

  it('serves a plain-text index of raw files', async () => {
    const response = await context.app.inject({ method: 'GET', url: '/recipes/index.txt' });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('/recipes/crepes.cook');
  });

  it('searches by free text and tag', async () => {
    await context.app.inject({
      method: 'POST',
      url: '/api/recipes',
      headers: authorized,
      payload: { source: SALADE_SOURCE },
    });
    const byText = await context.app.inject({ method: 'GET', url: '/api/recipes?q=farine' });
    expect(byText.json().map((r: { slug: string }) => r.slug)).toEqual(['crepes']);
    const byTag = await context.app.inject({ method: 'GET', url: '/api/recipes?tag=entr%C3%A9e' });
    expect(byTag.json().map((r: { slug: string }) => r.slug)).toEqual(['salade-verte']);
  });

  it('updates a recipe with the write token', async () => {
    const updated = CREPES_SOURCE.replace('250%g', '300%g');
    const response = await context.app.inject({
      method: 'PUT',
      url: '/api/recipes/crepes',
      headers: authorized,
      payload: { source: updated },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().ingredients[0].quantity).toBe('300');
  });

  it('rejects an unauthenticated delete', async () => {
    const response = await context.app.inject({ method: 'DELETE', url: '/api/recipes/crepes' });
    expect(response.statusCode).toBe(401);
  });

  it('deletes a recipe with the write token', async () => {
    const response = await context.app.inject({
      method: 'DELETE',
      url: '/api/recipes/crepes',
      headers: authorized,
    });
    expect(response.statusCode).toBe(204);
    const gone = await context.app.inject({ method: 'GET', url: '/api/recipes/crepes' });
    expect(gone.statusCode).toBe(404);
    expect(gone.json().code).toBe('RECIPE_NOT_FOUND');
  });

  it('maps an invalid slug to 400', async () => {
    const response = await context.app.inject({ method: 'GET', url: '/api/recipes/NOT%20VALID' });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('INVALID_RECIPE_SLUG');
  });

  it('answers 404 on unknown API routes', async () => {
    const response = await context.app.inject({ method: 'GET', url: '/api/nope' });
    expect(response.statusCode).toBe(404);
  });
});

describe('HTTP API without write token', () => {
  it('refuses writes with 503 when WRITE_TOKEN is not configured', async () => {
    const context = await buildTestApp({ writeToken: null });
    const response = await context.app.inject({
      method: 'POST',
      url: '/api/recipes',
      payload: { source: 'x' },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json().code).toBe('WRITES_DISABLED');
    await context.app.close();
    await rm(context.recipesDir, { recursive: true, force: true });
  });
});
