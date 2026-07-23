import { expect, test } from '@playwright/test';

test.describe('Consultation des recettes', () => {
  test('la page d’accueil liste les recettes', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Cahier de recette/);
    await expect(page.getByRole('heading', { name: 'Crêpes' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Bœuf bourguignon' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Salade de chèvre chaud' })).toBeVisible();
  });

  test('la recherche filtre les recettes', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('searchbox', { name: 'Rechercher' }).fill('farine');
    await expect(page.getByRole('heading', { name: 'Crêpes' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Salade de chèvre chaud' })).toBeHidden();
  });

  test('le filtre par tag fonctionne', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'dessert', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Crêpes' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Bœuf bourguignon' })).toBeHidden();
  });

  test('la page de détail affiche ingrédients et étapes', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('heading', { name: 'Crêpes' }).click();
    await expect(page).toHaveURL(/#\/recette\/crepes$/);
    await expect(page.getByRole('heading', { name: 'Crêpes', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ingrédients' })).toBeVisible();
    await expect(page.locator('.ingredients-panel')).toContainText('farine');
    await expect(page.locator('.steps li').first()).toContainText('Mélanger');
    await expect(page.getByRole('button', { name: 'Télécharger le .cook' })).toBeVisible();
  });

  test('la source Cooklang est consultable', async ({ page }) => {
    await page.goto('/#/recette/crepes');
    await page.getByRole('button', { name: 'Voir la source Cooklang' }).click();
    await expect(page.locator('.source-view')).toContainText('@farine{250%g}');
  });

  test('faire varier le nombre de personnes met à l’échelle les ingrédients', async ({ page }) => {
    await page.goto('/#/recette/crepes');
    const flour = page.locator('.ingredients-panel li', { hasText: 'farine' });
    await expect(flour).toContainText('250 g');

    // Crêpes : 4 personnes de base → doubler pour 8 personnes.
    await page.getByRole('button', { name: 'Augmenter le nombre de personnes' }).click();
    await page.getByRole('button', { name: 'Augmenter le nombre de personnes' }).click();
    await page.getByRole('button', { name: 'Augmenter le nombre de personnes' }).click();
    await page.getByRole('button', { name: 'Augmenter le nombre de personnes' }).click();

    await expect(page.getByRole('spinbutton', { name: 'Nombre de personnes' })).toHaveValue('8');
    await expect(flour).toContainText('500 g');
    await expect(page.locator('.steps')).toContainText('oeufs (6)');
  });
});
