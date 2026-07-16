# Common Debugging Patterns

Recognizable bug patterns and their typical causes.

## Off-by-One Errors

**Symptoms:** Array index out of bounds, fencepost problems, boundary condition failures.

**Common causes:**
- Loop condition uses `<=` instead of `<`
- Zero-index vs one-index confusion
- Inclusive vs exclusive range endpoints

**Detection:**
```python
# Suspect when:
for i in range(len(items) + 1):  # Should be range(len(items))
for i in range(1, len(items)):   # Should start at 0?
```

## Null / Undefined Reference

**Symptoms:** `NullPointerException`, `TypeError: Cannot read property 'x' of undefined`, segmentation fault.

**Common causes:**
- Uninitialized variable
- Function returned null unexpectedly
- Async operation not completed before access
- Missing required field in API response

**Detection:**
```javascript
// Suspect when:
const user = getUser(id);
console.log(user.name);  // user might be null

// Fix:
const user = getUser(id) ?? {};
console.log(user?.name);
```

## Race Conditions

**Symptoms:** Intermittent failures, works sometimes but not others, timing-dependent bugs.

**Common causes:**
- Shared mutable state without synchronization
- Async operations completing in unexpected order
- Database transactions not properly isolated

**Detection:**
```python
# Suspect when:
# - Bug only appears under load
# - Adding logging/breakpoints makes bug disappear (Heisenbug)
# - Tests pass individually but fail in parallel

# Reproduce with stress test:
for _ in range(1000):
    threading.Thread(target=critical_section).start()
```

## Memory Leaks

**Symptoms:** Gradual performance degradation, out-of-memory crashes, increasing memory usage over time.

**Common causes:**
- Event listeners not removed
- Caches without eviction policy
- Circular references preventing GC
- Unclosed file handles / database connections

**Detection:**
```python
# Python: tracemalloc
import tracemalloc
tracemalloc.start()
# ... run code ...
snapshot = tracemalloc.take_snapshot()
for stat in snapshot.statistics('lineno')[:10]:
    print(stat)

# Node.js: --inspect + Chrome DevTools Memory tab
# Browser: Performance → Memory
```

## State Mutation Bugs

**Symptoms:** Data changes unexpectedly, side effects in pure functions, state carries over between tests.

**Common causes:**
- Modifying input parameters instead of copying
- Shared mutable default arguments
- Class-level mutable state

**Detection:**
```python
# Suspect when:
def process(items=[]):  # Mutable default — shared across calls!
    items.append("new")
    return items

# Fix:
def process(items=None):
    if items is None:
        items = []
    items.append("new")
    return items
```

## Configuration / Environment Issues

**Symptoms:** Works locally but not in production, different behavior across environments.

**Common causes:**
- Hardcoded paths or URLs
- Missing environment variables
- Different dependency versions
- Case-sensitive filesystem differences (Windows vs Linux)

**Detection:**
```bash
# Compare environments:
pip freeze > local.txt
# On server:
pip freeze > server.txt
diff local.txt server.txt

# Check env vars:
env | sort  # Linux/Mac
Get-ChildItem Env: | Sort-Object Name  # PowerShell
```

## Floating Point Precision

**Symptoms:** `0.1 + 0.2 !== 0.3`, rounding errors accumulate, equality checks fail.

**Common causes:**
- Binary floating point cannot represent decimal fractions exactly
- Accumulated rounding errors in loops

**Detection:**
```python
# Suspect when:
assert 0.1 + 0.2 == 0.3  # Fails!

# Fix: use decimal for financial calculations
from decimal import Decimal
assert Decimal("0.1") + Decimal("0.2") == Decimal("0.3")
```

## Timezone / Date Bugs

**Symptoms:** Dates off by hours, wrong day, inconsistent across users.

**Common causes:**
- Mixing naive and aware datetime objects
- Assuming local time vs UTC
- Daylight saving time edge cases

**Detection:**
```python
# Suspect when:
datetime.now()  # Returns local time, ambiguous
datetime.utcnow()  # Deprecated, returns naive UTC

# Fix:
from datetime import datetime, timezone
datetime.now(timezone.utc)  # Explicit UTC
```

## Concurrency Deadlocks

**Symptoms:** Program hangs indefinitely, threads/goroutines stuck, no progress.

**Common causes:**
- Lock ordering inversion (A waits for B, B waits for A)
- Forgetting to release locks
- Nested locks without timeout

**Detection:**
```python
# Suspect when:
# - Program hangs under specific load
# - Adding print statements "fixes" it (timing change)
# - Thread dump shows threads waiting on locks

# Python: faulthandler
import faulthandler
faulthandler.dump_traceback_later(30, repeat=True)
```

## API Contract Mismatches

**Symptoms:** 400/422 errors, missing fields, type errors from API responses.

**Common causes:**
- Frontend expects different field names than backend provides
- API version mismatch
- Missing null handling for optional fields

**Detection:**
```typescript
// Suspect when:
interface User {
  name: string;
  email: string;
}
// But API returns:
{ name: "John", email: null, phone: "+123" }

// Fix: align types with actual API response
interface User {
  name: string;
  email: string | null;
  phone?: string;
}
```

## Regex Catastrophic Backtracking

**Symptoms:** Regex matching hangs indefinitely, CPU at 100%, timeout errors.

**Common causes:**
- Nested quantifiers: `(a+)+b`
- Overlapping alternation: `(a|a)*b`
- Unanchored patterns on large input

**Detection:**
```python
# Suspect when:
re.match(r'(a+)+b', 'a' * 30 + 'c')  # Hangs!

# Fix: use atomic groups or possessive quantifiers
# Python: use regex module with atomic groups
# Or rewrite regex to avoid nested quantifiers
```

## Path Traversal / Security Bugs

**Symptoms:** Users can access files outside intended directory, unexpected file access.

**Common causes:**
- Not sanitizing user-provided file paths
- Using `..` sequences to escape directory
- Symlink following

**Detection:**
```python
# Suspect when:
filepath = request.GET['file']
with open(f'/uploads/{filepath}') as f:  # Dangerous!

# Fix:
import os
safe_path = os.path.basename(filepath)  # Strip directory components
with open(f'/uploads/{safe_path}') as f:
```
