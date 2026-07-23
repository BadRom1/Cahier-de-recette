import { describe, expect, it } from 'vitest';
import { WriteAccess } from '../../../src/infrastructure/auth/write-access.js';

describe('WriteAccess', () => {
  it('accepts the exact configured token', () => {
    const access = new WriteAccess('s3cret');
    expect(access.verify('s3cret')).toBe(true);
  });

  it.each(['wrong', '', 's3cret ', 's3cre', 's3crets'])('rejects %j', (token) => {
    const access = new WriteAccess('s3cret');
    expect(access.verify(token)).toBe(false);
  });

  it('rejects missing tokens', () => {
    const access = new WriteAccess('s3cret');
    expect(access.verify(null)).toBe(false);
    expect(access.verify(undefined)).toBe(false);
  });

  it('fails closed when no token is configured', () => {
    const access = new WriteAccess(null);
    expect(access.enabled).toBe(false);
    expect(access.verify('anything')).toBe(false);
  });

  it('extracts bearer tokens from Authorization headers', () => {
    expect(WriteAccess.tokenFromAuthorizationHeader('Bearer abc')).toBe('abc');
    expect(WriteAccess.tokenFromAuthorizationHeader('bearer abc')).toBe('abc');
    expect(WriteAccess.tokenFromAuthorizationHeader('Basic abc')).toBeNull();
    expect(WriteAccess.tokenFromAuthorizationHeader(undefined)).toBeNull();
  });
});
