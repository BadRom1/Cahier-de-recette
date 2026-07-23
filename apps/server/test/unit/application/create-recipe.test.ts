import { describe, expect, it } from 'vitest';
import { CreateRecipe } from '../../../src/application/use-cases/create-recipe.js';
import {
  RecipeAlreadyExistsError,
  InvalidRecipeSourceError,
} from '../../../src/domain/recipe/errors.js';
import { CooklangRecipeParser } from '../../../src/infrastructure/parsing/cooklang-recipe-parser.js';
import { CollectingEventPublisher, CREPES_SOURCE, FixedClock } from '../../helpers/fakes.js';
import { InMemoryRecipeRepository } from '../../helpers/in-memory-recipe-repository.js';

function makeUseCase() {
  const repository = new InMemoryRecipeRepository();
  const events = new CollectingEventPublisher();
  const useCase = new CreateRecipe(
    repository,
    new CooklangRecipeParser(),
    new FixedClock(),
    events,
  );
  return { repository, events, useCase };
}

describe('CreateRecipe', () => {
  it('creates a recipe with an explicit slug', async () => {
    const { useCase, events } = makeUseCase();

    const created = await useCase.execute({ slug: 'mes-crepes', source: CREPES_SOURCE });

    expect(created.slug).toBe('mes-crepes');
    expect(created.title).toBe('Crêpes');
    expect(created.tags).toEqual(['dessert', 'facile']);
    expect(created.servings).toBe('4');
    expect(created.ingredients.map((i) => i.name)).toEqual(['farine', 'oeufs']);
    expect(events.published.map((e) => e.name)).toEqual(['recipe.created']);
  });

  it('derives the slug from the title when omitted', async () => {
    const { useCase } = makeUseCase();

    const created = await useCase.execute({ source: CREPES_SOURCE });

    expect(created.slug).toBe('crepes');
  });

  it('rejects a duplicate slug', async () => {
    const { useCase } = makeUseCase();
    await useCase.execute({ slug: 'crepes', source: CREPES_SOURCE });

    await expect(useCase.execute({ slug: 'crepes', source: CREPES_SOURCE })).rejects.toThrow(
      RecipeAlreadyExistsError,
    );
  });

  it('rejects an empty source', async () => {
    const { useCase } = makeUseCase();

    await expect(useCase.execute({ source: '  ' })).rejects.toThrow(InvalidRecipeSourceError);
  });
});
