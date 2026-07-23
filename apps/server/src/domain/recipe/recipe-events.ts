import type { DomainEvent } from '../shared/domain-event.js';

export class RecipeCreated implements DomainEvent {
  readonly name = 'recipe.created';
  readonly payload: Record<string, unknown>;

  constructor(
    slug: string,
    readonly occurredAt: Date,
  ) {
    this.payload = { slug };
  }
}

export class RecipeUpdated implements DomainEvent {
  readonly name = 'recipe.updated';
  readonly payload: Record<string, unknown>;

  constructor(
    slug: string,
    readonly occurredAt: Date,
  ) {
    this.payload = { slug };
  }
}

export class RecipeDeleted implements DomainEvent {
  readonly name = 'recipe.deleted';
  readonly payload: Record<string, unknown>;

  constructor(
    slug: string,
    readonly occurredAt: Date,
  ) {
    this.payload = { slug };
  }
}
