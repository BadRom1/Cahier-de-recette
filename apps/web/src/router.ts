import { useEffect, useState } from 'react';

export type Route = { page: 'list' } | { page: 'detail'; slug: string };

function parseHash(hash: string): Route {
  const match = /^#\/recette\/([a-z0-9-]+)$/.exec(hash);
  if (match !== null && match[1] !== undefined) {
    return { page: 'detail', slug: match[1] };
  }
  return { page: 'list' };
}

/** Minimal hash router: `#/` → list, `#/recette/<slug>` → detail. */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return route;
}
