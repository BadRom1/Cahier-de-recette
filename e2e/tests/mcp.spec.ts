import { expect, test, type APIRequestContext } from '@playwright/test';
import { E2E_WRITE_TOKEN } from '../playwright.config.js';

const MCP_HEADERS = {
  'content-type': 'application/json',
  accept: 'application/json, text/event-stream',
};

async function mcpCall(
  request: APIRequestContext,
  method: string,
  params: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<{ result?: { content?: { text: string }[]; tools?: { name: string }[] } }> {
  const response = await request.post('/mcp', {
    headers: { ...MCP_HEADERS, ...extraHeaders },
    data: { jsonrpc: '2.0', id: 1, method, params },
  });
  expect(response.status()).toBe(200);
  return response.json();
}

test.describe('Endpoint MCP', () => {
  test('initialize répond avec les capacités du serveur', async ({ request }) => {
    const body = (await mcpCall(request, 'initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'e2e', version: '0' },
    })) as { result: { serverInfo: { name: string } } };
    expect(body.result.serverInfo.name).toBe('cahier-de-recette');
  });

  test('tools/list expose les outils de recettes', async ({ request }) => {
    const body = await mcpCall(request, 'tools/list', {});
    const names = (body.result?.tools ?? []).map((tool) => tool.name);
    expect(names).toContain('list_recipes');
    expect(names).toContain('create_recipe');
  });

  test('list_recipes fonctionne sans authentification', async ({ request }) => {
    const body = await mcpCall(request, 'tools/call', {
      name: 'list_recipes',
      arguments: {},
    });
    expect(body.result?.content?.[0]?.text).toContain('crepes');
  });

  test('create_recipe exige le jeton, puis fonctionne avec', async ({ request }) => {
    const source = '>> title: Soupe MCP\n\nMixer les @légumes{500%g}.';
    const refused = (await mcpCall(request, 'tools/call', {
      name: 'create_recipe',
      arguments: { source },
    })) as { result: { isError?: boolean; content: { text: string }[] } };
    expect(refused.result.isError).toBe(true);

    const accepted = (await mcpCall(
      request,
      'tools/call',
      { name: 'create_recipe', arguments: { source } },
      { authorization: `Bearer ${E2E_WRITE_TOKEN}` },
    )) as { result: { isError?: boolean; content: { text: string }[] } };
    expect(accepted.result.isError).toBeFalsy();
    expect(accepted.result.content[0]?.text).toContain('soupe-mcp');

    await mcpCall(
      request,
      'tools/call',
      { name: 'delete_recipe', arguments: { slug: 'soupe-mcp' } },
      { authorization: `Bearer ${E2E_WRITE_TOKEN}` },
    );
  });
});
