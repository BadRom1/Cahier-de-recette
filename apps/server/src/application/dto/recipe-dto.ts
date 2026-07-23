import type { Recipe } from '../../domain/recipe/recipe.js';
import type { ParsedRecipe } from '../ports/recipe-parser.js';
import type { RecipeParser } from '../ports/recipe-parser.js';

export interface RecipeSummaryDto {
  slug: string;
  title: string;
  tags: string[];
  servings: string | null;
  ingredientCount: number;
  updatedAt: string;
}

export interface RecipeDetailDto extends RecipeSummaryDto {
  source: string;
  metadata: Record<string, string>;
  ingredients: ParsedRecipe['ingredients'];
  cookware: ParsedRecipe['cookware'];
  timers: ParsedRecipe['timers'];
  steps: ParsedRecipe['steps'];
  createdAt: string;
}

export function titleOf(recipe: Recipe, parsed: ParsedRecipe): string {
  if (parsed.title !== null && parsed.title.trim() !== '') {
    return parsed.title;
  }
  const slug = recipe.slug.value;
  return slug.charAt(0).toUpperCase() + slug.slice(1).replaceAll('-', ' ');
}

export function toSummaryDto(recipe: Recipe, parser: RecipeParser): RecipeSummaryDto {
  const parsed = parser.parse(recipe.source.value);
  return {
    slug: recipe.slug.value,
    title: titleOf(recipe, parsed),
    tags: parsed.tags,
    servings: parsed.servings,
    ingredientCount: parsed.ingredients.length,
    updatedAt: recipe.updatedAt.toISOString(),
  };
}

export function toDetailDto(recipe: Recipe, parser: RecipeParser): RecipeDetailDto {
  const parsed = parser.parse(recipe.source.value);
  return {
    slug: recipe.slug.value,
    title: titleOf(recipe, parsed),
    tags: parsed.tags,
    servings: parsed.servings,
    ingredientCount: parsed.ingredients.length,
    source: recipe.source.value,
    metadata: parsed.metadata,
    ingredients: parsed.ingredients,
    cookware: parsed.cookware,
    timers: parsed.timers,
    steps: parsed.steps,
    createdAt: recipe.createdAt.toISOString(),
    updatedAt: recipe.updatedAt.toISOString(),
  };
}
