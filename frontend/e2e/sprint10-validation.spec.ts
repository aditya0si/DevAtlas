import { test, expect, Page } from '@playwright/test';

/** Wait for the cinematic intro to finish so overlays/animations settle. */
async function waitForIntro(page: Page) {
  await page.goto('/');
  await page.waitForTimeout(4500);
}

test.describe('Sprint 10: Real-Time Data & API Validation', () => {

  test('Map renders real FeatureCollection points', async ({ page }) => {
    // Intercept the /api/v1/geospatial/activity endpoint to ensure it's called
    const responsePromise = page.waitForResponse(response =>
      response.url().includes('/api/v1/geospatial/activity') && response.status() === 200
    );

    await page.goto('/');

    const response = await responsePromise;
    const data = await response.json();

    // Validate it's a real FeatureCollection with real data
    expect(data.type).toBe('FeatureCollection');
    expect(Array.isArray(data.features)).toBeTruthy();
  });

  test('Developer Pulse shows live statistics', async ({ page }) => {
    // Intercept the /api/v1/india/stats endpoint
    const responsePromise = page.waitForResponse(response =>
      response.url().includes('/api/v1/india/stats') && response.status() === 200
    );

    await page.goto('/');
    await page.waitForTimeout(4500);

    const stats = await (await responsePromise).json();

    // Assert the live widgets are visible (bottom dock labels)
    await expect(page.getByText('Repositories', { exact: true })).toBeVisible();
    await expect(page.getByText('Developers', { exact: true })).toBeVisible();
    await expect(page.getByText('Stars', { exact: true })).toBeVisible();
    await expect(page.getByText('Events', { exact: true })).toBeVisible();

    if (stats.total_repositories > 0) {
      // Developer Pulse percentages are derived from the real stats response.
      await expect(page.getByText('Developer Pulse')).toBeVisible();
      const expectedAi = `+${Number(stats.ai_repo_percentage ?? 0).toFixed(1)}%`;
      await expect(page.getByText(expectedAi).first()).toBeVisible();
    } else {
      // No synthetic percentages are shown when the backend has no data.
      await expect(page.getByText('Developer Pulse')).toHaveCount(0);
    }
  });

  test('Filter pills refetch the map with the selected domain', async ({ page }) => {
    // Intercept a geospatial request that includes the AI domain filter
    const aiResponse = page.waitForResponse(response =>
      response.url().includes('/api/v1/geospatial/activity') &&
      response.url().includes('domain=ai') &&
      response.status() === 200
    );

    await waitForIntro(page);

    await page.getByRole('button', { name: 'AI', exact: true }).click();
    await aiResponse;

    // The active pill should receive the indigo "active" styling
    await expect(page.getByRole('button', { name: 'AI', exact: true })).toHaveClass(/bg-indigo-500\/20/);
  });

  test('Time Machine year change updates the indicator and refetches stats', async ({ page }) => {
    // Stats are refetched with the newly selected year
    const statsPromise = page.waitForResponse(response =>
      response.url().includes('/api/v1/india/stats') &&
      response.url().includes('year=2024') &&
      response.status() === 200
    );

    await waitForIntro(page);

    const slider = page.locator('input[type="range"]');
    await expect(slider).toBeVisible();
    await slider.fill('2024');

    // The Time Machine badge updates to the new year
    await expect(page.getByText('2024', { exact: true })).toBeVisible();

    // The ecosystem stats endpoint is called with year=2024
    await statsPromise;
  });

  test('Analytics screen renders API-backed graphs and comparison', async ({ page }) => {
    const graphsPromise = page.waitForResponse(response =>
      response.url().includes('/api/v1/india/analytics/graphs') && response.status() === 200
    );
    const comparePromise = page.waitForResponse(response =>
      response.url().includes('/api/v1/india/compare') && response.status() === 200
    );

    await waitForIntro(page);

    await page.getByRole('button', { name: 'Analytics' }).click();

    await expect(page.getByText('Ecosystem Analytics')).toBeVisible();
    await graphsPromise;
    await expect(page.getByText('Repositories Over Time')).toBeVisible();

    await comparePromise;
    await expect(page.getByText('State Comparison')).toBeVisible();
    await expect(page.getByText('AI Comparison Summary')).toBeVisible();
  });

  test('Comparison refetches when a state is changed', async ({ page }) => {
    await waitForIntro(page);
    await page.getByRole('button', { name: 'Analytics' }).click();

    // Wait for the initial comparison to render
    await expect(page.getByText('State A')).toBeVisible();
    await expect(page.getByText('State B')).toBeVisible();

    // Intercept the comparison request for the newly selected state B
    const comparePromise = page.waitForResponse(response =>
      response.url().includes('/api/v1/india/compare') &&
      response.url().includes('state_b=Pune') &&
      response.status() === 200
    );

    // Open the State B dropdown (its button shows the current value "Mumbai")
    await page.getByRole('button', { name: 'Mumbai', exact: true }).click();
    await page.getByRole('button', { name: 'Pune', exact: true }).click();

    await comparePromise;

    // The selector now reflects the new selection
    await expect(page.getByRole('button', { name: 'Pune', exact: true }).first()).toBeVisible();
  });

  test('Repository detail panel opens when clicking a map point', async ({ page }) => {
    const responsePromise = page.waitForResponse(response =>
      response.url().includes('/api/v1/geospatial/activity') && response.status() === 200
    );

    await page.goto('/');
    const response = await responsePromise;
    const data = await response.json();

    expect(data.type).toBe('FeatureCollection');

    // Wait for the cinematic intro to finish (map is interactable afterwards)
    await page.waitForTimeout(5500);

    if (!data.features || data.features.length === 0) {
      // No geolocated repositories in this environment - nothing to click.
      return;
    }

    const feature = data.features[0];
    const coords = feature.geometry.coordinates as [number, number];

    // Jump the camera to the feature so its circle layer is rendered/clickable.
    await page.evaluate(
      ([lon, lat]) => {
        const map = (window as any).__devatlasMap;
        if (map) {
          map.jumpTo({ center: [lon, lat], zoom: 9, pitch: 0, bearing: 0 });
        }
      },
      coords
    );

    // Let the new camera + tiles settle.
    await page.waitForTimeout(1500);

    // Compute the on-screen pixel position of the feature.
    const { x, y } = await page.evaluate(
      ([lon, lat]) => {
        const map = (window as any).__devatlasMap;
        const canvas = map.getCanvas();
        const rect = canvas.getBoundingClientRect();
        const pt = map.project([lon, lat]);
        return { x: rect.left + pt.x, y: rect.top + pt.y };
      },
      coords
    );

    await page.mouse.click(x, y);

    // The repository detail panel should open and load real repository data.
    await expect(page.getByText('View on GitHub').first()).toBeVisible({ timeout: 15000 });
  });
});
