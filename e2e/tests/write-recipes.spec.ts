import { expect, test } from '@playwright/test';
import { E2E_WRITE_TOKEN } from '../playwright.config.js';

const NEW_RECIPE = `---
title: Tarte aux pommes e2e
tags: [dessert]
---

Étaler la @pâte brisée{1} dans un #moule{}.

Disposer les @pommes{4} en tranches et saupoudrer de @sucre{50%g}.

Cuire au #four{} ~{35%minutes} à 180°C.
`;

test.describe('Écriture des recettes', () => {
  test('une écriture sans jeton est refusée', async ({ request }) => {
    const response = await request.post('/api/recipes', { data: { source: NEW_RECIPE } });
    expect(response.status()).toBe(401);
  });

  test('créer, consulter puis supprimer une recette', async ({ page, request }) => {
    const create = await request.post('/api/recipes', {
      data: { source: NEW_RECIPE },
      headers: { authorization: `Bearer ${E2E_WRITE_TOKEN}` },
    });
    expect(create.status()).toBe(201);
    const created = (await create.json()) as { slug: string };
    expect(created.slug).toBe('tarte-aux-pommes-e2e');

    // La nouvelle recette apparaît dans l'interface web.
    await page.goto('/');
    await page.getByRole('heading', { name: 'Tarte aux pommes e2e' }).click();
    await expect(page.locator('.ingredients-panel')).toContainText('pommes');

    // Et son fichier brut est immédiatement disponible.
    const raw = await request.get(`/recipes/${created.slug}.cook`);
    expect(raw.status()).toBe(200);

    const remove = await request.delete(`/api/recipes/${created.slug}`, {
      headers: { authorization: `Bearer ${E2E_WRITE_TOKEN}` },
    });
    expect(remove.status()).toBe(204);

    const gone = await request.get(`/api/recipes/${created.slug}`);
    expect(gone.status()).toBe(404);
  });
});
