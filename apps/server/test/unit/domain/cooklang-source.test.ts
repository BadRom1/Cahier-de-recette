import { describe, expect, it } from 'vitest';
import { CooklangSource } from '../../../src/domain/recipe/cooklang-source.js';
import { InvalidRecipeSourceError } from '../../../src/domain/recipe/errors.js';

describe('CooklangSource', () => {
  it('wraps a valid source', () => {
    expect(CooklangSource.of('Cuire les @pâtes{500%g}.').value).toContain('pâtes');
  });

  it('rejects an empty source', () => {
    expect(() => CooklangSource.of('   \n ')).toThrow(InvalidRecipeSourceError);
  });

  it('rejects an oversized source', () => {
    expect(() => CooklangSource.of('a'.repeat(256 * 1024 + 1))).toThrow(InvalidRecipeSourceError);
  });

  it('rejects NUL characters', () => {
    expect(() => CooklangSource.of('avant\u0000après')).toThrow(InvalidRecipeSourceError);
  });
});
