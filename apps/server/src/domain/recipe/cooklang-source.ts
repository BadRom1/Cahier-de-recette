import { InvalidRecipeSourceError } from './errors.js';

const MAX_SOURCE_BYTES = 256 * 1024;

/** Value object: the raw Cooklang text of a recipe. */
export class CooklangSource {
  private constructor(readonly value: string) {}

  static of(value: string): CooklangSource {
    if (value.trim().length === 0) {
      throw new InvalidRecipeSourceError('source is empty');
    }
    if (value.length > MAX_SOURCE_BYTES) {
      throw new InvalidRecipeSourceError(`source exceeds ${MAX_SOURCE_BYTES} characters`);
    }
    if (value.includes('\u0000')) {
      throw new InvalidRecipeSourceError('source contains a NUL character');
    }
    return new CooklangSource(value);
  }

  toString(): string {
    return this.value;
  }
}
