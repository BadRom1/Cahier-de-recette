import { RecipeNotFoundError } from '../../domain/recipe/errors.js';
import { RecipeSlug } from '../../domain/recipe/recipe-slug.js';
import type { RecipeRepository } from '../ports/recipe-repository.js';
import type { RecipeParser } from '../ports/recipe-parser.js';
import { toDetailDto, type RecipeDetailDto } from '../dto/recipe-dto.js';

export class GetRecipe {
  constructor(
    private readonly recipes: RecipeRepository,
    private readonly parser: RecipeParser,
  ) {}

  async execute(rawSlug: string): Promise<RecipeDetailDto> {
    const slug = RecipeSlug.of(rawSlug);
    const recipe = await this.recipes.findBySlug(slug);
    if (recipe === null) {
      throw new RecipeNotFoundError(slug.value);
    }
    return toDetailDto(recipe, this.parser);
  }
}
