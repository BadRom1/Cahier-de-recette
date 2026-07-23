// E2E launcher: reset the throwaway recipes directory, then start the built server.
// (A Playwright globalSetup cannot do the cleanup: the webServer starts first.)
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

await rm(fileURLToPath(new URL('./.tmp', import.meta.url)), { recursive: true, force: true });
await import('../apps/server/dist/main.js');
