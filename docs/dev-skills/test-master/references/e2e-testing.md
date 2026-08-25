# E2E Testing Reference

## Strategy

- Test critical user journeys, not every feature
- Use production-like data and environment
- Keep tests independent and idempotent
- Prioritize by business criticality

## Playwright Patterns

```typescript
import { test, expect } from '@playwright/test';

test.describe('Checkout flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.fill('[data-testid=email]', 'test@example.com');
    await page.click('[data-testid=login]');
  });

  test('completes purchase with valid payment', async ({ page }) => {
    await page.click('[data-testid=product-1]');
    await page.click('[data-testid=add-to-cart]');
    await page.click('[data-testid=checkout]');

    await page.fill('[data-testid=card-number]', '4242424242424242');
    await page.fill('[data-testid=expiry]', '12/30');
    await page.fill('[data-testid=cvc]', '123');
    await page.click('[data-testid=pay]');

    await expect(page.locator('[data-testid=confirmation]')).toBeVisible();
    await expect(page.locator('[data-testid=order-id]')).toContainText('ORD-');
  });

  test('shows error for declined payment', async ({ page }) => {
    await page.fill('[data-testid=card-number]', '4000000000000002');
    // ... complete checkout
    await expect(page.locator('[data-testid=error]')).toContainText('declined');
  });
});
```

## Cypress Patterns

```typescript
describe('Login', () => {
  it('logs in with valid credentials', () => {
    cy.visit('/login');
    cy.get('[data-cy=email]').type('user@example.com');
    cy.get('[data-cy=password]').type('password123');
    cy.get('[data-cy=submit]').click();
    cy.url().should('include', '/dashboard');
    cy.contains('Welcome back').should('be.visible');
  });
});
```

## User Flow Coverage

| Flow | Priority | Critical? |
|------|----------|-----------|
| User registration | P0 | Yes |
| Login/logout | P0 | Yes |
| Core feature (e.g., create order) | P0 | Yes |
| Profile update | P1 | No |
| Password reset | P1 | Yes |
| Search | P2 | No |

## Best Practices

- Use `data-testid` attributes, not CSS classes or text
- Wait for network idle or specific elements, not fixed timeouts
- Mock external APIs in E2E tests
- Run E2E in CI on PR merge, not every commit
- Keep E2E suite under 20 minutes
