import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CooklangSource } from '../../domain/recipe/cooklang-source.js';
import { Recipe } from '../../domain/recipe/recipe.js';
import { RecipeSlug } from '../../domain/recipe/recipe-slug.js';
import type { RecipeRepository } from '../../application/ports/recipe-repository.js';

/**
 * Driven adapter: stores each recipe as a plain `<slug>.cook` file.
 *
 * Plain files keep the collection portable: they can be synced to the
 * Cooklang mobile apps, versioned in git, or edited by hand.
 */
export class FsRecipeRepository implements RecipeRepository {
  constructor(private readonly directory: string) {}

  async init(): Promise<void> {
    await mkdir(this.directory, { recursive: true });
  }

  async findAll(): Promise<Recipe[]> {
    const entries = await readdir(this.directory, { withFileTypes: true });
    const slugs = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.cook'))
      .map((entry) => this.slugOfFile(entry.name))
      .filter((slug) => slug !== null);
    const recipes = await Promise.all(slugs.map((slug) => this.read(slug)));
    return recipes.filter((recipe) => recipe !== null);
  }

  async findBySlug(slug: RecipeSlug): Promise<Recipe | null> {
    return this.read(slug);
  }

  async exists(slug: RecipeSlug): Promise<boolean> {
    try {
      await stat(this.pathOf(slug));
      return true;
    } catch {
      return false;
    }
  }

  async save(recipe: Recipe): Promise<void> {
    const path = this.pathOf(recipe.slug);
    const temporary = `${path}.tmp`;
    await writeFile(temporary, recipe.source.value, 'utf8');
    await rename(temporary, path);
  }

  async delete(slug: RecipeSlug): Promise<void> {
    await unlink(this.pathOf(slug));
  }

  private pathOf(slug: RecipeSlug): string {
    return join(this.directory, `${slug.value}.cook`);
  }

  private slugOfFile(fileName: string): RecipeSlug | null {
    try {
      return RecipeSlug.of(fileName.slice(0, -'.cook'.length));
    } catch {
      return null;
    }
  }

  private async read(slug: RecipeSlug): Promise<Recipe | null> {
    const path = this.pathOf(slug);
    try {
      const [content, fileStat] = await Promise.all([readFile(path, 'utf8'), stat(path)]);
      return Recipe.reconstitute({
        slug,
        source: CooklangSource.of(content),
        createdAt: fileStat.birthtime.getTime() > 0 ? fileStat.birthtime : fileStat.mtime,
        updatedAt: fileStat.mtime,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
}
