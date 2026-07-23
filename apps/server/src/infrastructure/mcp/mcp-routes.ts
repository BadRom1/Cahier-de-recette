import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { FastifyInstance } from 'fastify';
import type { UseCases } from '../../application/use-cases/use-cases.js';
import { WriteAccess } from '../auth/write-access.js';
import { buildMcpServer } from './build-mcp-server.js';

interface McpRoutesOptions {
  useCases: UseCases;
  writeAccess: WriteAccess;
}

/**
 * Exposes the MCP server over Streamable HTTP at `/mcp`, in stateless mode:
 * a fresh server/transport pair per request, no session tracking. This keeps
 * the endpoint horizontally scalable and restart-safe.
 */
export function registerMcpRoutes(
  app: FastifyInstance,
  { useCases, writeAccess }: McpRoutesOptions,
): void {
  // Scoped plugin: leave the request stream untouched so the MCP transport
  // (which converts it to a Web Standard Request) can consume it itself.
  void app.register(async (scope) => {
    scope.removeAllContentTypeParsers();
    scope.addContentTypeParser('*', (_request, _payload, done) => {
      done(null, undefined);
    });

    scope.post('/mcp', async (request, reply) => {
      const presentedToken = WriteAccess.tokenFromAuthorizationHeader(
        request.headers.authorization,
      );
      const server = buildMcpServer({ useCases, writeAccess, presentedToken });
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });

      reply.hijack();
      reply.raw.on('close', () => {
        void transport.close();
        void server.close();
      });

      try {
        await server.connect(transport);
        await transport.handleRequest(request.raw, reply.raw);
      } catch (error) {
        request.log.error({ err: error }, 'MCP request failed');
        if (!reply.raw.headersSent) {
          reply.raw.writeHead(500, { 'content-type': 'application/json' });
          reply.raw.end(
            JSON.stringify({
              jsonrpc: '2.0',
              error: { code: -32603, message: 'Internal server error' },
              id: null,
            }),
          );
        }
      }
    });
  });

  // Stateless mode: no SSE stream to resume, no session to delete.
  const methodNotAllowed = {
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed in stateless mode' },
    id: null,
  };
  app.get('/mcp', async (_request, reply) => reply.code(405).send(methodNotAllowed));
  app.delete('/mcp', async (_request, reply) => reply.code(405).send(methodNotAllowed));
}
