import { pino } from 'pino';
import { CreateRecipe } from './application/use-cases/create-recipe.js';
import { DeleteRecipe } from './application/use-cases/delete-recipe.js';
import { GetRecipe } from './application/use-cases/get-recipe.js';
import { ListRecipes } from './application/use-cases/list-recipes.js';
import { SearchRecipes } from './application/use-cases/search-recipes.js';
import { UpdateRecipe } from './application/use-cases/update-recipe.js';
import type { UseCases } from './application/use-cases/use-cases.js';
import { WriteAccess } from './infrastructure/auth/write-access.js';
import { loadConfig } from './infrastructure/config/config.js';
import { LoggingEventPublisher } from './infrastructure/events/logging-event-publisher.js';
import { buildApp } from './infrastructure/http/build-app.js';
import { OAuthService } from './infrastructure/oauth/oauth-service.js';
import { TokenSigner } from './infrastructure/oauth/token-signer.js';
import { CooklangRecipeParser } from './infrastructure/parsing/cooklang-recipe-parser.js';
import { FsRecipeRepository } from './infrastructure/persistence/fs-recipe-repository.js';
import { seedRecipesIfEmpty } from './infrastructure/persistence/seed-recipes.js';
import { SystemClock } from './infrastructure/time/system-clock.js';

/** Composition root: wires adapters to ports and starts the HTTP server. */
async function main(): Promise<void> {
  const config = loadConfig();
  const logger = pino({ level: config.logLevel });

  const repository = new FsRecipeRepository(config.recipesDir);
  await repository.init();
  if (config.seedRecipesDir !== null) {
    const seeded = await seedRecipesIfEmpty(config.recipesDir, config.seedRecipesDir);
    if (seeded > 0) logger.info({ seeded }, 'seeded sample recipes');
  }
  const parser = new CooklangRecipeParser();
  const clock = new SystemClock();
  const writeAccess = new WriteAccess(config.writeToken);
  const events = new LoggingEventPublisher(logger);

  // OAuth is enabled when a signing secret and a consent password are available
  // (the password falls back to WRITE_TOKEN). It turns /mcp into an OAuth
  // protected resource so remote clients such as Claude Web can authorize.
  const oauthPassword = config.oauthPassword ?? config.writeToken;
  const oauthService =
    config.oauthSecret !== null && oauthPassword !== null
      ? new OAuthService({
          signer: new TokenSigner(config.oauthSecret),
          clock,
          password: oauthPassword,
          serverName: 'Cahier de recette',
        })
      : null;

  const useCases: UseCases = {
    listRecipes: new ListRecipes(repository, parser),
    getRecipe: new GetRecipe(repository, parser),
    searchRecipes: new SearchRecipes(repository, parser),
    createRecipe: new CreateRecipe(repository, parser, clock, events),
    updateRecipe: new UpdateRecipe(repository, parser, clock, events),
    deleteRecipe: new DeleteRecipe(repository, clock, events),
  };

  const app = await buildApp({
    useCases,
    writeAccess,
    webDistDir: config.webDistDir,
    oauthService,
    publicUrl: config.publicUrl,
    loggerInstance: logger,
  });

  if (!writeAccess.enabled) {
    app.log.warn('WRITE_TOKEN is not set: all write operations are disabled');
  }
  if (oauthService === null) {
    app.log.info('OAUTH_SECRET is not set: the MCP endpoint stays public (no OAuth)');
  } else {
    app.log.info('OAuth enabled: the MCP endpoint requires a valid access token');
  }

  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (error) {
    logger.error(error);
    process.exit(1);
  }

  const shutdown = async (): Promise<void> => {
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

void main();
