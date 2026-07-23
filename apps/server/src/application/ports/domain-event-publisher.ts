import type { DomainEvent } from '../../domain/shared/domain-event.js';

/** Driven port: publishes domain events to the outside world (logs, bus, webhooks…). */
export interface DomainEventPublisher {
  publish(events: DomainEvent[]): Promise<void>;
}
