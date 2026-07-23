export interface ParsedIngredient {
  name: string;
  quantity: string;
  units: string;
}

export interface ParsedCookware {
  name: string;
  quantity: string;
}

export interface ParsedTimer {
  name: string;
  quantity: string;
  units: string;
}

export type StepItem =
  | { type: 'text'; value: string }
  | { type: 'ingredient'; name: string; quantity: string; units: string }
  | { type: 'cookware'; name: string; quantity: string }
  | { type: 'timer'; name: string; quantity: string; units: string };

export interface ParsedRecipe {
  title: string | null;
  metadata: Record<string, string>;
  tags: string[];
  servings: string | null;
  ingredients: ParsedIngredient[];
  cookware: ParsedCookware[];
  timers: ParsedTimer[];
  steps: StepItem[][];
}

/**
 * Driven port: turns raw Cooklang text into a structured recipe.
 * Throws InvalidRecipeSourceError when the source cannot be parsed.
 */
export interface RecipeParser {
  parse(source: string): ParsedRecipe;
}
