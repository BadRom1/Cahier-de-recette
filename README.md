# Cahier de recette

Serveur et application web pour des recettes écrites en [Cooklang](https://cooklang.org),
consultables par des humains (web, application mobile Cooklang) et par des agents IA (MCP).

- **Lecture publique** : API REST, fichiers `.cook` bruts, interface web, outils MCP.
- **Écriture protégée** : toutes les mutations exigent un jeton (`WRITE_TOKEN`).
- **DDD & architecture hexagonale** : domaine pur, use cases, adaptateurs interchangeables,
  règles vérifiées automatiquement par des tests d'architecture.

## Démarrage rapide

```bash
corepack enable          # active pnpm
pnpm install
cp .env.example .env     # puis renseigner WRITE_TOKEN
pnpm dev                 # serveur sur :3000, web (Vite) sur :5173
```

Le serveur seed automatiquement les recettes d'exemple de [`recipes/`](recipes/) quand son
répertoire de données est vide.

## Interfaces exposées

| Interface               | URL                                          | Auth                        |
| ----------------------- | -------------------------------------------- | --------------------------- |
| Application web         | `/`                                          | —                           |
| API REST                | `/api/recipes`                               | écriture seulement          |
| Fichiers Cooklang bruts | `/recipes/<slug>.cook`, `/recipes/index.txt` | —                           |
| MCP (Streamable HTTP)   | `/mcp`                                       | outils d'écriture seulement |
| Santé                   | `/api/health`                                | —                           |

### API REST

```
GET    /api/recipes             # liste (querystring: ?q=texte&tag=dessert)
GET    /api/recipes/:slug       # détail parsé + source Cooklang
POST   /api/recipes             # { source, slug? }         — Bearer WRITE_TOKEN
PUT    /api/recipes/:slug       # { source }                — Bearer WRITE_TOKEN
DELETE /api/recipes/:slug       #                           — Bearer WRITE_TOKEN
```

Exemple d'écriture :

```bash
curl -X POST https://<hote>/api/recipes \
  -H "Authorization: Bearer $WRITE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"source": ">> title: Riz sauté\n\nFaire revenir le @riz{200%g} dans le #wok{}."}'
```

Le `slug` est dérivé du titre si absent. Les erreurs sont typées :
`400 INVALID_RECIPE_SLUG`, `404 RECIPE_NOT_FOUND`, `409 RECIPE_ALREADY_EXISTS`,
`422 INVALID_RECIPE_SOURCE`, `401 UNAUTHORIZED`, `503 WRITES_DISABLED`.

### MCP (agents IA)

Le serveur expose un endpoint [MCP](https://modelcontextprotocol.io) **Streamable HTTP**
sur `/mcp`, sans état (scalable horizontalement).

Outils : `list_recipes`, `search_recipes`, `get_recipe` (publics) ;
`create_recipe`, `update_recipe`, `delete_recipe` (jeton requis, via l'en-tête
`Authorization: Bearer …` ou l'argument `token`). Les recettes sont aussi exposées
comme ressources MCP (`cooklang://recipes/<slug>`).

Exemple de configuration client (Claude Code) :

```bash
claude mcp add --transport http cahier-de-recette https://<hote>/mcp \
  --header "Authorization: Bearer $WRITE_TOKEN"   # en-tête facultatif, requis pour écrire
```

### Application mobile Cooklang (Android / iOS)

Chaque recette est servie **au format Cooklang brut** :

- `https://<hote>/recipes/<slug>.cook` — importable directement dans l'application
  (partager le lien vers l'app ou utiliser sa fonction d'import d'URL) ;
- `https://<hote>/recipes/index.txt` — index texte de toute la collection, une URL par ligne,
  pratique pour scripter une synchronisation locale (les fichiers du serveur sont de simples
  `.cook` : on peut aussi synchroniser le volume par `rsync`/Syncthing vers le dossier
  de l'application).

## Architecture

Architecture hexagonale (ports & adapters), organisée en trois couches — voir
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) :

```
apps/server/src/
├── domain/          # agrégat Recipe, value objects, événements — zéro dépendance
├── application/     # use cases + ports (interfaces) — zéro framework
├── infrastructure/  # adaptateurs : HTTP (Fastify), MCP, parsing (cooklang-rs), fichiers
└── main.ts          # composition root
```

Les règles de dépendance sont **testées** par dependency-cruiser (`pnpm arch`) :
le domaine n'importe rien, l'application n'importe pas l'infrastructure, pas de cycles,
pas de modules orphelins.

## Qualité & outillage

| Outil              | Rôle                            | Commande                                   |
| ------------------ | ------------------------------- | ------------------------------------------ |
| oxlint             | lint (rapide, Rust)             | `pnpm lint`                                |
| Prettier           | formatage                       | `pnpm format` / `pnpm format:check`        |
| dependency-cruiser | tests d'architecture            | `pnpm arch`                                |
| secretlint         | détection de secrets            | `pnpm secrets`                             |
| TypeScript strict  | typage                          | `pnpm typecheck`                           |
| Vitest             | tests unitaires & intégration   | `pnpm test:unit` / `pnpm test:integration` |
| Playwright         | tests e2e (web + API + MCP)     | `pnpm test:e2e`                            |
| lefthook           | hooks git pre-commit / pre-push | installés via `pnpm install`               |

`pnpm verify` enchaîne l'ensemble. Les hooks git exécutent lint + format + secrets sur les
fichiers stagés (pre-commit) puis typecheck + architecture + tests unitaires (pre-push).

La CI GitHub Actions ([.github/workflows/ci.yml](.github/workflows/ci.yml)) rejoue tout :
qualité, tests unitaires/intégration, e2e Playwright, plus un job de démarrage en conditions
de production (même build et même commande de lancement que Railway).

## Déploiement sur Railway

Le déploiement utilise le **build natif Railway (Railpack)** — pas de Dockerfile — configuré
par [`railway.toml`](railway.toml) (`pnpm build`, démarrage `node apps/server/dist/main.js`,
healthcheck `/api/health`). Côté Railway :

1. créer un projet depuis ce dépôt GitHub ;
2. **monter un volume** (ex. sur `/data`) et définir `RECIPES_DIR=/data/recipes` — les
   `.cook` y sont stockés et survivent aux déploiements ;
3. définir la variable `WRITE_TOKEN` (ex. `openssl rand -hex 32`) ;
4. activer **« Wait for CI » (Check Suites)** dans les réglages du service : un push sur
   `main` n'est alors déployé que si le workflow GitHub Actions est vert.

Au premier démarrage sur un volume vide, les recettes d'exemple sont copiées automatiquement.

## Configuration

| Variable           | Défaut             | Description                                                       |
| ------------------ | ------------------ | ----------------------------------------------------------------- |
| `PORT` / `HOST`    | `3000` / `0.0.0.0` | écoute HTTP                                                       |
| `RECIPES_DIR`      | `./data/recipes`   | répertoire des `.cook` (volume en prod)                           |
| `SEED_RECIPES_DIR` | `./recipes`        | recettes copiées si `RECIPES_DIR` est vide (`""` pour désactiver) |
| `WRITE_TOKEN`      | —                  | jeton d'écriture ; **écritures désactivées si absent**            |
| `WEB_DIST_DIR`     | `./apps/web/dist`  | build web servi statiquement si le répertoire existe              |
| `LOG_LEVEL`        | `info`             | niveau de log (pino)                                              |
