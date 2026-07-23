import { timingSafeEqual } from 'node:crypto';

/**
 * Guards write operations with a shared bearer token.
 *
 * Reads are public by design; writes fail closed when no token is configured.
 */
export class WriteAccess {
  constructor(private readonly writeToken: string | null) {}

  get enabled(): boolean {
    return this.writeToken !== null;
  }

  verify(presented: string | undefined | null): boolean {
    if (this.writeToken === null || presented === undefined || presented === null) {
      return false;
    }
    const expected = Buffer.from(this.writeToken, 'utf8');
    const actual = Buffer.from(presented, 'utf8');
    if (expected.length !== actual.length) {
      return false;
    }
    return timingSafeEqual(expected, actual);
  }

  /** Extracts the token from an `Authorization: Bearer …` header value. */
  static tokenFromAuthorizationHeader(header: string | undefined): string | null {
    if (header === undefined) return null;
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    return match?.[1] ?? null;
  }
}
