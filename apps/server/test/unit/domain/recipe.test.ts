import { describe, expect, it } from 'vitest';
import { CooklangSource } from '../../../src/domain/recipe/cooklang-source.js';
import { Recipe } from '../../../src/domain/recipe/recipe.js';
import { RecipeSlug } from '../../../src/domain/recipe/recipe-slug.js';

const now = new Date('2026-01-01T12:00:00Z');
const later = new Date('2026-01-02T12:00:00Z');

describe('Recipe', () => {
  it('records a RecipeCreated event on creation', () => {
    const recipe = Recipe.create(RecipeSlug.of('crepes'), CooklangSource.of('@farine{}'), now);

    const events = recipe.pullDomainEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.name).toBe('recipe.created');
    expect(events[0]?.payload).toEqual({ slug: 'crepes' });
    expect(recipe.createdAt).toBe(now);
    expect(recipe.updatedAt).toBe(now);
  });

  it('clears events after they are pulled', () => {
    const recipe = Recipe.create(RecipeSlug.of('crepes'), CooklangSource.of('@farine{}'), now);
    recipe.pullDomainEvents();
    expect(recipe.pullDomainEvents()).toHaveLength(0);
  });

  it('updates its source and records a RecipeUpdated event', () => {
    const recipe = Recipe.create(RecipeSlug.of('crepes'), CooklangSource.of('@farine{}'), now);
    recipe.pullDomainEvents();

    recipe.updateSource(CooklangSource.of('@farine{250%g}'), later);

    expect(recipe.source.value).toBe('@farine{250%g}');
    expect(recipe.updatedAt).toBe(later);
    const events = recipe.pullDomainEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.name).toBe('recipe.updated');
  });

  it('reconstitutes from persistence without raising events', () => {
    const recipe = Recipe.reconstitute({
      slug: RecipeSlug.of('crepes'),
      source: CooklangSource.of('@farine{}'),
      createdAt: now,
      updatedAt: later,
    });
    expect(recipe.pullDomainEvents()).toHaveLength(0);
    expect(recipe.updatedAt).toBe(later);
  });
});
