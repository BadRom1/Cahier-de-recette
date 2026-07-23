import { describe, expect, it } from 'vitest';
import { InvalidRecipeSlugError } from '../../../src/domain/recipe/errors.js';
import { RecipeSlug } from '../../../src/domain/recipe/recipe-slug.js';

describe('RecipeSlug', () => {
  it('accepts lowercase letters, digits and hyphens', () => {
    expect(RecipeSlug.of('crepes-suzette-2').value).toBe('crepes-suzette-2');
  });

  it.each(['', 'UPPER', 'with space', '-leading', 'trailing-', 'a/../b', 'é'])(
    'rejects %j',
    (value) => {
      expect(() => RecipeSlug.of(value)).toThrow(InvalidRecipeSlugError);
    },
  );

  it('rejects slugs longer than 100 characters', () => {
    expect(() => RecipeSlug.of('a'.repeat(101))).toThrow(InvalidRecipeSlugError);
    expect(RecipeSlug.of('a'.repeat(100)).value).toHaveLength(100);
  });

  it('derives a slug from an accented French title', () => {
    expect(RecipeSlug.fromTitle('Bœuf Bourguignon à l’ancienne').value).toBe(
      'boeuf-bourguignon-a-l-ancienne',
    );
  });

  it('derives a slug from a title with punctuation', () => {
    expect(RecipeSlug.fromTitle('  Crêpes... Suzette !  ').value).toBe('crepes-suzette');
  });

  it('compares slugs by value', () => {
    expect(RecipeSlug.of('tarte').equals(RecipeSlug.of('tarte'))).toBe(true);
    expect(RecipeSlug.of('tarte').equals(RecipeSlug.of('quiche'))).toBe(false);
  });
});
