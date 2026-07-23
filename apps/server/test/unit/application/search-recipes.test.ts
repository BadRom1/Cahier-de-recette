import { beforeEach, describe, expect, it } from 'vitest';
import { CreateRecipe } from '../../../src/application/use-cases/create-recipe.js';
import { ListRecipes } from '../../../src/application/use-cases/list-recipes.js';
import { SearchRecipes } from '../../../src/application/use-cases/search-recipes.js';
import { CooklangRecipeParser } from '../../../src/infrastructure/parsing/cooklang-recipe-parser.js';
import {
  CollectingEventPublisher,
  CREPES_SOURCE,
  SALADE_SOURCE,
  FixedClock,
} from '../../helpers/fakes.js';
import { InMemoryRecipeRepository } from '../../helpers/in-memory-recipe-repository.js';

describe('SearchRecipes / ListRecipes', () => {
  const repository = new InMemoryRecipeRepository();
  const parser = new CooklangRecipeParser();
  const search = new SearchRecipes(repository, parser);
  const list = new ListRecipes(repository, parser);

  beforeEach(async () => {
    const create = new CreateRecipe(
      repository,
      parser,
      new FixedClock(),
      new CollectingEventPublisher(),
    );
    if (!(await repository.findAll()).length) {
      await create.execute({ source: CREPES_SOURCE });
      await create.execute({ source: SALADE_SOURCE });
    }
  });

  it('lists recipes sorted by title', async () => {
    const recipes = await list.execute();
    expect(recipes.map((r) => r.title)).toEqual(['Crêpes', 'Salade verte']);
  });

  it('finds recipes by ingredient text', async () => {
    const recipes = await search.execute({ query: 'farine' });
    expect(recipes.map((r) => r.slug)).toEqual(['crepes']);
  });

  it('filters by tag, case-insensitively', async () => {
    const recipes = await search.execute({ tag: 'DESSERT' });
    expect(recipes.map((r) => r.slug)).toEqual(['crepes']);
  });

  it('combines query and tag', async () => {
    const recipes = await search.execute({ query: 'salade', tag: 'dessert' });
    expect(recipes).toEqual([]);
  });

  it('returns everything for empty criteria', async () => {
    const recipes = await search.execute({});
    expect(recipes).toHaveLength(2);
  });
});
