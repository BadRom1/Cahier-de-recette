import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { FastifyInstance } from 'fastify';
import type { UseCases } from '../../application/use-cases/use-cases.js';
import { WriteAccess } from '../auth/write-access.js';
import { resolveBaseUrl } from '../http/base-url.js';
import type { OAuthService } from '../oauth/oauth-service.js';
import { buildMcpServer } from './build-mcp-server.js';

interface McpRoutesOptions {
  useCases: UseCases;
  writeAccess: WriteAccess;
  /** When set, the MCP endpoint becomes an OAuth-protected resource. */
  oauthService: OAuthService | null;
  publicUrl: string | null;
}

/**
 * Exposes the MCP server over Streamable HTTP at `/mcp`, in stateless mode:
 * a fresh server/transport pair per request, no session tracking. This keeps
 * the endpoint horizontally scalable and restart-safe.
 *
 * When OAuth is enabled the endpoint is a protected resource: requests must
 * carry a valid OAuth access token (or the legacy write token), otherwise they
 * receive a `401` with a `WWW-Authenticate` challenge pointing at the
 * protected-resource metadata — this is what lets Claude Web start the
 * authorization flow. When OAuth is disabled the endpoint stays public for
 * reads, with writes still gated by the write token.
 */
export function registerMcpRoutes(
  app: FastifyInstance,
  { useCases, writeAccess, oauthService, publicUrl }: McpRoutesOptions,
): void {
  // Scoped plugin: leave the request stream untouched so the MCP transport
  // (which converts it to a Web Standard Request) can consume it itself.
  void app.register(async (scope) => {
    scope.removeAllContentTypeParsers();
    scope.addContentTypeParser('*', (_request, _payload, done) => {
      done(null, undefined);
    });

    scope.post('/mcp', async (request, reply) => {
      const bearer = WriteAccess.tokenFromAuthorizationHeader(request.headers.authorization);

      let writeAuthorized = false;
      if (bearer !== null) {
        if (writeAccess.verify(bearer)) {
          writeAuthorized = true;
        } else if (oauthService !== null) {
          const claims = oauthService.verifyAccessToken(bearer);
          writeAuthorized = claims !== null && claims.scopes.includes('recipes:write');
        }
      }

      // OAuth on + no valid credentials → challenge so the client can authorize.
      if (oauthService !== null && !writeAuthorized) {
        const resourceMetadata = `${resolveBaseUrl(request, publicUrl)}/.well-known/oauth-protected-resource`;
        return reply
          .code(401)
          .header('www-authenticate', `Bearer resource_metadata="${resourceMetadata}"`)
          .send({ error: 'unauthorized', error_description: 'A valid access token is required' });
      }

      const server = buildMcpServer({ useCases, writeAccess, writeAuthorized });
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
