import type { Recipe } from '../../domain/recipe/recipe.js';
import type { RecipeSlug } from '../../domain/recipe/recipe-slug.js';

/** Driven port: persistence of recipe aggregates. */
export interface RecipeRepository {
  findAll(): Promise<Recipe[]>;
  findBySlug(slug: RecipeSlug): Promise<Recipe | null>;
  exists(slug: RecipeSlug): Promise<boolean>;
  save(recipe: Recipe): Promise<void>;
  delete(slug: RecipeSlug): Promise<void>;
}
