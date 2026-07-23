import {
  CooklangParser,
  getFlatCookware,
  getFlatIngredients,
  getFlatTimers,
  getQuantityUnit,
  quantity_display,
  type CooklangRecipe,
  type Quantity,
} from '@cooklang/cooklang';
import { InvalidRecipeSourceError } from '../../domain/recipe/errors.js';
import type {
  ParsedRecipe,
  RecipeParser,
  StepItem,
} from '../../application/ports/recipe-parser.js';

/** Removes a trailing unit from a quantity display ("250 g" + "g" → "250"). */
function stripUnit(display: string, units: string): string {
  return units !== '' && display.endsWith(` ${units}`)
    ? display.slice(0, display.length - units.length - 1)
    : display;
}

/** Splits a quantity into a value display and a unit ("250 g" → ["250", "g"]). */
function splitQuantity(quantity: Quantity | null | undefined): { value: string; units: string } {
  if (quantity === null || quantity === undefined) {
    return { value: '', units: '' };
  }
  const units = getQuantityUnit(quantity) ?? '';
  const value = stripUnit(quantity_display(quantity) ?? '', units);
  return { value, units };
}

function metadataOf(recipe: CooklangRecipe): Record<string, string> {
  const metadata: Record<string, string> = {};
  if (recipe.title !== undefined) metadata['title'] = recipe.title;
  if (recipe.description !== undefined && recipe.description !== null) {
    metadata['description'] = String(recipe.description);
  }
  if (recipe.servings !== undefined && recipe.servings !== null) {
    metadata['servings'] = String(recipe.servings);
  }
  if (recipe.tags.size > 0) metadata['tags'] = [...recipe.tags].join(', ');
  for (const [key, value] of recipe.custom_metadata) {
    metadata[String(key)] = typeof value === 'string' ? value : JSON.stringify(value);
  }
  return metadata;
}

function stepsOf(recipe: CooklangRecipe): StepItem[][] {
  const steps: StepItem[][] = [];
  for (const section of recipe.sections) {
    for (const content of section.content) {
      if (content.type === 'text') {
        steps.push([{ type: 'text', value: String(content.value) }]);
        continue;
      }
      const items: StepItem[] = [];
      for (const item of content.value.items) {
        switch (item.type) {
          case 'text':
            items.push({ type: 'text', value: item.value });
            break;
          case 'ingredient': {
            const ingredient = recipe.ingredients[item.index];
            if (ingredient === undefined) break;
            const { value, units } = splitQuantity(ingredient.quantity);
            items.push({ type: 'ingredient', name: ingredient.name, quantity: value, units });
            break;
          }
          case 'cookware': {
            const cookware = recipe.cookware[item.index];
            if (cookware === undefined) break;
            const { value } = splitQuantity(cookware.quantity);
            items.push({ type: 'cookware', name: cookware.name, quantity: value });
            break;
          }
          case 'timer': {
            const timer = recipe.timers[item.index];
            if (timer === undefined) break;
            const { value, units } = splitQuantity(timer.quantity);
            items.push({ type: 'timer', name: timer.name ?? '', quantity: value, units });
            break;
          }
          default:
            break;
        }
      }
      steps.push(items);
    }
  }
  return steps;
}

/** Driven adapter: parses Cooklang using the official cooklang-rs WASM bindings. */
export class CooklangRecipeParser implements RecipeParser {
  private readonly parser = new CooklangParser();

  parse(source: string): ParsedRecipe {
    let recipe: CooklangRecipe;
    try {
      [recipe] = this.parser.parse(source);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new InvalidRecipeSourceError(reason);
    }

    return {
      title: recipe.title ?? null,
      metadata: metadataOf(recipe),
      tags: [...recipe.tags],
      servings:
        recipe.servings === undefined || recipe.servings === null ? null : String(recipe.servings),
      ingredients: getFlatIngredients(recipe).map((ingredient) => ({
        name: ingredient.name,
        quantity: stripUnit(ingredient.displayText ?? '', ingredient.unit ?? ''),
        units: ingredient.unit ?? '',
      })),
      cookware: getFlatCookware(recipe).map((cookware) => ({
        name: cookware.name,
        quantity: cookware.displayText ?? '',
      })),
      timers: getFlatTimers(recipe).map((timer) => ({
        name: timer.name ?? '',
        quantity: stripUnit(timer.displayText ?? '', timer.unit ?? ''),
        units: timer.unit ?? '',
      })),
      steps: stepsOf(recipe),
    };
  }
}
