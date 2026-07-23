import { useRoute } from './router';
import { RecipeDetailPage } from './pages/RecipeDetailPage';
import { RecipeListPage } from './pages/RecipeListPage';

export function App() {
  const route = useRoute();

  return (
    <div className="app">
      <header className="app-header">
        <a href="#/" className="app-title">
          🍳 Cahier de recette
        </a>
      </header>
      <main className="app-main">
        {route.page === 'list' ? <RecipeListPage /> : <RecipeDetailPage slug={route.slug} />}
      </main>
      <footer className="app-footer">
        <span>
          Recettes en <a href="https://cooklang.org">Cooklang</a> · accessibles via l&apos;
          <a href="/recipes/index.txt">index brut</a> et par MCP sur <code>/mcp</code>
        </span>
      </footer>
    </div>
  );
}
