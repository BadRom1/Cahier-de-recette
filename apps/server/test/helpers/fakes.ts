import type { Clock } from '../../src/application/ports/clock.js';
import type { DomainEventPublisher } from '../../src/application/ports/domain-event-publisher.js';
import type { DomainEvent } from '../../src/domain/shared/domain-event.js';

export class FixedClock implements Clock {
  constructor(private readonly fixed: Date = new Date('2026-01-01T12:00:00Z')) {}

  now(): Date {
    return this.fixed;
  }
}

export class CollectingEventPublisher implements DomainEventPublisher {
  readonly published: DomainEvent[] = [];

  async publish(events: DomainEvent[]): Promise<void> {
    this.published.push(...events);
  }
}

export const CREPES_SOURCE = `---
title: Crêpes
servings: 4
tags: [dessert, facile]
---

Mélanger la @farine{250%g} et les @oeufs{3} dans un #saladier{}.

Laisser reposer ~repos{30%minutes} puis cuire dans une #poêle{}.
`;

export const SALADE_SOURCE = `---
title: Salade verte
tags: [entrée]
---

Laver la @salade{1} et ajouter la @vinaigrette{2%c.à.s}.
`;
