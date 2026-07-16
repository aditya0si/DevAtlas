# Integration Testing Reference

## API Integration Testing

### Supertest (Node.js)

```javascript
import request from 'supertest';
import { app } from '../app';

describe('POST /api/users', () => {
  it('creates user and returns 201', async () => {
    const response = await request(app)
      .post('/api/users')
      .send({ email: 'test@example.com', name: 'Test' })
      .expect(201);

    expect(response.body).toMatchObject({
      email: 'test@example.com',
      name: 'Test',
    });
    expect(response.body.id).toBeDefined();
  });

  it('returns 409 for duplicate email', async () => {
    await request(app)
      .post('/api/users')
      .send({ email: 'test@example.com' });

    const response = await request(app)
      .post('/api/users')
      .send({ email: 'test@example.com' })
      .expect(409);

    expect(response.body.detail).toContain('already registered');
  });
});
```

### pytest + httpx (Python/FastAPI)

```python
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.fixture
async def client():
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test"
    ) as ac:
        yield ac

@pytest.mark.asyncio
async def test_create_user(client: AsyncClient):
    response = await client.post(
        "/api/users",
        json={"email": "test@example.com", "name": "Test"}
    )
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "test@example.com"
    assert "id" in data
```

## Database Integration

### Test Database Setup

```javascript
// Jest + PostgreSQL
beforeAll(async () => {
  await db.connect(testDbUrl);
});

afterAll(async () => {
  await db.disconnect();
});

beforeEach(async () => {
  await db.migrate.latest();
  await db.seed.run();
});

afterEach(async () => {
  await db.destroy();
});
```

### Transaction Rollback Pattern

```python
@pytest.fixture
async def db_session():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with TestingSessionLocal() as session:
        yield session
        await session.rollback()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
```

## Contract Testing

```javascript
// Verify API contract
describe('User API contract', () => {
  it('matches OpenAPI schema', async () => {
    const response = await request(app).get('/api/users/1');
    expect(response.body).toMatchSchema(UserResponseSchema);
  });
});
```

## Test Data Management

- Use factories/fixtures, not hardcoded values
- Clean up test data after each test
- Use unique identifiers to avoid collisions
- Seed required reference data (lookup tables, etc.)
