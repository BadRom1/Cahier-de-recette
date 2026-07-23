export interface AppConfig {
  host: string;
  port: number;
  /** Directory where the `.cook` files live. Point it at a Railway volume in production. */
  recipesDir: string;
  /** Directory of sample recipes copied into recipesDir when it is empty. */
  seedRecipesDir: string | null;
  /** Bearer token required for every write operation. Writes are disabled when unset. */
  writeToken: string | null;
  /** Directory of the built web app, served statically when present. */
  webDistDir: string | null;
  /** Public base URL (scheme + host) used in OAuth metadata; derived from the request when unset. */
  publicUrl: string | null;
  /** HMAC secret signing OAuth tokens. OAuth is enabled only when this is set. */
  oauthSecret: string | null;
  /** Password the resource owner enters on the OAuth consent screen (falls back to WRITE_TOKEN). */
  oauthPassword: string | null;
  logLevel: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const writeToken = env.WRITE_TOKEN?.trim() ?? '';
  // Set SEED_RECIPES_DIR to an empty string to disable seeding entirely.
  const seedRecipesDir = env.SEED_RECIPES_DIR ?? './recipes';
  const publicUrl = env.PUBLIC_URL?.trim() ?? '';
  const oauthSecret = env.OAUTH_SECRET?.trim() ?? '';
  const oauthPassword = env.OAUTH_PASSWORD?.trim() ?? '';
  return {
    host: env.HOST ?? '0.0.0.0',
    port: Number.parseInt(env.PORT ?? '3000', 10),
    recipesDir: env.RECIPES_DIR ?? './data/recipes',
    // Defaults match a checkout/deploy running from the repository root.
    seedRecipesDir: seedRecipesDir.trim() === '' ? null : seedRecipesDir,
    writeToken: writeToken === '' ? null : writeToken,
    webDistDir: env.WEB_DIST_DIR ?? './apps/web/dist',
    publicUrl: publicUrl === '' ? null : publicUrl,
    oauthSecret: oauthSecret === '' ? null : oauthSecret,
    oauthPassword: oauthPassword === '' ? null : oauthPassword,
    logLevel: env.LOG_LEVEL ?? 'info',
  };
}
