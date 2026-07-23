import { describe, expect, it } from 'vitest';
import { CreateRecipe } from '../../../src/application/use-cases/create-recipe.js';
import { DeleteRecipe } from '../../../src/application/use-cases/delete-recipe.js';
import { GetRecipe } from '../../../src/application/use-cases/get-recipe.js';
import { UpdateRecipe } from '../../../src/application/use-cases/update-recipe.js';
import { RecipeNotFoundError } from '../../../src/domain/recipe/errors.js';
import { RecipeSlug } from '../../../src/domain/recipe/recipe-slug.js';
import { CooklangRecipeParser } from '../../../src/infrastructure/parsing/cooklang-recipe-parser.js';
import {
  CollectingEventPublisher,
  CREPES_SOURCE,
  SALADE_SOURCE,
  FixedClock,
} from '../../helpers/fakes.js';
import { InMemoryRecipeRepository } from '../../helpers/in-memory-recipe-repository.js';

function makeContext() {
  const repository = new InMemoryRecipeRepository();
  const parser = new CooklangRecipeParser();
  const clock = new FixedClock();
  const events = new CollectingEventPublisher();
  return {
    repository,
    events,
    create: new CreateRecipe(repository, parser, clock, events),
    update: new UpdateRecipe(repository, parser, clock, events),
    remove: new DeleteRecipe(repository, clock, events),
    get: new GetRecipe(repository, parser),
  };
}

describe('UpdateRecipe', () => {
  it('replaces the source of an existing recipe', async () => {
    const context = makeContext();
    await context.create.execute({ slug: 'plat', source: CREPES_SOURCE });

    const updated = await context.update.execute({ slug: 'plat', source: SALADE_SOURCE });

    expect(updated.title).toBe('Salade verte');
    expect(context.events.published.map((e) => e.name)).toEqual([
      'recipe.created',
      'recipe.updated',
    ]);
  });

  it('fails on a missing recipe', async () => {
    const context = makeContext();
    await expect(context.update.execute({ slug: 'absent', source: SALADE_SOURCE })).rejects.toThrow(
      RecipeNotFoundError,
    );
  });
});

describe('DeleteRecipe', () => {
  it('deletes an existing recipe and publishes an event', async () => {
    const context = makeContext();
    await context.create.execute({ slug: 'plat', source: CREPES_SOURCE });

    await context.remove.execute('plat');

    expect(await context.repository.exists(RecipeSlug.of('plat'))).toBe(false);
    expect(context.events.published.at(-1)?.name).toBe('recipe.deleted');
  });

  it('fails on a missing recipe', async () => {
    const context = makeContext();
    await expect(context.remove.execute('absent')).rejects.toThrow(RecipeNotFoundError);
  });
});

describe('GetRecipe', () => {
  it('fails on a missing recipe', async () => {
    const context = makeContext();
    await expect(context.get.execute('absent')).rejects.toThrow(RecipeNotFoundError);
  });
});
