import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { resolveBaseUrl } from '../http/base-url.js';
import { renderAuthorizePage } from './authorize-page.js';
import { type ClientMetadata, OAuthError, OAuthService } from './oauth-service.js';

interface OAuthRoutesOptions {
  oauthService: OAuthService;
  publicUrl: string | null;
}

interface AuthorizeQuery {
  response_type?: string;
  client_id?: string;
  redirect_uri?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  scope?: string;
  state?: string;
  resource?: string;
}

interface AuthorizeBody extends AuthorizeQuery {
  password?: string;
}

interface TokenBody {
  grant_type?: string;
  code?: string;
  redirect_uri?: string;
  client_id?: string;
  code_verifier?: string;
  refresh_token?: string;
}

/** Fields carried through the consent form so POST /authorize can re-validate. */
const AUTHORIZE_PASSTHROUGH = [
  'response_type',
  'client_id',
  'redirect_uri',
  'code_challenge',
  'code_challenge_method',
  'scope',
  'state',
  'resource',
] as const;

function sendOAuthError(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof OAuthError) {
    return reply
      .code(error.status)
      .header('cache-control', 'no-store')
      .send({ error: error.error, error_description: error.description });
  }
  return reply
    .code(500)
    .header('cache-control', 'no-store')
    .send({ error: 'server_error', error_description: 'Internal server error' });
}

/**
 * Registers the OAuth 2.1 authorization-server and protected-resource-metadata
 * endpoints. Everything lives in a scoped plugin so the form-urlencoded body
 * parser (needed by the token and consent endpoints) does not leak globally.
 */
export function registerOAuthRoutes(
  app: FastifyInstance,
  { oauthService, publicUrl }: OAuthRoutesOptions,
): void {
  void app.register(async (scope) => {
    scope.addContentTypeParser(
      'application/x-www-form-urlencoded',
      { parseAs: 'string' },
      (_request, body, done) => {
        try {
          done(null, Object.fromEntries(new URLSearchParams(body as string)));
        } catch (error) {
          done(error as Error, undefined);
        }
      },
    );

    // --- Discovery (RFC 8414 & RFC 9728) -----------------------------------
    const authServerMetadata = async (
      request: FastifyRequest,
      reply: FastifyReply,
    ): Promise<unknown> => {
      const issuer = resolveBaseUrl(request, publicUrl);
      return reply.send(oauthService.authorizationServerMetadata(issuer));
    };
    scope.get('/.well-known/oauth-authorization-server', authServerMetadata);
    scope.get('/.well-known/oauth-authorization-server/mcp', authServerMetadata);

    const protectedResourceMetadata = async (
      request: FastifyRequest,
      reply: FastifyReply,
    ): Promise<unknown> => {
      const issuer = resolveBaseUrl(request, publicUrl);
      return reply.send(oauthService.protectedResourceMetadata(issuer, `${issuer}/mcp`));
    };
    scope.get('/.well-known/oauth-protected-resource', protectedResourceMetadata);
    scope.get('/.well-known/oauth-protected-resource/mcp', protectedResourceMetadata);

    // --- Dynamic Client Registration (RFC 7591) ----------------------------
    scope.post('/register', async (request, reply) => {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const metadata: ClientMetadata = {
        redirectUris: Array.isArray(body.redirect_uris) ? (body.redirect_uris as string[]) : [],
        clientName: typeof body.client_name === 'string' ? body.client_name : undefined,
        scope: typeof body.scope === 'string' ? body.scope : undefined,
      };
      try {
        const registration = oauthService.registerClient(metadata);
        return reply
          .code(201)
          .header('cache-control', 'no-store')
          .send({
            client_id: registration.clientId,
            client_id_issued_at: registration.clientIdIssuedAt,
            redirect_uris: registration.redirectUris,
            client_name: registration.clientName,
            grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code'],
            token_endpoint_auth_method: 'none',
            scope: registration.scope,
          });
      } catch (error) {
        return sendOAuthError(reply, error);
      }
    });

    // --- Authorization endpoint --------------------------------------------
    scope.get<{ Querystring: AuthorizeQuery }>('/authorize', async (request, reply) => {
      const query = request.query;
      try {
        validateResponseType(query.response_type);
        oauthService.validateAuthorizationRequest(toAuthorizationRequest(query));
      } catch (error) {
        return sendOAuthError(reply, error);
      }
      const client = oauthService.verifyClient(query.client_id ?? '');
      return reply.header('content-type', 'text/html; charset=utf-8').send(
        renderAuthorizePage({
          hiddenFields: passthroughFields(query),
          serverName: oauthService.serverName,
          clientName: client?.clientName,
        }),
      );
    });

    scope.post<{ Body: AuthorizeBody }>('/authorize', async (request, reply) => {
      const body = request.body;
      let authRequest;
      try {
        validateResponseType(body.response_type);
        authRequest = toAuthorizationRequest(body);
        oauthService.validateAuthorizationRequest(authRequest);
      } catch (error) {
        return sendOAuthError(reply, error);
      }

      if (typeof body.password !== 'string' || !oauthService.verifyPassword(body.password)) {
        const client = oauthService.verifyClient(authRequest.clientId);
        return reply
          .code(401)
          .header('content-type', 'text/html; charset=utf-8')
          .send(
            renderAuthorizePage({
              hiddenFields: passthroughFields(body),
              serverName: oauthService.serverName,
              clientName: client?.clientName,
              error: 'Mot de passe incorrect.',
            }),
          );
      }

      const code = oauthService.issueAuthorizationCode(authRequest);
      const location = new URL(authRequest.redirectUri);
      location.searchParams.set('code', code);
      if (typeof body.state === 'string' && body.state !== '') {
        location.searchParams.set('state', body.state);
      }
      return reply.redirect(location.toString(), 302);
    });

    // --- Token endpoint ----------------------------------------------------
    scope.post<{ Body: TokenBody }>('/token', async (request, reply) => {
      const body = (request.body ?? {}) as TokenBody;
      try {
        const response = exchange(oauthService, body);
        return reply.header('cache-control', 'no-store').send(response);
      } catch (error) {
        return sendOAuthError(reply, error);
      }
    });
  });
}

