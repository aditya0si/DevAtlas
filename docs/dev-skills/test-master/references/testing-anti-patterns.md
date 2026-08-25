# Testing Anti-Patterns Reference

## Anti-Patterns to Avoid

### 1. Testing Implementation Details

```javascript
// ❌ Bad: Tests internal method
test('calls _validate internally', () => {
  const spy = jest.spyOn(service, '_validate');
  service.process(data);
  expect(spy).toHaveBeenCalled();
});

// ✅ Good: Tests observable behavior
test('rejects invalid data with 400', async () => {
  const response = await request(app).post('/api/process').send(invalidData);
  expect(response.status).toBe(400);
});
```

### 2. Flaky Tests

```javascript
// ❌ Bad: Depends on timing
test('completes in time', async () => {
  await processAsync();
  expect(Date.now() - start).toBeLessThan(100);
});

// ✅ Good: Test deterministic behavior
test('processes queue in order', async () => {
  await queue.add('first');
  await queue.add('second');
  expect(await queue.getNext()).toBe('first');
});
```

### 3. Test Interdependence

```javascript
// ❌ Bad: Tests depend on execution order
let sharedState;

test('sets state', () => { sharedState = 'set'; });
test('uses state', () => { expect(sharedState).toBe('set'); });

// ✅ Good: Each test is independent
test('sets and uses state', () => {
  const service = new Service();
  service.setState('set');
  expect(service.getState()).toBe('set');
});
```

### 4. Over-Mocking

```javascript
// ❌ Bad: Mock everything, test nothing
const mockA = jest.fn().mockReturnValue({});
const mockB = jest.fn().mockReturnValue({});
const mockC = jest.fn().mockReturnValue({});
const result = function(mockA, mockB, mockC);

// ✅ Good: Mock boundaries, test internals
const mockExternal = jest.fn();
const result = realFunction(mockExternal);
expect(result).toBeDefined();
```

### 5. Assertion-less Tests

```javascript
// ❌ Bad: No assertion
test('processes data', async () => {
  await processData(data);
});

// ✅ Good: Specific assertion
test('processes data and returns summary', async () => {
  const result = await processData(data);
  expect(result.count).toBe(3);
  expect(result.total).toBe(150);
});
```

### 6. Giant Test Methods

```javascript
// ❌ Bad: One test does everything
test('full user journey', async () => {
  // 50 lines of setup, action, and assertions
});

// ✅ Good: Focused tests
test('creates user', async () => { /* ... */ });
test('sends welcome email', async () => { /* ... */ });
test('adds to mailing list', async () => { /* ... */ });
```

### 7. Ignoring Flaky Tests

```bash
# ❌ Bad: Just re-run
pytest --reruns 5

# ✅ Good: Quarantine and fix
# 1. Tag flaky test: @pytest.mark.flaky
# 2. Run without flaky: pytest -m "not flaky"
# 3. Fix root cause (timing, async, shared state)
# 4. Re-enable
```

## Test Quality Checklist

- [ ] Test name describes behavior
- [ ] One logical assertion per test
- [ ] No test interdependence
- [ ] Mocks at boundaries only
- [ ] No hardcoded waits/sleeps
- [ ] Tests run in any order
- [ ] Tests pass consistently (no flakiness)
- [ ] Tests are fast (<100ms for unit tests)
- [ ] Error cases tested
- [ ] Edge cases covered
