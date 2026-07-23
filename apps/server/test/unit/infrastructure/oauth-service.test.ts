import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { OAuthError, OAuthService } from '../../../src/infrastructure/oauth/oauth-service.js';
import { TokenSigner } from '../../../src/infrastructure/oauth/token-signer.js';
import { FixedClock } from '../../helpers/fakes.js';

function pkce(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

function makeService(clock = new FixedClock()): OAuthService {
  return new OAuthService({
    signer: new TokenSigner('unit-secret'),
    clock,
    password: 's3cret',
    serverName: 'Test',
  });
}

const REDIRECT_URI = 'https://claude.ai/api/mcp/auth_callback';

function register(service: OAuthService): string {
  return service.registerClient({ redirectUris: [REDIRECT_URI], clientName: 'Claude' }).clientId;
}

describe('TokenSigner', () => {
  it('round-trips a payload and rejects tampering', () => {
    const signer = new TokenSigner('s');
    const token = signer.sign({ hello: 'world', n: 42 });
    expect(signer.verify(token)).toEqual({ hello: 'world', n: 42 });

    const [body] = token.split('.');
    expect(signer.verify(`${body}.deadbeef`)).toBeNull();
    expect(new TokenSigner('other').verify(token)).toBeNull();
    expect(signer.verify('not-a-token')).toBeNull();
  });
});

describe('OAuthService', () => {
  it('exposes discovery documents pointing at the issuer', () => {
    const meta = makeService().authorizationServerMetadata('https://host');
    expect(meta.issuer).toBe('https://host');
    expect(meta.authorization_endpoint).toBe('https://host/authorize');
    expect(meta.token_endpoint).toBe('https://host/token');
    expect(meta.registration_endpoint).toBe('https://host/register');
    expect(meta.code_challenge_methods_supported).toEqual(['S256']);

    const resource = makeService().protectedResourceMetadata('https://host', 'https://host/mcp');
    expect(resource.resource).toBe('https://host/mcp');
    expect(resource.authorization_servers).toEqual(['https://host']);
  });

  it('registers a client and verifies its redirect URIs', () => {
    const service = makeService();
    const clientId = register(service);
    expect(service.verifyClient(clientId)?.redirectUris).toEqual([REDIRECT_URI]);
    expect(service.verifyClient('forged')).toBeNull();
  });

  it('rejects registration without a valid redirect URI', () => {
    const service = makeService();
    expect(() => service.registerClient({ redirectUris: [] })).toThrow(OAuthError);
    expect(() => service.registerClient({ redirectUris: ['http://evil.example'] })).toThrow(
      OAuthError,
    );
  });

  it('validates authorization requests', () => {
    const service = makeService();
    const clientId = register(service);
    const base = {
      clientId,
      redirectUri: REDIRECT_URI,
      codeChallenge: pkce('verifier'),
      codeChallengeMethod: 'S256',
    };
    expect(() => service.validateAuthorizationRequest(base)).not.toThrow();
    expect(() =>
      service.validateAuthorizationRequest({ ...base, redirectUri: 'https://evil.example' }),
    ).toThrow(OAuthError);
    expect(() =>
      service.validateAuthorizationRequest({ ...base, codeChallengeMethod: 'plain' }),
    ).toThrow(OAuthError);
  });

  it('verifies the consent password in constant time', () => {
    const service = makeService();
    expect(service.verifyPassword('s3cret')).toBe(true);
    expect(service.verifyPassword('wrong')).toBe(false);
    expect(service.verifyPassword('')).toBe(false);
  });

  it('completes the authorization-code + PKCE flow and issues usable tokens', () => {
    const service = makeService();
    const clientId = register(service);
    const verifier = 'a-high-entropy-code-verifier-value-1234567890';
    const authRequest = {
      clientId,
      redirectUri: REDIRECT_URI,
      codeChallenge: pkce(verifier),
      codeChallengeMethod: 'S256',
    };
    const code = service.issueAuthorizationCode(authRequest);

    const tokens = service.exchangeAuthorizationCode({
      code,
      clientId,
      redirectUri: REDIRECT_URI,
      codeVerifier: verifier,
    });
    expect(tokens.token_type).toBe('Bearer');
    expect(tokens.expires_in).toBeGreaterThan(0);

    const claims = service.verifyAccessToken(tokens.access_token);
    expect(claims?.scopes).toContain('recipes:write');

    const refreshed = service.refresh({ refreshToken: tokens.refresh_token, clientId });
    expect(service.verifyAccessToken(refreshed.access_token)?.scopes).toContain('recipes:write');
  });

  it('rejects a code exchange with the wrong PKCE verifier or redirect URI', () => {
    const service = makeService();
    const clientId = register(service);
    const code = service.issueAuthorizationCode({
      clientId,
      redirectUri: REDIRECT_URI,
      codeChallenge: pkce('right-verifier'),
      codeChallengeMethod: 'S256',
    });
    expect(() =>
      service.exchangeAuthorizationCode({
        code,
        clientId,
        redirectUri: REDIRECT_URI,
        codeVerifier: 'wrong-verifier',
      }),
    ).toThrow(OAuthError);
    expect(() =>
      service.exchangeAuthorizationCode({
        code,
        clientId,
        redirectUri: 'https://evil.example',
        codeVerifier: 'right-verifier',
      }),
    ).toThrow(OAuthError);
  });

  it('rejects an expired authorization code', () => {
    const issuedClock = new FixedClock(new Date('2026-01-01T12:00:00Z'));
    const service = makeService(issuedClock);
    const clientId = register(service);
    const verifier = 'verifier';
    const code = service.issueAuthorizationCode({
      clientId,
      redirectUri: REDIRECT_URI,
      codeChallenge: pkce(verifier),
      codeChallengeMethod: 'S256',
    });

    // The same signer/secret, but 10 minutes later — past the 5-minute code TTL.
    const laterService = makeService(new FixedClock(new Date('2026-01-01T12:10:00Z')));
    expect(() =>
      laterService.exchangeAuthorizationCode({
        code,
        clientId,
        redirectUri: REDIRECT_URI,
        codeVerifier: verifier,
      }),
    ).toThrow(OAuthError);
  });

  it('does not accept an access token as a different token type', () => {
    const service = makeService();
    const clientId = register(service);
    const code = service.issueAuthorizationCode({
      clientId,
      redirectUri: REDIRECT_URI,
      codeChallenge: pkce('v'),
      codeChallengeMethod: 'S256',
    });
    const tokens = service.exchangeAuthorizationCode({
      code,
      clientId,
      redirectUri: REDIRECT_URI,
      codeVerifier: 'v',
    });
    // An access token must not be usable as a refresh token, and vice versa.
    expect(() => service.refresh({ refreshToken: tokens.access_token, clientId })).toThrow(
      OAuthError,
    );
    expect(service.verifyAccessToken(tokens.refresh_token)).toBeNull();
  });
});
