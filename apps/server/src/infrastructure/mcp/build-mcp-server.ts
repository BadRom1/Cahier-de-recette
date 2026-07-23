import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { DomainError } from '../../domain/shared/domain-error.js';
import type { UseCases } from '../../application/use-cases/use-cases.js';
import type { WriteAccess } from '../auth/write-access.js';

interface McpDependencies {
  useCases: UseCases;
  writeAccess: WriteAccess;
  /**
   * Whether the transport-level credentials (a valid OAuth access token or the
   * legacy write token in the `Authorization` header) already grant write access.
   */
  writeAuthorized: boolean;
}

interface ToolResult {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
  [key: string]: unknown;
}

function ok(payload: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

function fail(error: unknown): ToolResult {
  const message =
    error instanceof DomainError
      ? `${error.code}: ${error.message}`
      : 'Internal error while executing the tool';
  return { content: [{ type: 'text', text: message }], isError: true };
}

/**
 * Driving adapter: exposes the recipe use cases to AI agents over MCP.
 *
 * Read tools are public. Write tools require the write token, either from the
 * HTTP `Authorization: Bearer` header or from the `token` tool argument.
 */
export function buildMcpServer(deps: McpDependencies): McpServer {
  const { useCases, writeAccess, writeAuthorized } = deps;

  const server = new McpServer({
    name: 'cahier-de-recette',
    version: '0.1.0',
  });

  // The header credentials (OAuth token or legacy write token) grant write
  // access; the per-tool `token` argument remains a fallback for clients that
  // cannot set an Authorization header.
  const authorized = (explicitToken: string | undefined): boolean =>
    writeAuthorized || (explicitToken !== undefined && writeAccess.verify(explicitToken));

  const unauthorized = (): ToolResult => ({
    content: [
      {
        type: 'text',
        text: writeAccess.enabled
          ? 'UNAUTHORIZED: provide the write token (Authorization: Bearer header or "token" argument)'
          : 'WRITES_DISABLED: the server has no WRITE_TOKEN configured',
      },
    ],
    isError: true,
  });

  server.registerTool(
    'list_recipes',
    {
      title: 'List recipes',
      description: 'List all recipes in the collection with their slug, title, tags and servings.',
      inputSchema: {},
    },
    async () => {
      try {
        return ok(await useCases.listRecipes.execute());
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'search_recipes',
    {
      title: 'Search recipes',
      description: 'Search recipes by free-text query (title, ingredients, text) and/or tag.',
      inputSchema: {
        query: z.string().optional().describe('Free-text search, e.g. "chocolat"'),
        tag: z.string().optional().describe('Exact tag filter, e.g. "dessert"'),
      },
    },
    async ({ query, tag }) => {
      try {
        return ok(await useCases.searchRecipes.execute({ query, tag }));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'get_recipe',
    {
      title: 'Get a recipe',
      description:
        'Get a recipe by slug: parsed ingredients, cookware, timers, steps and the raw Cooklang source.',
      inputSchema: {
        slug: z.string().describe('Recipe slug, e.g. "crepes"'),
      },
    },
    async ({ slug }) => {
      try {
        return ok(await useCases.getRecipe.execute(slug));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'create_recipe',
    {
      title: 'Create a recipe',
      description:
        'Create a new recipe from Cooklang source. Requires the write token. ' +
        'The slug is derived from the title metadata when omitted.',
      inputSchema: {
        source: z.string().describe('Cooklang source of the recipe'),
        slug: z.string().optional().describe('Explicit slug (lowercase, digits, hyphens)'),
        token: z.string().optional().describe('Write token (alternative to the Bearer header)'),
      },
    },
    async ({ source, slug, token }) => {
      if (!authorized(token)) return unauthorized();
      try {
        return ok(await useCases.createRecipe.execute({ slug, source }));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'update_recipe',
    {
      title: 'Update a recipe',
      description: 'Replace the Cooklang source of an existing recipe. Requires the write token.',
      inputSchema: {
        slug: z.string().describe('Slug of the recipe to update'),
        source: z.string().describe('New Cooklang source'),
        token: z.string().optional().describe('Write token (alternative to the Bearer header)'),
      },
    },
    async ({ slug, source, token }) => {
      if (!authorized(token)) return unauthorized();
      try {
        return ok(await useCases.updateRecipe.execute({ slug, source }));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'delete_recipe',
    {
      title: 'Delete a recipe',
      description: 'Delete a recipe by slug. Requires the write token.',
      inputSchema: {
        slug: z.string().describe('Slug of the recipe to delete'),
        token: z.string().optional().describe('Write token (alternative to the Bearer header)'),
      },
    },
    async ({ slug, token }) => {
      if (!authorized(token)) return unauthorized();
      try {
        await useCases.deleteRecipe.execute(slug);
        return ok({ deleted: slug });
      } catch (error) {
        return fail(error);
      }
    },
  );

  // Recipes are also readable as MCP resources (cooklang source).
  server.registerResource(
    'recipe',
    new ResourceTemplate('cooklang://recipes/{slug}', {
      list: async () => {
        const recipes = await useCases.listRecipes.execute();
        return {
          resources: recipes.map((recipe) => ({
            uri: `cooklang://recipes/${recipe.slug}`,
            name: recipe.title,
            mimeType: 'text/plain',
          })),
        };
      },
    }),
    {
      title: 'Cooklang recipe',
      description: 'Raw Cooklang source of a recipe',
      mimeType: 'text/plain',
    },
    async (uri, variables) => {
      const recipe = await useCases.getRecipe.execute(String(variables.slug));
      return {
        contents: [{ uri: uri.href, mimeType: 'text/plain', text: recipe.source }],
      };
    },
  );

  return server;
}
