import type { CreateRecipe } from './create-recipe.js';
import type { DeleteRecipe } from './delete-recipe.js';
import type { GetRecipe } from './get-recipe.js';
import type { ListRecipes } from './list-recipes.js';
import type { SearchRecipes } from './search-recipes.js';
import type { UpdateRecipe } from './update-recipe.js';

/** Driving ports of the application, wired once in the composition root. */
export interface UseCases {
  listRecipes: ListRecipes;
  getRecipe: GetRecipe;
  searchRecipes: SearchRecipes;
  createRecipe: CreateRecipe;
  updateRecipe: UpdateRecipe;
  deleteRecipe: DeleteRecipe;
}
