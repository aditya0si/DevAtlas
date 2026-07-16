# TDD Iron Laws Reference

## The Three Laws of TDD

1. **Don't write production code until you have a failing test**
2. **Don't write more of a test than is sufficient to fail**
3. **Don't write more production code than is sufficient to pass the test**

## Red-Green-Refactor Cycle

```
┌─────────────────────────────────────────┐
│                                         │
│    ┌─────┐    ┌─────┐    ┌─────────┐   │
│    │ RED │───▶│GREEN│───▶│REFACTOR │   │
│    └─────┘    └─────┘    └─────────┘   │
│       ▲                          │      │
│       └──────────────────────────┘      │
│                                         │
└─────────────────────────────────────────┘
```

### RED — Write a Failing Test

```python
def test_calculate_total_with_tax():
    cart = Cart(items=[Item(price=100)])
    total = cart.calculate_total(tax_rate=0.1)
    assert total == 110  # Fails because calculate_total doesn't exist
```

### GREEN — Write Minimal Code to Pass

```python
class Cart:
    def calculate_total(self, tax_rate):
        return 110  # Minimal implementation
```

### REFACTOR — Improve Without Changing Behavior

```python
class Cart:
    def calculate_total(self, tax_rate):
        subtotal = sum(item.price for item in self.items)
        return subtotal * (1 + tax_rate)
```

## TDD for Different Levels

### Unit TDD

```python
# Test first
def test_user_creation_sets_defaults():
    user = User(email="test@example.com")
    assert user.is_active is True
    assert user.role == "user"

# Implementation
class User:
    def __init__(self, email):
        self.email = email
        self.is_active = True
        self.role = "user"
```

### Integration TDD

```python
# Test first
def test_user_repository_save_and_find():
    repo = UserRepository(db)
    user = User(email="test@example.com")
    repo.save(user)
    found = repo.find_by_email("test@example.com")
    assert found.email == "test@example.com"

# Implementation follows
```

## Common Rationalizations (And Responses)

| Excuse | Reality |
|--------|---------|
| "It's just a simple getter" | Simple code breaks too; test documents behavior |
| "I'll test it later" | Later never comes; test now or never |
| "TDD slows me down" | TDD speeds debugging; net time is less |
| "The test is trivial" | Trivial tests catch trivial bugs that matter |
| "I can't test this" | If you can't test it, the design needs work |

## TDD with Mocks

```python
def test_sends_welcome_email_on_signup():
    mockEmail = Mock()
    service = UserService(email_sender=mockEmail)
    
    service.signup("test@example.com")
    
    mockEmail.send.assert_called_once_with(
        to="test@example.com",
        subject="Welcome"
    )
```
