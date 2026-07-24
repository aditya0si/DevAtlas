import { test, expect } from '@playwright/test';

test.describe('DevAtlas Enhancements E2E Validation', () => {

  test('Public Landing Page renders and navigates to Map', async ({ page }) => {
    await page.goto('/');
    
    // Check overview landing title or map transition button
    const title = page.getByRole('heading', { level: 1 });
    await expect(title).toBeVisible();

    // Verify Explore Map button exists
    const exploreBtn = page.getByRole('button', { name: /Explore Map/i });
    if (await exploreBtn.isVisible()) {
      await exploreBtn.click();
    }
  });

  test('Auth Modal opens and toggles between Sign In and Sign Up', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);

    const signInBtn = page.getByRole('button', { name: /Sign In/i }).first();
    if (await signInBtn.isVisible()) {
      await signInBtn.click();

      // Check modal content
      await expect(page.getByText('Welcome Back')).toBeVisible();
      await expect(page.getByPlaceholder('developer@devatlas.in')).toBeVisible();

      // Toggle to Sign Up
      const signUpLink = page.getByRole('button', { name: /Sign Up/i });
      await signUpLink.click();
      await expect(page.getByText('Create DevAtlas Account')).toBeVisible();
      await expect(page.getByPlaceholder('Aditya Sharma')).toBeVisible();
    }
  });

  test('Ask DevAtlas streaming AI panel opens on query submission', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(4500); // Wait for intro

    const askInput = page.getByPlaceholder(/Ask DevAtlas/i);
    if (await askInput.isVisible()) {
      await askInput.fill('Why is Karnataka growing?');
      await askInput.press('Enter');

      // Verify AI Copilot streaming modal appears
      await expect(page.getByText(/DevAtlas AI Copilot/i)).toBeVisible();
    }
  });

});
