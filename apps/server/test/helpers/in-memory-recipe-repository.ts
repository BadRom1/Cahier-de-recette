import type { Recipe } from '../../src/domain/recipe/recipe.js';
import type { RecipeSlug } from '../../src/domain/recipe/recipe-slug.js';
import type { RecipeRepository } from '../../src/application/ports/recipe-repository.js';

export class InMemoryRecipeRepository implements RecipeRepository {
  private readonly store = new Map<string, Recipe>();

  async findAll(): Promise<Recipe[]> {
    return [...this.store.values()];
  }

  async findBySlug(slug: RecipeSlug): Promise<Recipe | null> {
    return this.store.get(slug.value) ?? null;
  }

  async exists(slug: RecipeSlug): Promise<boolean> {
    return this.store.has(slug.value);
  }

  async save(recipe: Recipe): Promise<void> {
    this.store.set(recipe.slug.value, recipe);
  }

  async delete(slug: RecipeSlug): Promise<void> {
    this.store.delete(slug.value);
  }
}