function exchange(service: OAuthService, body: TokenBody): unknown {
  if (body.grant_type === 'authorization_code') {
    if (typeof body.code !== 'string') {
      throw new OAuthError('invalid_request', 'code is required');
    }
    if (typeof body.redirect_uri !== 'string') {
      throw new OAuthError('invalid_request', 'redirect_uri is required');
    }
    if (typeof body.client_id !== 'string') {
      throw new OAuthError('invalid_request', 'client_id is required');
    }
    if (typeof body.code_verifier !== 'string') {
      throw new OAuthError('invalid_request', 'code_verifier is required (PKCE)');
    }
    return service.exchangeAuthorizationCode({
      code: body.code,
      redirectUri: body.redirect_uri,
      clientId: body.client_id,
      codeVerifier: body.code_verifier,
    });
  }
  if (body.grant_type === 'refresh_token') {
    if (typeof body.refresh_token !== 'string') {
      throw new OAuthError('invalid_request', 'refresh_token is required');
    }
    if (typeof body.client_id !== 'string') {
      throw new OAuthError('invalid_request', 'client_id is required');
    }
    return service.refresh({ refreshToken: body.refresh_token, clientId: body.client_id });
  }
  throw new OAuthError(
    'unsupported_grant_type',
    `Unsupported grant_type: ${String(body.grant_type)}`,
  );
}

function validateResponseType(responseType: string | undefined): void {
  if (responseType !== 'code') {
    throw new OAuthError('unsupported_response_type', 'response_type must be "code"');
  }
}

function toAuthorizationRequest(query: AuthorizeQuery): {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope?: string;
} {
  return {
    clientId: query.client_id ?? '',
    redirectUri: query.redirect_uri ?? '',
    codeChallenge: query.code_challenge ?? '',
    codeChallengeMethod: query.code_challenge_method ?? '',
    scope: query.scope,
  };
}

function passthroughFields(source: AuthorizeQuery): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const key of AUTHORIZE_PASSTHROUGH) {
    const value = source[key];
    if (typeof value === 'string' && value !== '') {
      fields[key] = value;
    }
  }
  return fields;
}
