import { expect, test } from '@playwright/test';

test.describe('Accès pour l’application Cooklang (fichiers bruts)', () => {
  test('un fichier .cook brut est servi en texte', async ({ request }) => {
    const response = await request.get('/recipes/crepes.cook');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/plain');
    const body = await response.text();
    expect(body).toContain('title: Crêpes');
    expect(body).toContain('@farine{250%g}');
  });

  test('l’index brut liste toutes les recettes', async ({ request }) => {
    const response = await request.get('/recipes/index.txt');
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toContain('/recipes/crepes.cook');
    expect(body).toContain('/recipes/boeuf-bourguignon.cook');
  });
});
