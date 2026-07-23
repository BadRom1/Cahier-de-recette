import { DomainError } from '../../domain/shared/domain-error.js';

const STATUS_BY_CODE: Record<string, number> = {
  RECIPE_NOT_FOUND: 404,
  RECIPE_ALREADY_EXISTS: 409,
  INVALID_RECIPE_SLUG: 400,
  INVALID_RECIPE_SOURCE: 422,
};

export function httpStatusOf(error: unknown): number {
  if (error instanceof DomainError) {
    return STATUS_BY_CODE[error.code] ?? 400;
  }
  return 500;
}

export function errorBodyOf(error: unknown): { code: string; message: string } {
  if (error instanceof DomainError) {
    return { code: error.code, message: error.message };
  }
  return { code: 'INTERNAL_ERROR', message: 'Internal server error' };
}
