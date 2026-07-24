import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Signs and verifies compact, self-contained tokens (`payload.signature`).
 *
 * The payload is a base64url-encoded JSON object; the signature is an
 * HMAC-SHA256 of that encoded payload. This keeps the OAuth server stateless
 * — authorization codes, access/refresh tokens and even client identifiers are
 * carried entirely inside the token, so nothing needs to be persisted and the
 * `/mcp` endpoint stays horizontally scalable and restart-safe.
 */
export class TokenSigner {
  constructor(private readonly secret: string) {}

  sign(payload: Record<string, unknown>): string {
    const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    return `${body}.${this.signature(body)}`;
  }

  /** Returns the decoded payload when the signature is valid, otherwise `null`. */
  verify(token: string): Record<string, unknown> | null {
    const dot = token.lastIndexOf('.');
    if (dot <= 0) return null;

    const body = token.slice(0, dot);
    const provided = Buffer.from(token.slice(dot + 1));
    const expected = Buffer.from(this.signature(body));
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      return null;
    }

    try {
      const decoded: unknown = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
      return typeof decoded === 'object' && decoded !== null
        ? (decoded as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }

  private signature(body: string): string {
    return createHmac('sha256', this.secret).update(body).digest('base64url');
  }
}
