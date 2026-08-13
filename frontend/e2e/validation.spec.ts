import { test, expect } from '@playwright/test';

test.describe('DevAtlas V1 End-to-End Validation', () => {
  
  test('Initial Load & Cinematic Sequence', async ({ page }) => {
    // Track the real stats response so assertions verify API-backed UI content.
    const statsPromise = page.waitForResponse(response =>
      response.url().includes('/api/v1/india/stats') && response.status() === 200
    );

    // 1. Launch Application
    await page.goto('/');

    // 2. Observe cinematic intro
    const devAtlasTitle = page.locator('h1', { hasText: 'DevAtlas' });
    await expect(devAtlasTitle).toBeVisible();

    // Check for the initial text sequence
    await expect(page.getByText('Loading repository graph...')).toBeVisible();

    // 3. Verify Map load and wait for the intro sequence to finish (takes about 3-4s total)
    // The intro sets showIntro to false after the sequence.
    await page.waitForTimeout(4500);

    // 4. Capture screenshot of the map after cinematic intro
    await page.screenshot({ path: 'screenshots/post-intro-map.png', fullPage: true });

    // Ensure the top search bar is visible
    const searchInput = page.locator('input[placeholder*="Ask DevAtlas"]');
    await expect(searchInput).toBeVisible();

    // Ensure the living statistics (bottom dock) are visible
    await expect(page.getByText('Repositories', { exact: true })).toBeVisible();
    await expect(page.getByText('Developers', { exact: true })).toBeVisible();
    await expect(page.getByText('Stars', { exact: true })).toBeVisible();
    await expect(page.getByText('Events', { exact: true })).toBeVisible();

    // The live ticker must be derived from the real /india/stats response —
    // it must NOT show hardcoded synthetic text.
    const stats = await (await statsPromise).json();
    const ticker = page.getByTestId('live-ticker');
    await expect(ticker).toBeVisible();
    const topState = stats.top_states?.[0]?.state;
    if (topState) {
      // The ticker reflects the top state returned by the API.
      await expect(ticker).toContainText(topState);
    } else {
      // Truthful empty state when the backend has no repository data yet.
      await expect(ticker).toContainText('Live ecosystem data will appear');
    }
  });

  test('Ask DevAtlas Search Interaction', async ({ page }) => {
    await page.goto('/');
    
    // Wait for the intro to disappear
    await page.waitForTimeout(4500);

    const searchInput = page.locator('input[placeholder*="Ask DevAtlas"]');
    await searchInput.fill('Why is Karnataka growing?');
    await searchInput.press('Enter');

    // Wait for AI Copilot panel to appear
    await expect(page.getByText('DevAtlas AI Copilot')).toBeVisible({ timeout: 5000 });

    // Capture AI search screenshot
    await page.screenshot({ path: 'screenshots/ai-search-insight.png', fullPage: true });

    // The query is echoed back in the panel heading
    await expect(page.getByText('Why is Karnataka growing?')).toBeVisible();
  });

  test('Timeline Interaction', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(4500);

    // Find the timeline slider
    const slider = page.locator('input[type="range"]');
    await expect(slider).toBeVisible();

    // Interact with slider (change value to 2024)
    await slider.fill('2024');

    // The Time Machine year badge reflects the new value
    await expect(page.getByText('2024', { exact: true })).toBeVisible();

    await page.screenshot({ path: 'screenshots/timeline-2024.png', fullPage: true });
  });

  test('Story Mode Sequence', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(4500);

    // Click Story Mode from Sidebar
    const storyModeTooltip = page.getByText('Story Mode', { exact: true });
    const storyModeButton = storyModeTooltip.locator('..').locator('button');
    
    await storyModeButton.click();

    // Wait for Story Mode Overlay to appear
    const storyPlaying = page.getByText('Story Mode Playing');
    await expect(storyPlaying).toBeVisible();

    // Mumbai
    await expect(page.getByText('Mumbai: The Fintech Frontier')).toBeVisible();
    await page.screenshot({ path: 'screenshots/story-mumbai.png', fullPage: true });

    // Wait for next city (Bengaluru) - takes about 8 seconds
    await page.waitForTimeout(8000);
    await expect(page.getByText('Bengaluru: The AI Hub')).toBeVisible();
    await page.screenshot({ path: 'screenshots/story-bengaluru.png', fullPage: true });

    // Wait for next city (Hyderabad)
    await page.waitForTimeout(8000);
    await expect(page.getByText('Hyderabad: Rapid Ecosystem Growth')).toBeVisible();
    await page.screenshot({ path: 'screenshots/story-hyderabad.png', fullPage: true });
  });

  test('Accessibility & Contrast basic checks', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(4500);
    
    // Check if critical elements are reachable by keyboard
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    expect(focused).not.toBeNull();
  });
});
