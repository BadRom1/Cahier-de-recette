/** Base contract for all domain events raised by aggregates. */
export interface DomainEvent {
  readonly name: string;
  readonly occurredAt: Date;
  readonly payload: Record<string, unknown>;
}
