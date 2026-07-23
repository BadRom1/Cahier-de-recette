import { useEffect, useState } from 'react';
import { fetchRecipe, type RecipeDetail, type StepItem } from '../api';

function StepFragment({ item }: { item: StepItem }) {
  switch (item.type) {
    case 'text':
      return <>{item.value}</>;
    case 'ingredient':
      return (
        <strong className="inline-ingredient" title={`${item.quantity} ${item.units}`.trim()}>
          {item.name}
          {item.quantity !== '' && (
            <span className="inline-quantity">
              {' '}
              ({item.quantity}
              {item.units !== '' ? ` ${item.units}` : ''})
            </span>
          )}
        </strong>
      );
    case 'cookware':
      return <em className="inline-cookware">{item.name}</em>;
    case 'timer':
      return (
        <span className="inline-timer">
          ⏱ {item.quantity}
          {item.units !== '' ? ` ${item.units}` : ''}
        </span>
      );
  }
}

// Triggers a client-side download from a blob URL so the browser keeps the exact
// `.cook` filename. Linking to the server endpoint would let Chrome append `.txt`,
// since it serves the file as `text/plain` and `.cook` isn't a recognised extension.
function downloadSource(recipe: RecipeDetail) {
  const blob = new Blob([recipe.source], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${recipe.slug}.cook`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function RecipeDetailPage({ slug }: { slug: string }) {
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setRecipe(null);
    setError(null);
    const load = async () => {
      try {
        const result = await fetchRecipe(slug);
        if (!cancelled) setRecipe(result);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (error !== null) {
    return (
      <section>
        <p className="status status-error">{error}</p>
        <a href="#/">← Retour aux recettes</a>
      </section>
    );
  }
  if (recipe === null) {
    return <p className="status">Chargement…</p>;
  }

  return (
    <article className="recipe-detail">
      <nav className="breadcrumb">
        <a href="#/">← Toutes les recettes</a>
      </nav>
      <header>
        <h1>{recipe.title}</h1>
        <p className="recipe-card-meta">
          {recipe.servings !== null && <span>{recipe.servings} pers.</span>}
          {recipe.metadata.time !== undefined && <span>{recipe.metadata.time}</span>}
          {recipe.tags.map((t) => (
            <span key={t} className="tag tag-small">
              {t}
            </span>
          ))}
        </p>
      </header>

      <div className="recipe-columns">
        <aside className="ingredients-panel">
          <h2>Ingrédients</h2>
          <ul>
            {recipe.ingredients.map((ingredient, index) => (
              <li key={`${ingredient.name}-${index}`}>
                <span className="ingredient-qty">
                  {ingredient.quantity}
                  {ingredient.units !== '' ? ` ${ingredient.units}` : ''}
                </span>{' '}
                {ingredient.name}
              </li>
            ))}
          </ul>
          {recipe.cookware.length > 0 && (
            <>
              <h2>Ustensiles</h2>
              <ul>
                {recipe.cookware.map((cookware, index) => (
                  <li key={`${cookware.name}-${index}`}>{cookware.name}</li>
                ))}
              </ul>
            </>
          )}
        </aside>

        <div className="steps-panel">
          <h2>Préparation</h2>
          <ol className="steps">
            {recipe.steps.map((step, index) => (
              <li key={index}>
                {step.map((item, itemIndex) => (
                  <StepFragment key={itemIndex} item={item} />
                ))}
              </li>
            ))}
          </ol>
        </div>
      </div>

      <footer className="recipe-actions">
        <button type="button" className="button" onClick={() => downloadSource(recipe)}>
          Télécharger le .cook
        </button>
        <button type="button" className="button" onClick={() => setShowSource(!showSource)}>
          {showSource ? 'Masquer la source' : 'Voir la source Cooklang'}
        </button>
      </footer>
      {showSource && <pre className="source-view">{recipe.source}</pre>}
    </article>
  );
}
