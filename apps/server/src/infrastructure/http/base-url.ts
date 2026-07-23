import type { FastifyRequest } from 'fastify';

/**
 * Resolves the public base URL of the server (scheme + host, no trailing slash).
 *
 * Prefers the explicitly configured `PUBLIC_URL` (required behind a proxy that
 * rewrites the host), falling back to the request's forwarded protocol/host
 * (`trustProxy` is enabled, so `x-forwarded-*` headers are honored).
 */
export function resolveBaseUrl(request: FastifyRequest, publicUrl: string | null): string {
  if (publicUrl !== null && publicUrl.trim() !== '') {
    return publicUrl.replace(/\/+$/, '');
  }
  return `${request.protocol}://${request.host}`;
}
