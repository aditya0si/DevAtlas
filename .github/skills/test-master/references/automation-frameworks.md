# Automation Frameworks Reference

## Framework Selection

| Framework | Language | Best For |
|-----------|----------|----------|
| Jest | JavaScript/TypeScript | Unit, integration |
| Vitest | JavaScript/TypeScript | Fast unit tests |
| pytest | Python | All levels |
| Playwright | Multi-language | E2E, multi-browser |
| Cypress | JavaScript | E2E, component |
| k6 | JavaScript | Performance/load |
| Artillery | YAML/JS | Load testing |

## Page Object Pattern (E2E)

```typescript
// pages/LoginPage.ts
export class LoginPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/login');
  }

  async login(email: string, password: string) {
    await this.page.fill('[data-testid=email]', email);
    await this.page.fill('[data-testid=password]', password);
    await this.page.click('[data-testid=submit]');
  }

  async getError() {
    return this.page.locator('[data-testid=error]').textContent();
  }
}

// Usage in test
test('login fails with wrong password', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.login('user@test.com', 'wrong');
  await expect(await loginPage.getError()).toContain('Invalid credentials');
});
```

## Test Fixtures and Factories

```python
# factories.py
import factory
from app.models import User

class UserFactory(factory.Factory):
    class Meta:
        model = User
    
    email = factory.Sequence(lambda n: f'user{n}@example.com')
    name = factory.Faker('name')
    is_active = True

# Usage
@pytest.fixture
def user():
    return UserFactory()

@pytest.fixture
def admin_user():
    return UserFactory(is_admin=True)
```

## CI/CD Integration

```yaml
# GitHub Actions example
name: Test
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm test -- --coverage
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: coverage
          path: coverage/
```

## Scaling Test Automation

- Parallelize tests across workers
- Use test containers for isolated environments
- Implement test data management strategy
- Tag tests by priority for selective runs
- Monitor test execution times
