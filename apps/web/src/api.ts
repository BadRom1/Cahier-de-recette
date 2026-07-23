export interface RecipeSummary {
  slug: string;
  title: string;
  tags: string[];
  servings: string | null;
  ingredientCount: number;
  updatedAt: string;
}

export type StepItem =
  | { type: 'text'; value: string }
  | { type: 'ingredient'; name: string; quantity: string; units: string }
  | { type: 'cookware'; name: string; quantity: string }
  | { type: 'timer'; name: string; quantity: string; units: string };

export interface RecipeDetail extends RecipeSummary {
  source: string;
  metadata: Record<string, string>;
  ingredients: { name: string; quantity: string; units: string }[];
  cookware: { name: string; quantity: string }[];
  timers: { name: string; quantity: string; units: string }[];
  steps: StepItem[][];
  createdAt: string;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `Erreur ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function fetchRecipes(query?: string, tag?: string): Promise<RecipeSummary[]> {
  const params = new URLSearchParams();
  if (query !== undefined && query.trim() !== '') params.set('q', query.trim());
  if (tag !== undefined && tag !== '') params.set('tag', tag);
  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  return getJson(`/api/recipes${suffix}`);
}

export function fetchRecipe(slug: string): Promise<RecipeDetail> {
  return getJson(`/api/recipes/${encodeURIComponent(slug)}`);
}
