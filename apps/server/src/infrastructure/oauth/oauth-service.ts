import { createHash, timingSafeEqual } from 'node:crypto';
import type { Clock } from '../../application/ports/clock.js';
import { TokenSigner } from './token-signer.js';

/** Scope granted to every successful authorization (single-owner server). */
export const GRANTED_SCOPES = ['recipes:read', 'recipes:write'] as const;

const AUTHORIZATION_CODE_TTL_SECONDS = 5 * 60;
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface OAuthServiceOptions {
  signer: TokenSigner;
  clock: Clock;
  /** Password the resource owner types on the consent screen to authorize. */
  password: string;
  /** Display name shown on the consent screen. */
  serverName: string;
}

export interface ClientMetadata {
  redirectUris: string[];
  clientName?: string;
  scope?: string;
}

export interface ClientRegistration {
  clientId: string;
  clientIdIssuedAt: number;
  redirectUris: string[];
  clientName?: string;
  scope: string;
}

export interface AuthorizationRequest {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope?: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
  scope: string;
}

export interface AccessTokenClaims {
  subject: string;
  scopes: string[];
}

/** OAuth 2.1 error shaped for a JSON error response. */
export class OAuthError extends Error {
  constructor(
    readonly error: string,
    readonly description: string,
    readonly status = 400,
  ) {
    super(`${error}: ${description}`);
    this.name = 'OAuthError';
  }
}

/**
 * A minimal, stateless OAuth 2.1 authorization server tailored for connecting
 * the MCP endpoint to remote clients such as Claude Web.
 *
 * It supports Dynamic Client Registration (RFC 7591), the authorization-code
 * grant with mandatory PKCE (RFC 7636, S256 only) and refresh tokens. The
 * single resource owner authenticates on the consent screen with a shared
 * password; a successful authorization grants read + write access.
 */
export class OAuthService {
  private readonly signer: TokenSigner;
  private readonly clock: Clock;
  private readonly password: Buffer;
  readonly serverName: string;

  constructor(options: OAuthServiceOptions) {
    this.signer = options.signer;
    this.clock = options.clock;
    this.password = Buffer.from(options.password, 'utf8');
    this.serverName = options.serverName;
  }

  private nowSeconds(): number {
    return Math.floor(this.clock.now().getTime() / 1000);
  }

  // --- Discovery documents -------------------------------------------------

  authorizationServerMetadata(issuer: string): Record<string, unknown> {
    return {
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      registration_endpoint: `${issuer}/register`,
      scopes_supported: [...GRANTED_SCOPES],
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
    };
  }

  protectedResourceMetadata(issuer: string, resource: string): Record<string, unknown> {
    return {
      resource,
      authorization_servers: [issuer],
      scopes_supported: [...GRANTED_SCOPES],
      bearer_methods_supported: ['header'],
    };
  }

  // --- Dynamic Client Registration ----------------------------------------

  registerClient(metadata: ClientMetadata): ClientRegistration {
    const redirectUris = metadata.redirectUris;
    if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
      throw new OAuthError('invalid_client_metadata', 'redirect_uris is required');
    }
    for (const uri of redirectUris) {
      if (typeof uri !== 'string' || !isValidRedirectUri(uri)) {
        throw new OAuthError('invalid_redirect_uri', `Invalid redirect_uri: ${String(uri)}`);
      }
    }

    const issuedAt = this.nowSeconds();
    const scope = GRANTED_SCOPES.join(' ');
    const clientId = this.signer.sign({
      typ: 'client',
      redirect_uris: redirectUris,
      client_name: metadata.clientName,
      iat: issuedAt,
    });

