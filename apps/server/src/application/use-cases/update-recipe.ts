import { CooklangSource } from '../../domain/recipe/cooklang-source.js';
import { RecipeNotFoundError } from '../../domain/recipe/errors.js';
import { RecipeSlug } from '../../domain/recipe/recipe-slug.js';
import type { Clock } from '../ports/clock.js';
import type { DomainEventPublisher } from '../ports/domain-event-publisher.js';
import type { RecipeParser } from '../ports/recipe-parser.js';
import type { RecipeRepository } from '../ports/recipe-repository.js';
import { toDetailDto, type RecipeDetailDto } from '../dto/recipe-dto.js';

export interface UpdateRecipeCommand {
  slug: string;
  source: string;
}

export class UpdateRecipe {
  constructor(
    private readonly recipes: RecipeRepository,
    private readonly parser: RecipeParser,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: UpdateRecipeCommand): Promise<RecipeDetailDto> {
    const slug = RecipeSlug.of(command.slug);
    const source = CooklangSource.of(command.source);
    this.parser.parse(source.value);

    const recipe = await this.recipes.findBySlug(slug);
    if (recipe === null) {
      throw new RecipeNotFoundError(slug.value);
    }

    recipe.updateSource(source, this.clock.now());
    await this.recipes.save(recipe);
    await this.events.publish(recipe.pullDomainEvents());
    return toDetailDto(recipe, this.parser);
  }
}
