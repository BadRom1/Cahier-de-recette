import { RecipeNotFoundError } from '../../domain/recipe/errors.js';
import { RecipeDeleted } from '../../domain/recipe/recipe-events.js';
import { RecipeSlug } from '../../domain/recipe/recipe-slug.js';
import type { Clock } from '../ports/clock.js';
import type { DomainEventPublisher } from '../ports/domain-event-publisher.js';
import type { RecipeRepository } from '../ports/recipe-repository.js';

export class DeleteRecipe {
  constructor(
    private readonly recipes: RecipeRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(rawSlug: string): Promise<void> {
    const slug = RecipeSlug.of(rawSlug);
    if (!(await this.recipes.exists(slug))) {
      throw new RecipeNotFoundError(slug.value);
    }
    await this.recipes.delete(slug);
    await this.events.publish([new RecipeDeleted(slug.value, this.clock.now())]);
  }
}
