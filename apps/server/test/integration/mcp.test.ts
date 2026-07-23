import { rm } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, TEST_WRITE_TOKEN, type TestApp } from '../helpers/build-test-app.js';
import { CREPES_SOURCE } from '../helpers/fakes.js';

function textOf(result: unknown): string {
  const content = (result as { content: { type: string; text: string }[] }).content;
  return content.map((item) => item.text).join('\n');
}

describe('MCP endpoint', () => {
  let context: TestApp;
  let baseUrl: string;

  beforeAll(async () => {
    context = await buildTestApp();
    await context.app.listen({ host: '127.0.0.1', port: 0 });
    const address = context.app.server.address();
    if (address === null || typeof address === 'string') throw new Error('no address');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await context.app.close();
    await rm(context.recipesDir, { recursive: true, force: true });
  });

  async function connect(headers?: Record<string, string>): Promise<Client> {
    const client = new Client({ name: 'test-client', version: '0.0.1' });
    const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
      requestInit: headers === undefined ? {} : { headers },
    });
    await client.connect(transport);
    return client;
  }

  it('lists the recipe tools', async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name).toSorted();
    expect(names).toEqual([
      'create_recipe',
      'delete_recipe',
      'get_recipe',
      'list_recipes',
      'search_recipes',
      'update_recipe',
    ]);
    await client.close();
  });

  it('refuses an unauthenticated create_recipe call', async () => {
    const client = await connect();
    const result = await client.callTool({
      name: 'create_recipe',
      arguments: { source: CREPES_SOURCE },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('UNAUTHORIZED');
    await client.close();
  });

  it('creates a recipe with the token argument', async () => {
    const client = await connect();
    const result = await client.callTool({
      name: 'create_recipe',
      arguments: { source: CREPES_SOURCE, token: TEST_WRITE_TOKEN },
    });
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain('"slug": "crepes"');
    await client.close();
  });

  it('reads recipes publicly through tools', async () => {
    const client = await connect();
    const list = await client.callTool({ name: 'list_recipes', arguments: {} });
    expect(textOf(list)).toContain('Crêpes');

    const detail = await client.callTool({ name: 'get_recipe', arguments: { slug: 'crepes' } });
    expect(textOf(detail)).toContain('@farine{250%g}');

    const search = await client.callTool({
      name: 'search_recipes',
      arguments: { query: 'farine' },
    });
    expect(textOf(search)).toContain('crepes');
    await client.close();
  });

  it('authorizes writes through the Authorization header', async () => {
    const client = await connect({ authorization: `Bearer ${TEST_WRITE_TOKEN}` });
    const updated = CREPES_SOURCE.replace('250%g', '400%g');
    const result = await client.callTool({
      name: 'update_recipe',
      arguments: { slug: 'crepes', source: updated },
    });
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain('400');
    await client.close();
  });

  it('reports domain errors as tool errors', async () => {
    const client = await connect();
    const result = await client.callTool({ name: 'get_recipe', arguments: { slug: 'absent' } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('RECIPE_NOT_FOUND');
    await client.close();
  });

  it('exposes recipes as MCP resources', async () => {
    const client = await connect();
    const { resources } = await client.listResources();
    expect(resources.some((resource) => resource.uri === 'cooklang://recipes/crepes')).toBe(true);

    const read = await client.readResource({ uri: 'cooklang://recipes/crepes' });
    const contents = read.contents as { text?: string }[];
    expect(contents[0]?.text).toContain('@farine');
    await client.close();
  });

  it('deletes a recipe with the token argument', async () => {
    const client = await connect();
    const result = await client.callTool({
      name: 'delete_recipe',
      arguments: { slug: 'crepes', token: TEST_WRITE_TOKEN },
    });
    expect(result.isError).toBeFalsy();
    const list = await client.callTool({ name: 'list_recipes', arguments: {} });
    expect(textOf(list)).not.toContain('crepes');
    await client.close();
  });
});
