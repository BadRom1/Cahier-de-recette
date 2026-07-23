import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { CreateRecipe } from '../../src/application/use-cases/create-recipe.js';
import { DeleteRecipe } from '../../src/application/use-cases/delete-recipe.js';
import { GetRecipe } from '../../src/application/use-cases/get-recipe.js';
import { ListRecipes } from '../../src/application/use-cases/list-recipes.js';
import { SearchRecipes } from '../../src/application/use-cases/search-recipes.js';
import { UpdateRecipe } from '../../src/application/use-cases/update-recipe.js';
import type { UseCases } from '../../src/application/use-cases/use-cases.js';
import { WriteAccess } from '../../src/infrastructure/auth/write-access.js';
import { buildApp } from '../../src/infrastructure/http/build-app.js';
import { OAuthService } from '../../src/infrastructure/oauth/oauth-service.js';
import { TokenSigner } from '../../src/infrastructure/oauth/token-signer.js';
import { CooklangRecipeParser } from '../../src/infrastructure/parsing/cooklang-recipe-parser.js';
import { FsRecipeRepository } from '../../src/infrastructure/persistence/fs-recipe-repository.js';
import { SystemClock } from '../../src/infrastructure/time/system-clock.js';
import { CollectingEventPublisher } from './fakes.js';

export const TEST_WRITE_TOKEN = 'test-write-token';
export const TEST_OAUTH_SECRET = 'test-oauth-signing-secret';
export const TEST_OAUTH_PASSWORD = 'hunter2';

export interface TestApp {
  app: FastifyInstance;
  recipesDir: string;
  oauthService: OAuthService | null;
}

export interface TestAppOptions {
  writeToken?: string | null;
  /** Enable the OAuth authorization server (protects /mcp). */
  oauth?: boolean;
}

/** Boots the real application against a throwaway recipes directory. */
export async function buildTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  const recipesDir = await mkdtemp(join(tmpdir(), 'cahier-test-'));
  const repository = new FsRecipeRepository(recipesDir);
  await repository.init();
  const parser = new CooklangRecipeParser();
  const clock = new SystemClock();
  const events = new CollectingEventPublisher();

  const useCases: UseCases = {
    listRecipes: new ListRecipes(repository, parser),
    getRecipe: new GetRecipe(repository, parser),
    searchRecipes: new SearchRecipes(repository, parser),
    createRecipe: new CreateRecipe(repository, parser, clock, events),
    updateRecipe: new UpdateRecipe(repository, parser, clock, events),
    deleteRecipe: new DeleteRecipe(repository, clock, events),
  };

  const oauthService =
    options.oauth === true
      ? new OAuthService({
          signer: new TokenSigner(TEST_OAUTH_SECRET),
          clock,
          password: TEST_OAUTH_PASSWORD,
          serverName: 'Cahier de recette (test)',
        })
      : null;

  const app = await buildApp({
    useCases,
    writeAccess: new WriteAccess(
      options.writeToken === undefined ? TEST_WRITE_TOKEN : options.writeToken,
    ),
    oauthService,
  });
  return { app, recipesDir, oauthService };
}
