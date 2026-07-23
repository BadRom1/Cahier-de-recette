import { describe, expect, it } from 'vitest';
import { CooklangRecipeParser } from '../../../src/infrastructure/parsing/cooklang-recipe-parser.js';
import { CREPES_SOURCE } from '../../helpers/fakes.js';

describe('CooklangRecipeParser', () => {
  const parser = new CooklangRecipeParser();

  it('extracts metadata from YAML frontmatter', () => {
    const parsed = parser.parse(CREPES_SOURCE);
    expect(parsed.title).toBe('Crêpes');
    expect(parsed.servings).toBe('4');
    expect(parsed.tags).toEqual(['dessert', 'facile']);
  });

  it('extracts ingredients with quantities and units', () => {
    const parsed = parser.parse(CREPES_SOURCE);
    expect(parsed.ingredients).toEqual([
      { name: 'farine', quantity: '250', units: 'g' },
      { name: 'oeufs', quantity: '3', units: '' },
    ]);
  });

  it('extracts cookware and timers', () => {
    const parsed = parser.parse(CREPES_SOURCE);
    expect(parsed.cookware.map((c) => c.name)).toEqual(['saladier', 'poêle']);
    expect(parsed.timers).toHaveLength(1);
    expect(parsed.timers[0]?.units).toBe('minutes');
  });

  it('produces steps with inline ingredient references', () => {
    const parsed = parser.parse(CREPES_SOURCE);
    expect(parsed.steps).toHaveLength(2);
    const first = parsed.steps[0] ?? [];
    expect(first.some((item) => item.type === 'ingredient' && item.name === 'farine')).toBe(true);
    const second = parsed.steps[1] ?? [];
    expect(second.some((item) => item.type === 'timer')).toBe(true);
  });

  it('supports classic ">>" metadata', () => {
    const parsed = parser.parse('>> title: Riz\n\nCuire le @riz{200%g}.');
    expect(parsed.title).toBe('Riz');
  });

  it('parses a plain text recipe without markup', () => {
    const parsed = parser.parse('Faire bouillir de l’eau.');
    expect(parsed.title).toBeNull();
    expect(parsed.steps).toHaveLength(1);
    expect(parsed.ingredients).toEqual([]);
  });
});
