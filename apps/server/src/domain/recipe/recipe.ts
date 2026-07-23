import type { DomainEvent } from '../shared/domain-event.js';
import { CooklangSource } from './cooklang-source.js';
import { RecipeCreated, RecipeUpdated } from './recipe-events.js';
import { RecipeSlug } from './recipe-slug.js';

interface RecipeProps {
  slug: RecipeSlug;
  source: CooklangSource;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Aggregate root of the recipe bounded context.
 *
 * A recipe is identified by its slug and owns its Cooklang source.
 * State changes are recorded as domain events pulled by the application layer.
 */
export class Recipe {
  private domainEvents: DomainEvent[] = [];

  private constructor(
    readonly slug: RecipeSlug,
    private _source: CooklangSource,
    readonly createdAt: Date,
    private _updatedAt: Date,
  ) {}

  static create(slug: RecipeSlug, source: CooklangSource, now: Date): Recipe {
    const recipe = new Recipe(slug, source, now, now);
    recipe.record(new RecipeCreated(slug.value, now));
    return recipe;
  }

  /** Rebuilds an existing recipe from persistence, without raising events. */
  static reconstitute(props: RecipeProps): Recipe {
    return new Recipe(props.slug, props.source, props.createdAt, props.updatedAt);
  }

  get source(): CooklangSource {
    return this._source;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  updateSource(source: CooklangSource, now: Date): void {
    this._source = source;
    this._updatedAt = now;
    this.record(new RecipeUpdated(this.slug.value, now));
  }

  pullDomainEvents(): DomainEvent[] {
    const events = this.domainEvents;
    this.domainEvents = [];
    return events;
  }

  private record(event: DomainEvent): void {
    this.domainEvents.push(event);
  }
}
