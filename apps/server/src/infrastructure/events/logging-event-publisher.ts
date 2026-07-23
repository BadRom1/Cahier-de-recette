import type { DomainEvent } from '../../domain/shared/domain-event.js';
import type { DomainEventPublisher } from '../../application/ports/domain-event-publisher.js';

interface Logger {
  info(payload: Record<string, unknown>, message: string): void;
}

/** Driven adapter: publishes domain events to the application log. */
export class LoggingEventPublisher implements DomainEventPublisher {
  constructor(private readonly logger: Logger) {}

  async publish(events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      this.logger.info(
        { event: event.name, occurredAt: event.occurredAt.toISOString(), ...event.payload },
        'domain event',
      );
    }
  }
}
