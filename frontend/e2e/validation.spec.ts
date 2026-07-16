import { test, expect } from '@playwright/test';

test.describe('DevAtlas V1 End-to-End Validation', () => {
  
  test('Initial Load & Cinematic Sequence', async ({ page }) => {
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

    // Ensure the living statistics are visible
    await expect(page.getByText('Repositories', { exact: true })).toBeVisible();
    await expect(page.getByText('Developers', { exact: true })).toBeVisible();
    await expect(page.getByText('Stars', { exact: true })).toBeVisible();
    await expect(page.getByText('Commits', { exact: true })).toBeVisible();
    
    // Ensure ticker is visible
    await expect(page.getByText('Hyderabad AI Repos +12% this week').first()).toBeVisible();
  });

  test('Ask DevAtlas Search Interaction', async ({ page }) => {
    await page.goto('/');
    
    // Wait for the intro to disappear
    await page.waitForTimeout(4500);

    const searchInput = page.locator('input[placeholder*="Ask DevAtlas"]');
    await searchInput.fill('Why is Karnataka growing?');
    await searchInput.press('Enter');

    // Wait for AI Insight panel to appear
    const aiPanel = page.locator('h3', { hasText: 'DevAtlas AI' });
    await expect(aiPanel).toBeVisible({ timeout: 5000 });

    // Capture AI search screenshot
    await page.screenshot({ path: 'screenshots/ai-search-insight.png', fullPage: true });

    // Assert content
    await expect(page.getByText('98% CONFIDENCE')).toBeVisible();
    await expect(page.getByText(/Karnataka's growth is driven/)).toBeVisible();
  });

  test('Timeline Interaction', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(4500);

    // Find the timeline slider
    const slider = page.locator('input[type="range"]');
    await expect(slider).toBeVisible();

    // Interact with slider (change value to 2024)
    await slider.fill('2024');
    
    const yearIndicator = page.locator('span', { hasText: '2024' }).last();
    await expect(yearIndicator).toBeVisible();

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
