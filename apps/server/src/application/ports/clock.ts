/** Driven port: source of time, injectable for deterministic tests. */
export interface Clock {
  now(): Date;
}
