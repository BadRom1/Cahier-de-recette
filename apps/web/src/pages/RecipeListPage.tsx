import { useEffect, useMemo, useState } from 'react';
import { fetchRecipes, type RecipeSummary } from '../api';

export function RecipeListPage() {
  const [recipes, setRecipes] = useState<RecipeSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const result = await fetchRecipes(query, tag);
        if (!cancelled) {
          setRecipes(result);
          setError(null);
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      }
    };
    const timer = setTimeout(() => void load(), 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, tag]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    for (const recipe of recipes ?? []) {
      for (const t of recipe.tags) tags.add(t);
    }
    return [...tags].toSorted();
  }, [recipes]);

  if (error !== null) {
    return <p className="status status-error">Impossible de charger les recettes : {error}</p>;
  }

  return (
    <section>
      <div className="toolbar">
        <input
          type="search"
          className="search-input"
          placeholder="Rechercher une recette, un ingrédient…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Rechercher"
        />
      </div>
      {(allTags.length > 0 || tag !== '') && (
        <div className="tag-row">
          {tag !== '' && (
            <button type="button" className="tag tag-active" onClick={() => setTag('')}>
              {tag} ✕
            </button>
          )}
          {tag === '' &&
            allTags.map((t) => (
              <button type="button" key={t} className="tag" onClick={() => setTag(t)}>
                {t}
              </button>
            ))}
        </div>
      )}
      {recipes === null ? (
        <p className="status">Chargement…</p>
      ) : recipes.length === 0 ? (
        <p className="status">Aucune recette trouvée.</p>
      ) : (
        <ul className="recipe-grid">
          {recipes.map((recipe) => (
            <li key={recipe.slug}>
              <a className="recipe-card" href={`#/recette/${recipe.slug}`}>
                <h2>{recipe.title}</h2>
                <p className="recipe-card-meta">
                  {recipe.servings !== null && <span>{recipe.servings} pers.</span>}
                  <span>{recipe.ingredientCount} ingrédients</span>
                </p>
                {recipe.tags.length > 0 && (
                  <p className="recipe-card-tags">
                    {recipe.tags.map((t) => (
                      <span key={t} className="tag tag-small">
                        {t}
                      </span>
                    ))}
                  </p>
                )}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
