import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Copies the bundled sample recipes into the recipes directory when it is
 * empty — so a fresh deployment (e.g. a new Railway volume) starts with content.
 */
export async function seedRecipesIfEmpty(recipesDir: string, seedDir: string): Promise<number> {
  await mkdir(recipesDir, { recursive: true });
  const existing = await readdir(recipesDir);
  if (existing.some((name) => name.endsWith('.cook'))) {
    return 0;
  }

  let seeds: string[];
  try {
    seeds = (await readdir(seedDir)).filter((name) => name.endsWith('.cook'));
  } catch {
    return 0;
  }

  await Promise.all(seeds.map((name) => copyFile(join(seedDir, name), join(recipesDir, name))));
  return seeds.length;
}
