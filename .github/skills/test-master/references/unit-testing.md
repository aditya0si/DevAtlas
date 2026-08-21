# Unit Testing Reference

## Principles

- One assertion concept per test
- Test behavior, not implementation
- Use descriptive test names that read as specifications
- Arrange-Act-Assert (AAA) pattern
- Keep tests independent and isolated

## Jest/Vitest Patterns

```javascript
describe('UserService', () => {
  let userService;
  let mockUserRepo;

  beforeEach(() => {
    mockUserRepo = {
      findById: jest.fn(),
      save: jest.fn(),
    };
    userService = new UserService(mockUserRepo);
  });

  it('returns user when found by id', async () => {
    // Arrange
    const mockUser = { id: 1, name: 'Test' };
    mockUserRepo.findById.mockResolvedValue(mockUser);

    // Act
    const result = await userService.getUser(1);

    // Assert
    expect(result).toEqual(mockUser);
    expect(mockUserRepo.findById).toHaveBeenCalledWith(1);
  });

  it('throws NotFoundError when user does not exist', async () => {
    mockUserRepo.findById.mockResolvedValue(null);

    await expect(userService.getUser(999)).rejects.toThrow('User not found');
  });

  it('validates email format before creating user', async () => {
    await expect(
      userService.createUser({ email: 'invalid' })
    ).rejects.toThrow('Invalid email format');
  });
});
```

## pytest Patterns

```python
import pytest
from unittest.mock import AsyncMock, MagicMock

class TestUserService:
    @pytest.fixture
    def user_service(self):
        mock_repo = MagicMock()
        return UserService(mock_repo)

    def test_returns_user_when_found(self, user_service):
        # Arrange
        mock_user = User(id=1, name="Test")
        user_service.user_repo.find_by_id.return_value = mock_user

        # Act
        result = user_service.get_user(1)

        # Assert
        assert result == mock_user
        user_service.user_repo.find_by_id.assert_called_once_with(1)

    def test_raises_not_found_when_user_missing(self, user_service):
        user_service.user_repo.find_by_id.return_value = None

        with pytest.raises(NotFoundError, match="User not found"):
            user_service.get_user(999)

    @pytest.mark.parametrize("email,expected", [
        ("valid@example.com", True),
        ("invalid", False),
        ("", False),
        (None, False),
    ])
    def test_email_validation(self, email, expected):
        assert UserService.validate_email(email) == expected
```

## Mocking Strategies

### Dependency Injection (Preferred)

```javascript
// Code under test accepts dependencies
class OrderService {
  constructor(paymentGateway, inventoryRepo) {
    this.payment = paymentGateway;
    this.inventory = inventoryRepo;
  }
}

// Test injects mocks
const mockPayment = { charge: jest.fn() };
const mockInventory = { reserve: jest.fn() };
const service = new OrderService(mockPayment, mockInventory);
```

### Module Mocking (When DI not available)

```javascript
jest.mock('./paymentGateway');
import { paymentGateway } from './paymentGateway';

paymentGateway.charge.mockResolvedValue({ success: true });
```

### Partial Mocks

```javascript
const mockFn = jest.fn();
const partialMock = {
  ...realModule,
  problematicFn: mockFn,
};
```

## Edge Cases to Always Test

- Empty inputs: `""`, `[]`, `{}`, `null`, `undefined`
- Boundary values: `0`, `-1`, `Number.MAX_VALUE`, empty string
- Invalid types: number instead of string, wrong object shape
- Concurrent access: simultaneous calls, race conditions
- Failure modes: network errors, timeouts, partial failures
