import { test, expect } from '@playwright/test';

test.describe('DevAtlas Enhancements E2E Validation', () => {

  test('Public Landing Page renders and navigates to Map', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(4500); // wait for the cinematic intro

    // Navigate to the Overview screen (landing page)
    await page.getByRole('button', { name: 'Overview' }).click();

    // Check overview landing title
    await expect(page.getByRole('heading', { level: 1, name: 'DevAtlas India' })).toBeVisible();

    // Verify Explore Map button navigates back to the map
    const exploreBtn = page.getByRole('button', { name: /Explore Map/i });
    await expect(exploreBtn).toBeVisible();
    await exploreBtn.click();

    // Back on the map screen: the Developer Map canvas is visible
    await expect(page.locator('#devatlas-map')).toBeVisible();
  });

  test('Auth Modal opens and toggles between Sign In and Sign Up', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(4500);

    const signInBtn = page.getByRole('button', { name: /Sign In/i }).first();
    await expect(signInBtn).toBeVisible();
    await signInBtn.click();

    // Check modal content
    await expect(page.getByText('Welcome Back')).toBeVisible();
    await expect(page.getByPlaceholder('developer@devatlas.in')).toBeVisible();

    // Toggle to Sign Up
    await page.getByRole('button', { name: /Sign Up/i }).click();
    await expect(page.getByText('Create DevAtlas Account')).toBeVisible();
    await expect(page.getByPlaceholder('Aditya Sharma')).toBeVisible();
  });

  test('Ask DevAtlas streaming AI panel opens on query submission', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(4500); // Wait for intro

    const askInput = page.getByPlaceholder(/Ask DevAtlas/i);
    await expect(askInput).toBeVisible();
    await askInput.fill('Why is Karnataka growing?');
    await askInput.press('Enter');

    // Verify AI Copilot streaming modal appears
    await expect(page.getByText(/DevAtlas AI Copilot/i)).toBeVisible();
  });

});