    return {
      clientId,
      clientIdIssuedAt: issuedAt,
      redirectUris,
      clientName: metadata.clientName,
      scope,
    };
  }

  /** Decodes and validates a client identifier, returning its allowed redirect URIs. */
  verifyClient(clientId: string): { redirectUris: string[]; clientName?: string } | null {
    const payload = this.signer.verify(clientId);
    if (payload === null || payload.typ !== 'client' || !Array.isArray(payload.redirect_uris)) {
      return null;
    }
    return {
      redirectUris: payload.redirect_uris as string[],
      clientName: typeof payload.client_name === 'string' ? payload.client_name : undefined,
    };
  }

  // --- Authorization endpoint ----------------------------------------------

  /** Validates an authorization request, throwing an {@link OAuthError} when invalid. */
  validateAuthorizationRequest(request: AuthorizationRequest): { redirectUris: string[] } {
    const client = this.verifyClient(request.clientId);
    if (client === null) {
      throw new OAuthError('invalid_request', 'Unknown or invalid client_id');
    }
    if (!client.redirectUris.includes(request.redirectUri)) {
      throw new OAuthError('invalid_request', 'redirect_uri does not match the registered client');
    }
    if (request.codeChallengeMethod !== 'S256') {
      throw new OAuthError('invalid_request', 'code_challenge_method must be S256');
    }
    if (typeof request.codeChallenge !== 'string' || request.codeChallenge.length === 0) {
      throw new OAuthError('invalid_request', 'code_challenge is required (PKCE)');
    }
    return { redirectUris: client.redirectUris };
  }

  verifyPassword(presented: string): boolean {
    const actual = Buffer.from(presented, 'utf8');
    if (actual.length !== this.password.length) {
      return false;
    }
    return timingSafeEqual(actual, this.password);
  }

  /** Issues a short-lived authorization code bound to the request (call after the owner authenticates). */
  issueAuthorizationCode(request: AuthorizationRequest): string {
    const now = this.nowSeconds();
    return this.signer.sign({
      typ: 'code',
      client_id: request.clientId,
      redirect_uri: request.redirectUri,
      code_challenge: request.codeChallenge,
      scope: GRANTED_SCOPES.join(' '),
      iat: now,
      exp: now + AUTHORIZATION_CODE_TTL_SECONDS,
    });
  }

  // --- Token endpoint ------------------------------------------------------

  exchangeAuthorizationCode(params: {
    code: string;
    clientId: string;
    redirectUri: string;
    codeVerifier: string;
  }): TokenResponse {
    const payload = this.decodeValid(params.code, 'code');
    if (payload === null) {
      throw new OAuthError('invalid_grant', 'The authorization code is invalid or expired');
    }
    if (payload.client_id !== params.clientId) {
      throw new OAuthError('invalid_grant', 'client_id does not match the authorization code');
    }
    if (payload.redirect_uri !== params.redirectUri) {
      throw new OAuthError('invalid_grant', 'redirect_uri does not match the authorization code');
    }
    if (!verifyPkce(params.codeVerifier, String(payload.code_challenge))) {
      throw new OAuthError('invalid_grant', 'PKCE verification failed');
    }
    return this.issueTokens(params.clientId, String(payload.scope));
  }

  refresh(params: { refreshToken: string; clientId: string }): TokenResponse {
    const payload = this.decodeValid(params.refreshToken, 'refresh');
    if (payload === null) {
      throw new OAuthError('invalid_grant', 'The refresh token is invalid or expired');
    }
    if (payload.client_id !== params.clientId) {
      throw new OAuthError('invalid_grant', 'client_id does not match the refresh token');
    }
    return this.issueTokens(params.clientId, String(payload.scope));
  }

  /** Verifies a bearer access token, returning its claims when valid. */
  verifyAccessToken(token: string): AccessTokenClaims | null {
    const payload = this.decodeValid(token, 'access');
    if (payload === null) {
      return null;
    }
    return {
      subject: String(payload.sub ?? 'owner'),
      scopes: String(payload.scope ?? '')
        .split(' ')
        .filter(Boolean),
    };
  }

  private issueTokens(clientId: string, scope: string): TokenResponse {
    const now = this.nowSeconds();
    const accessToken = this.signer.sign({
      typ: 'access',
      sub: 'owner',
      client_id: clientId,
      scope,
      iat: now,
      exp: now + ACCESS_TOKEN_TTL_SECONDS,
    });
    const refreshToken = this.signer.sign({
      typ: 'refresh',
      sub: 'owner',
      client_id: clientId,
      scope,
      iat: now,
      exp: now + REFRESH_TOKEN_TTL_SECONDS,
    });
    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: refreshToken,
      scope,
    };
  }

  /** Verifies signature, type and expiry of a token, returning its payload when valid. */
  private decodeValid(token: string, expectedType: string): Record<string, unknown> | null {
    const payload = this.signer.verify(token);
    if (payload === null || payload.typ !== expectedType) {
      return null;
    }
    if (typeof payload.exp === 'number' && payload.exp < this.nowSeconds()) {
      return null;
    }
    return payload;
  }
}

/** Verifies a PKCE S256 challenge: base64url(sha256(verifier)) === challenge. */
function verifyPkce(codeVerifier: string, codeChallenge: string): boolean {
  if (typeof codeVerifier !== 'string' || codeVerifier.length === 0) {
    return false;
  }
  const computed = createHash('sha256').update(codeVerifier).digest('base64url');
  const a = Buffer.from(computed);
  const b = Buffer.from(codeChallenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

function isValidRedirectUri(uri: string): boolean {
  try {
    const parsed = new URL(uri);
    // Allow https everywhere, and http/custom schemes only for loopback / native clients.
    if (parsed.protocol === 'https:') return true;
    if (parsed.protocol === 'http:') {
      return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    }
    // Native app custom schemes (e.g. "myapp://callback") are allowed.
    return parsed.protocol.endsWith(':') && parsed.protocol !== 'http:';
  } catch {
    return false;
  }
}
