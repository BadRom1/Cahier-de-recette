import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { UseCases } from '../../application/use-cases/use-cases.js';
import { WriteAccess } from '../auth/write-access.js';

interface RecipeRoutesOptions {
  useCases: UseCases;
  writeAccess: WriteAccess;
}

interface SlugParams {
  slug: string;
}

interface WriteBody {
  slug?: string;
  source: string;
}

function requireWriteAccess(writeAccess: WriteAccess) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!writeAccess.enabled) {
      await reply.code(503).send({
        code: 'WRITES_DISABLED',
        message: 'Write operations are disabled: no WRITE_TOKEN configured',
      });
      return;
    }
    const token = WriteAccess.tokenFromAuthorizationHeader(request.headers.authorization);
    if (!writeAccess.verify(token)) {
      await reply
        .code(401)
        .header('www-authenticate', 'Bearer')
        .send({ code: 'UNAUTHORIZED', message: 'A valid write token is required' });
    }
  };
}

const writeBodySchema = {
  type: 'object',
  required: ['source'],
  properties: {
    slug: { type: 'string' },
    source: { type: 'string' },
  },
} as const;

export function registerRecipeRoutes(
  app: FastifyInstance,
  { useCases, writeAccess }: RecipeRoutesOptions,
): void {
  const writeGuard = requireWriteAccess(writeAccess);

  app.get('/api/health', async () => ({ status: 'ok' }));

  app.get('/api/recipes', async (request) => {
    const { q, tag } = request.query as { q?: string; tag?: string };
    if (q !== undefined || tag !== undefined) {
      return useCases.searchRecipes.execute({ query: q, tag });
    }
    return useCases.listRecipes.execute();
  });

  app.get<{ Params: SlugParams }>('/api/recipes/:slug', async (request) => {
    return useCases.getRecipe.execute(request.params.slug);
  });

  app.post<{ Body: WriteBody }>(
    '/api/recipes',
    { preHandler: writeGuard, schema: { body: writeBodySchema } },
    async (request, reply) => {
      const created = await useCases.createRecipe.execute(request.body);
      return reply.code(201).header('location', `/api/recipes/${created.slug}`).send(created);
    },
  );

  app.put<{ Params: SlugParams; Body: WriteBody }>(
    '/api/recipes/:slug',
    { preHandler: writeGuard, schema: { body: writeBodySchema } },
    async (request) => {
      return useCases.updateRecipe.execute({
        slug: request.params.slug,
        source: request.body.source,
      });
    },
  );

  app.delete<{ Params: SlugParams }>(
    '/api/recipes/:slug',
    { preHandler: writeGuard },
    async (request, reply) => {
      await useCases.deleteRecipe.execute(request.params.slug);
      return reply.code(204).send();
    },
  );

  // Raw Cooklang files — this is what the Cooklang mobile apps consume.
  app.get<{ Params: SlugParams }>('/recipes/:slug.cook', async (request, reply) => {
    const recipe = await useCases.getRecipe.execute(request.params.slug);
    return reply
      .header('content-type', 'text/plain; charset=utf-8')
      .header('content-disposition', `inline; filename="${recipe.slug}.cook"`)
      .send(recipe.source);
  });

  // Plain-text index of the collection: one raw-file URL per line.
  app.get('/recipes/index.txt', async (request, reply) => {
    const recipes = await useCases.listRecipes.execute();
    const base = `${request.protocol}://${request.host}`;
    const lines = recipes.map((recipe) => `${base}/recipes/${recipe.slug}.cook`);
    return reply.header('content-type', 'text/plain; charset=utf-8').send(lines.join('\n'));
  });
}
