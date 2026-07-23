import { CooklangSource } from '../../domain/recipe/cooklang-source.js';
import { RecipeAlreadyExistsError } from '../../domain/recipe/errors.js';
import { Recipe } from '../../domain/recipe/recipe.js';
import { RecipeSlug } from '../../domain/recipe/recipe-slug.js';
import type { Clock } from '../ports/clock.js';
import type { DomainEventPublisher } from '../ports/domain-event-publisher.js';
import type { RecipeParser } from '../ports/recipe-parser.js';
import type { RecipeRepository } from '../ports/recipe-repository.js';
import { toDetailDto, type RecipeDetailDto } from '../dto/recipe-dto.js';

export interface CreateRecipeCommand {
  /** Explicit slug; derived from the recipe title when omitted. */
  slug?: string | undefined;
  source: string;
}

export class CreateRecipe {
  constructor(
    private readonly recipes: RecipeRepository,
    private readonly parser: RecipeParser,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: CreateRecipeCommand): Promise<RecipeDetailDto> {
    const source = CooklangSource.of(command.source);
    // Parsing validates the source and provides the title used for slug derivation.
    const parsed = this.parser.parse(source.value);

    const slug =
      command.slug !== undefined && command.slug !== ''
        ? RecipeSlug.of(command.slug)
        : RecipeSlug.fromTitle(parsed.title ?? 'recette-sans-titre');

    if (await this.recipes.exists(slug)) {
      throw new RecipeAlreadyExistsError(slug.value);
    }

    const recipe = Recipe.create(slug, source, this.clock.now());
    await this.recipes.save(recipe);
    await this.events.publish(recipe.pullDomainEvents());
    return toDetailDto(recipe, this.parser);
  }
}
