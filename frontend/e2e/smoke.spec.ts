import { test, expect, Page } from '@playwright/test';

/**
 * DevAtlas — smoke test for the SHIPPED artifact.
 *
 * Runs against the static export in `out/` served by `serve` (see
 * playwright.config.ts), i.e. the exact bytes that get deployed — NOT `next dev`.
 *
 * Deliberately executed with NO `NEXT_PUBLIC_FIREBASE_*` env vars: a freshly
 * deployed bundle whose data source is empty/unreachable must still render its
 * shell and degrade gracefully instead of white-screening. That empty-data state
 * is what this file locks down.
 *
 * It intentionally asserts nothing about `/api/v1/*` or live Firestore payloads —
 * the shipped frontend reads Firestore directly, so the API-shaped specs that
 * used to live in this directory were verifying an integration that no longer
 * exists and never ran in CI.
 */

/** Attach a listener and return the mutable list of uncaught page errors. */
function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

const pageErrorsMessage = (errors: string[]) =>
  `uncaught page errors during boot:\n${errors.join('\n')}`;

test.describe('static export smoke (no Firestore config, empty data)', () => {
  test('renders the hero shell and mounts the map container without uncaught errors', async ({ page }) => {
    const pageErrors = collectPageErrors(page);

    const response = await page.goto('/');
    expect(response?.status(), 'the exported index.html must be served').toBe(200);

    // 1. Hero title — rendered into the export and visible on first paint.
    const hero = page.locator('h1', { hasText: 'DevAtlas' }).first();
    await expect(hero).toBeVisible();
    await expect(hero).toHaveText(/DevAtlas/);
    await expect(page).toHaveTitle(/DevAtlas/);

    // 2. Map container — DeveloperMap is `dynamic(..., { ssr: false })`, so this
    //    element only exists after hydration; its presence proves the client
    //    bundle booted and the map component mounted.
    const mapContainer = page.locator('#devatlas-map');
    await expect(mapContainer).toBeAttached({ timeout: 30_000 });
    await expect(mapContainer).toBeVisible();

    // 3. No uncaught page error while booting.
    expect(pageErrors, pageErrorsMessage(pageErrors)).toEqual([]);
  });

  test('shows the graceful empty-data state instead of crashing', async ({ page }) => {
    const pageErrors = collectPageErrors(page);

    await page.goto('/');

    // Bottom-dock statistics are Firestore-backed; with no data reachable they
    // must render the placeholder rows, not a crash.
    for (const label of ['Repositories', 'Developers', 'Stars', 'Events']) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }

    // The live ticker is derived from those stats; with no stats it must show its
    // honest empty-state copy rather than fabricated content.
    const ticker = page.getByTestId('live-ticker');
    await expect(ticker).toBeVisible();
    await expect(ticker).toContainText(/Live ecosystem data will appear/i);

    expect(pageErrors, pageErrorsMessage(pageErrors)).toEqual([]);
  });
});
