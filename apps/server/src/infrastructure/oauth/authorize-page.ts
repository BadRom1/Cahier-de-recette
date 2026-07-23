/** Escapes a string for safe interpolation inside an HTML attribute or text node. */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export interface AuthorizePageParams {
  /** Hidden fields carried through the form to POST /authorize (already trusted keys). */
  hiddenFields: Record<string, string>;
  serverName: string;
  clientName?: string;
  /** Shown when a previous submission used the wrong password. */
  error?: string;
}

/** Renders the consent screen where the resource owner enters the password. */
export function renderAuthorizePage(params: AuthorizePageParams): string {
  const hidden = Object.entries(params.hiddenFields)
    .map(
      ([name, value]) =>
        `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}" />`,
    )
    .join('\n      ');

  const client = params.clientName ?? 'Une application';
  const errorBanner =
    params.error === undefined
      ? ''
      : `<p class="error" role="alert">${escapeHtml(params.error)}</p>`;

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>Autoriser l'accès — ${escapeHtml(params.serverName)}</title>
    <style>
      :root { color-scheme: light dark; }
      body {
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        margin: 0; min-height: 100vh; display: grid; place-items: center;
        background: #f5f5f4; color: #1c1917;
      }
      @media (prefers-color-scheme: dark) {
        body { background: #1c1917; color: #f5f5f4; }
        .card { background: #292524; box-shadow: none; border: 1px solid #44403c; }
        input { background: #1c1917; color: #f5f5f4; border-color: #57534e; }
      }
      .card {
        background: #fff; padding: 2rem; border-radius: 12px; max-width: 24rem; width: 90%;
        box-shadow: 0 10px 30px rgba(0,0,0,0.08);
      }
      h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
      p { margin: 0 0 1rem; line-height: 1.5; color: inherit; opacity: 0.85; }
      strong { opacity: 1; }
      label { display: block; font-weight: 600; margin-bottom: 0.35rem; }
      input[type="password"] {
        width: 100%; padding: 0.6rem 0.7rem; border: 1px solid #d6d3d1; border-radius: 8px;
        font-size: 1rem; box-sizing: border-box; margin-bottom: 1rem;
      }
      button {
        width: 100%; padding: 0.65rem; border: 0; border-radius: 8px; font-size: 1rem;
        font-weight: 600; cursor: pointer; background: #ea580c; color: #fff;
      }
      button:hover { background: #c2410c; }
      .error {
        background: #fef2f2; color: #b91c1c; padding: 0.6rem 0.75rem; border-radius: 8px;
        border: 1px solid #fecaca; opacity: 1;
      }
    </style>
  </head>
  <body>
    <main class="card">
      <h1>Autoriser l'accès</h1>
      <p><strong>${escapeHtml(client)}</strong> demande l'accès à votre cahier de recette
        (lecture et écriture). Saisissez le mot de passe pour autoriser la connexion.</p>
      ${errorBanner}
      <form method="post" action="/authorize">
      ${hidden}
        <label for="password">Mot de passe</label>
        <input id="password" name="password" type="password" autocomplete="current-password"
          autofocus required />
        <button type="submit">Autoriser</button>
      </form>
    </main>
  </body>
</html>`;
}
