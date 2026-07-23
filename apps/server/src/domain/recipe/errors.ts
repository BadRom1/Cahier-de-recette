import { DomainError } from '../shared/domain-error.js';

export class InvalidRecipeSlugError extends DomainError {
  readonly code = 'INVALID_RECIPE_SLUG';

  constructor(value: string) {
    super(
      `Invalid recipe slug "${value}": expected 1-100 chars of lowercase letters, digits and hyphens`,
    );
  }
}

export class InvalidRecipeSourceError extends DomainError {
  readonly code = 'INVALID_RECIPE_SOURCE';

  constructor(reason: string) {
    super(`Invalid Cooklang source: ${reason}`);
  }
}

export class RecipeNotFoundError extends DomainError {
  readonly code = 'RECIPE_NOT_FOUND';

  constructor(slug: string) {
    super(`Recipe "${slug}" not found`);
  }
}

export class RecipeAlreadyExistsError extends DomainError {
  readonly code = 'RECIPE_ALREADY_EXISTS';

  constructor(slug: string) {
    super(`Recipe "${slug}" already exists`);
  }
}
