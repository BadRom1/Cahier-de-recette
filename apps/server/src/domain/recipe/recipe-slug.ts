import { InvalidRecipeSlugError } from './errors.js';

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/;

/** Value object: URL-safe, filesystem-safe identifier of a recipe. */
export class RecipeSlug {
  private constructor(readonly value: string) {}

  static of(value: string): RecipeSlug {
    if (!SLUG_PATTERN.test(value)) {
      throw new InvalidRecipeSlugError(value);
    }
    return new RecipeSlug(value);
  }

  /** Derives a slug from a free-form title (e.g. "Bœuf Bourguignon" → "boeuf-bourguignon"). */
  static fromTitle(title: string): RecipeSlug {
    const slug = title
      .normalize('NFKD')
      .replaceAll('œ', 'oe')
      .replaceAll('æ', 'ae')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 100)
      .replace(/-+$/g, '');
    return RecipeSlug.of(slug);
  }

  equals(other: RecipeSlug): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
