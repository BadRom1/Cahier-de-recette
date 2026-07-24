import { createHash, randomBytes } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, TEST_OAUTH_PASSWORD, type TestApp } from '../helpers/build-test-app.js';
import { CREPES_SOURCE } from '../helpers/fakes.js';

const REDIRECT_URI = 'https://claude.ai/api/mcp/auth_callback';

function textOf(result: unknown): string {
  const content = (result as { content: { type: string; text: string }[] }).content;
  return content.map((item) => item.text).join('\n');
}

describe('OAuth-protected MCP endpoint', () => {
  let context: TestApp;
  let baseUrl: string;

  beforeAll(async () => {
    context = await buildTestApp({ oauth: true });
    await context.app.listen({ host: '127.0.0.1', port: 0 });
    const address = context.app.server.address();
    if (address === null || typeof address === 'string') throw new Error('no address');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await context.app.close();
    await rm(context.recipesDir, { recursive: true, force: true });
  });

  /** Drives register → authorize → token and returns a bearer access token. */
  async function obtainAccessToken(): Promise<string> {
    const registration = await fetch(`${baseUrl}/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ redirect_uris: [REDIRECT_URI], client_name: 'Claude Web' }),
    });
    expect(registration.status).toBe(201);
    const { client_id: clientId } = (await registration.json()) as { client_id: string };

    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const state = 'xyz';

    const form = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state,
      password: TEST_OAUTH_PASSWORD,
    });
    const authorize = await fetch(`${baseUrl}/authorize`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      redirect: 'manual',
    });
    expect(authorize.status).toBe(302);
    const location = new URL(authorize.headers.get('location') ?? '');
    expect(location.searchParams.get('state')).toBe(state);
    const code = location.searchParams.get('code');
    expect(code).toBeTruthy();

    const token = await fetch(`${baseUrl}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code ?? '',
        redirect_uri: REDIRECT_URI,
        client_id: clientId,
        code_verifier: verifier,
      }).toString(),
    });
    expect(token.status).toBe(200);
    const payload = (await token.json()) as { access_token: string; token_type: string };
    expect(payload.token_type).toBe('Bearer');
    return payload.access_token;
  }

  it('publishes protected-resource metadata', async () => {
    const response = await fetch(`${baseUrl}/.well-known/oauth-protected-resource`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.resource).toBe(`${baseUrl}/mcp`);
    expect(body.authorization_servers).toEqual([baseUrl]);
  });

  it('publishes authorization-server metadata', async () => {
    const response = await fetch(`${baseUrl}/.well-known/oauth-authorization-server`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.issuer).toBe(baseUrl);
    expect(body.token_endpoint).toBe(`${baseUrl}/token`);
    expect(body.registration_endpoint).toBe(`${baseUrl}/register`);
  });

  it('challenges unauthenticated MCP requests with a resource_metadata pointer', async () => {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 }),
    });
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toContain(
      'resource_metadata="' + baseUrl + '/.well-known/oauth-protected-resource"',
    );
  });

  it('renders the consent page and rejects a wrong password', async () => {
    const registration = await fetch(`${baseUrl}/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ redirect_uris: [REDIRECT_URI] }),
    });
    const { client_id: clientId } = (await registration.json()) as { client_id: string };
    const query = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      code_challenge: createHash('sha256').update('v').digest('base64url'),
      code_challenge_method: 'S256',
    });
    const page = await fetch(`${baseUrl}/authorize?${query.toString()}`);
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(await page.text()).toContain('Autoriser');

    const denied = await fetch(`${baseUrl}/authorize`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: REDIRECT_URI,
        code_challenge: createHash('sha256').update('v').digest('base64url'),
        code_challenge_method: 'S256',
        password: 'wrong',
      }).toString(),
      redirect: 'manual',
    });
    expect(denied.status).toBe(401);
  });

  it('rejects an unknown client_id at the authorization endpoint', async () => {
    const query = new URLSearchParams({
      response_type: 'code',
      client_id: 'forged',
      redirect_uri: REDIRECT_URI,
      code_challenge: 'x',
      code_challenge_method: 'S256',
    });
    const response = await fetch(`${baseUrl}/authorize?${query.toString()}`);
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toBe('invalid_request');
  });

  it('lets an authorized client read and write over MCP', async () => {
    const accessToken = await obtainAccessToken();
    const client = new Client({ name: 'oauth-test', version: '0.0.1' });
    const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
      requestInit: { headers: { authorization: `Bearer ${accessToken}` } },
    });
    await client.connect(transport);

    const created = await client.callTool({
      name: 'create_recipe',
      arguments: { source: CREPES_SOURCE },
    });
    expect(created.isError).toBeFalsy();
    expect(textOf(created)).toContain('"slug": "crepes"');

    const list = await client.callTool({ name: 'list_recipes', arguments: {} });
    expect(textOf(list)).toContain('Crêpes');
    await client.close();
  });

  it('rejects a token request that reuses an authorization code with a bad verifier', async () => {
    const registration = await fetch(`${baseUrl}/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ redirect_uris: [REDIRECT_URI] }),
    });
    const { client_id: clientId } = (await registration.json()) as { client_id: string };
    const form = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      code_challenge: createHash('sha256').update('the-verifier').digest('base64url'),
      code_challenge_method: 'S256',
      password: TEST_OAUTH_PASSWORD,
    });
    const authorize = await fetch(`${baseUrl}/authorize`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      redirect: 'manual',
    });
    const code = new URL(authorize.headers.get('location') ?? '').searchParams.get('code') ?? '';

    const token = await fetch(`${baseUrl}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id: clientId,
        code_verifier: 'not-the-verifier',
      }).toString(),
    });
    expect(token.status).toBe(400);
    expect(((await token.json()) as { error: string }).error).toBe('invalid_grant');
  });
});
