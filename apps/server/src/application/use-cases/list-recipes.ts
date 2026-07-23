import type { RecipeRepository } from '../ports/recipe-repository.js';
import type { RecipeParser } from '../ports/recipe-parser.js';
import { toSummaryDto, type RecipeSummaryDto } from '../dto/recipe-dto.js';

export class ListRecipes {
  constructor(
    private readonly recipes: RecipeRepository,
    private readonly parser: RecipeParser,
  ) {}

  async execute(): Promise<RecipeSummaryDto[]> {
    const all = await this.recipes.findAll();
    return all
      .map((recipe) => toSummaryDto(recipe, this.parser))
      .toSorted((a, b) => a.title.localeCompare(b.title));
  }
}
