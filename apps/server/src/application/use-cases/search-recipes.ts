import type { RecipeRepository } from '../ports/recipe-repository.js';
import type { RecipeParser } from '../ports/recipe-parser.js';
import { titleOf, type RecipeSummaryDto } from '../dto/recipe-dto.js';

export interface SearchRecipesQuery {
  /** Free-text query matched against title, ingredients and source. */
  query?: string | undefined;
  /** Only return recipes carrying this tag. */
  tag?: string | undefined;
}

export class SearchRecipes {
  constructor(
    private readonly recipes: RecipeRepository,
    private readonly parser: RecipeParser,
  ) {}

  async execute(criteria: SearchRecipesQuery): Promise<RecipeSummaryDto[]> {
    const needle = criteria.query?.trim().toLowerCase() ?? '';
    const tag = criteria.tag?.trim().toLowerCase() ?? '';
    const all = await this.recipes.findAll();

    const matches: RecipeSummaryDto[] = [];
    for (const recipe of all) {
      const parsed = this.parser.parse(recipe.source.value);
      const title = titleOf(recipe, parsed);

      if (tag !== '' && !parsed.tags.some((t) => t.toLowerCase() === tag)) {
        continue;
      }
      if (needle !== '') {
        const haystack = [
          title,
          recipe.slug.value,
          ...parsed.ingredients.map((i) => i.name),
          recipe.source.value,
        ]
          .join('\n')
          .toLowerCase();
        if (!haystack.includes(needle)) {
          continue;
        }
      }

      matches.push({
        slug: recipe.slug.value,
        title,
        tags: parsed.tags,
        servings: parsed.servings,
        ingredientCount: parsed.ingredients.length,
        updatedAt: recipe.updatedAt.toISOString(),
      });
    }
    return matches.toSorted((a, b) => a.title.localeCompare(b.title));
  }
}
