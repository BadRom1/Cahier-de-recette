import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import fastifyCors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import type { UseCases } from '../../application/use-cases/use-cases.js';
import type { WriteAccess } from '../auth/write-access.js';
import { errorBodyOf, httpStatusOf } from './error-mapping.js';
import { registerRecipeRoutes } from './recipe-routes.js';
import { registerMcpRoutes } from '../mcp/mcp-routes.js';

export interface BuildAppOptions {
  useCases: UseCases;
  writeAccess: WriteAccess;
  webDistDir?: string | null;
  loggerInstance?: FastifyBaseLogger;
}

/** Assembles the Fastify application: REST API, raw .cook files, MCP endpoint, web app. */
export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    ...(options.loggerInstance === undefined
      ? { logger: false as const }
      : { loggerInstance: options.loggerInstance }),
    trustProxy: true,
  });

  await app.register(fastifyCors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['content-type', 'authorization', 'mcp-session-id', 'mcp-protocol-version'],
  });

  app.setErrorHandler((error: unknown, request, reply) => {
    const status = httpStatusOf(error);
    // Fastify validation errors carry their own status code.
    const fastifyStatus =
      error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number'
        ? error.statusCode
        : null;
    if (status === 500 && fastifyStatus !== null && fastifyStatus < 500) {
      return reply
        .code(fastifyStatus)
        .send({ code: 'BAD_REQUEST', message: (error as Error).message });
    }
    if (status >= 500) {
      request.log.error({ err: error }, 'unhandled error');
    }
    return reply.code(status).send(errorBodyOf(error));
  });

  registerRecipeRoutes(app, { useCases: options.useCases, writeAccess: options.writeAccess });
  registerMcpRoutes(app, { useCases: options.useCases, writeAccess: options.writeAccess });

  const webDistDir =
    options.webDistDir === undefined || options.webDistDir === null
      ? null
      : resolve(options.webDistDir);
  if (webDistDir !== null && existsSync(webDistDir)) {
    await app.register(fastifyStatic, { root: webDistDir, wildcard: true });
    // SPA fallback: unknown non-API routes serve the web app entry point.
    app.setNotFoundHandler(async (request, reply) => {
      if (
        request.method === 'GET' &&
        !request.url.startsWith('/api/') &&
        !request.url.startsWith('/recipes/') &&
        !request.url.startsWith('/mcp')
      ) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ code: 'NOT_FOUND', message: 'Resource not found' });
    });
  }

  return app;
}
