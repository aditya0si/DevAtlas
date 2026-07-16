# Debugging Strategies

Systematic approaches to isolate and resolve bugs.

## Binary Search (Divide and Conquer)

**When to use:** Large codebase, unclear where bug originates.

**Method:**
1. Identify the range of code where bug could exist
2. Test the midpoint
3. Narrow to half where bug persists
4. Repeat until isolated

**Example:**
```python
# Bug appears somewhere in 1000-line file
# Add logging at line 500
# If bug occurs before line 500: search 1-500
# If bug occurs after line 500: search 501-1000
# Repeat: test at 250, 375, 312, etc.
```

## Git Bisect (Regression Hunting)

**When to use:** Bug introduced in recent commit, need to find exact commit.

**Method:**
```bash
git bisect start
git bisect bad HEAD
git bisect good v1.2.0  # Last known good version

# Git checks out midpoint commit
# Test: does bug exist?
git bisect bad  # or: git bisect good

# Repeat until git identifies first bad commit
git bisect reset
```

**Automated bisect:**
```bash
git bisect start HEAD v1.2.0
git bisect run ./test.sh  # Script exits 0 for good, 1 for bad
```

## Rubber Duck Debugging

**When to use:** Stuck, can't see obvious issue.

**Method:**
1. Explain code line-by-line to an imaginary listener (or actual rubber duck)
2. Articulate what each line *should* do
3. Often reveals the bug during explanation

**Why it works:** Forces explicit reasoning, breaks assumptions.

## Time Travel Debugging

**When to use:** Complex state changes, need to see how state evolved.

**Tools:**
- **rr (Mozilla):** Record execution, replay deterministically
  ```bash
  rr record ./myprogram
  rr replay
  ```
- **WinDbg Time Travel Debugging (Microsoft):** Record and replay Windows execution
- **Chrome DevTools:** "Enable custom formatters" + async call stacks

## Differential Debugging

**When to use:** Works in one environment, fails in another.

**Method:**
1. List all differences between working and broken environments
2. Change one difference at a time
3. Test after each change
4. The change that fixes/breaks is the cause

**Example differences:**
- Python version: 3.9 vs 3.11
- Dependency versions: `pip freeze` diff
- Environment variables
- OS: Windows vs Linux
- File encoding: UTF-8 vs Latin-1

## Minimal Reproduction

**When to use:** Complex bug, need to isolate for reporting or fixing.

**Method:**
1. Start with full failing code
2. Remove unrelated code piece by piece
3. Stop removing when bug disappears
4. Remaining code is minimal reproduction

**Goal:** Smallest possible code that demonstrates the bug.

## Hypothesis-Driven Debugging

**When to use:** Multiple possible causes, need systematic approach.

**Method:**
1. List all possible causes
2. Form testable hypothesis for each
3. Design experiment to prove/disprove
4. Run experiment
5. Update hypothesis list based on results
6. Repeat until root cause found

**Template:**
```
Hypothesis: [Specific claim about cause]
Test: [How to verify]
Expected if true: [What you'd see]
Expected if false: [What you'd see]
Result: [Actual outcome]
Conclusion: [Confirmed/Rejected]
```

## Logging Strategy

**When to use:** Intermittent bugs, production issues, async problems.

**Method:**
1. Add structured logging at key points
2. Include: timestamp, request ID, user ID, state
3. Use log levels: DEBUG, INFO, WARN, ERROR
4. Correlate logs across services with trace IDs

**Example:**
```python
import logging
logger = logging.getLogger(__name__)

def process_order(order_id):
    logger.debug(f"Processing order {order_id}", extra={
        "order_id": order_id,
        "user_id": get_current_user_id(),
        "timestamp": datetime.utcnow().isoformat()
    })
    # ...
```

## Stack Trace Analysis

**When to use:** Exception thrown, need to understand call path.

**Method:**
1. Read bottom-up: your code is at top, framework at bottom
2. Identify first frame in your code
3. Trace upward to see how you got there
4. Check parameters and state at that point

**Example:**
```
Traceback (most recent call last):
  File "app.py", line 42, in handle_request  ← YOUR CODE (start here)
    result = process(data)
  File "processor.py", line 18, in process
    return transform(item)
  File "transform.py", line 7, in transform
    return item.value  # AttributeError ← ROOT CAUSE
```

## Print Debugging (Strategic)

**When to use:** Quick investigation, no debugger available, production-safe logging.

**Method:**
1. Print at function entry/exit
2. Print before/after state changes
3. Print conditional branches taken
4. Use structured format for easy parsing

**Example:**
```python
def process(data):
    print(f"[DEBUG] process called with: {data=}")
    result = transform(data)
    print(f"[DEBUG] transform returned: {result=}")
    return result
```

**Cleanup:** Remove or convert to proper logging before committing.

## Differential Testing

**When to use:** Refactoring, need to ensure behavior unchanged.

**Method:**
1. Run old code, capture output/state
2. Run new code, capture output/state
3. Compare: should be identical
4. Any difference = potential bug or intentional change

**Example:**
```bash
# Capture old behavior
python old_version.py < input.txt > old_output.txt

# Run new version
python new_version.py < input.txt > new_output.txt

# Compare
diff old_output.txt new_output.txt
```

## Bisect with Feature Flags

**When to use:** Feature flag introduced bug, multiple flags active.

**Method:**
1. Disable all feature flags
2. Enable one at a time
3. Test after each enable
4. The flag that introduces bug is the cause

## Heap / Memory Analysis

**When to use:** Memory leaks, crashes, performance degradation.

**Tools:**
- **valgrind (C/C++):** `valgrind --leak-check=full ./myprogram`
- **heaptrack (Linux):** `heaptrack ./myprogram`
- **Instruments (macOS):** Allocations template
- **Chrome DevTools:** Memory → Heap Snapshot

**Method:**
1. Take baseline heap snapshot
2. Perform action suspected to leak
3. Take second snapshot
4. Compare: objects that increased = leak candidates

## Thread Dump Analysis

**When to use:** Application hangs, deadlocks, thread exhaustion.

**Java:**
```bash
jstack <pid> > thread_dump.txt
```

**Python:**
```python
import faulthandler
faulthandler.dump_traceback_later(30, repeat=True)
```

**Node.js:**
```bash
kill -USR1 <pid>  # Prints thread dump to stderr
```

**Analysis:**
- Look for threads in BLOCKED or WAITING state
- Identify lock contention
- Find circular wait patterns

## Network Debugging

**When to use:** API calls failing, timeout issues, data corruption.

**Tools:**
```bash
# tcpdump: capture packets
tcpdump -i eth0 -w capture.pcap port 5432

# curl: verbose HTTP debugging
curl -v https://api.example.com/endpoint

# Wireshark: GUI packet analysis
# Filter: http.request.method == "POST"

# netstat: check connections
netstat -an | grep :5432
```

## Database Query Debugging

**When to use:** Slow queries, wrong results, deadlocks.

**Method:**
1. Enable query logging
2. Capture slow queries
3. Analyze execution plan
4. Check for missing indexes, N+1 queries

**PostgreSQL:**
```sql
-- Enable slow query log
ALTER SYSTEM SET log_min_duration_statement = 1000;  -- ms
SELECT pg_reload_conf();

-- Analyze query
EXPLAIN ANALYZE SELECT * FROM users WHERE email = 'test@example.com';
```

## Reproduce in Isolation

**When to use:** Complex system, need to rule out external factors.

**Method:**
1. Create minimal test case
2. Remove all external dependencies
3. Use mock data instead of real database/API
4. Run in clean environment (Docker)

**Example:**
```python
# Instead of:
result = api.call(external_service, real_database.query())

# Use:
result = api.call(MockService(), MockDatabase().query())
```

## Change One Thing at a Time

**When to use:** Multiple variables could be causing issue.

**Method:**
1. Make ONE change
2. Test
3. If fixed: you found cause
4. If not fixed: revert change, try next hypothesis
5. Never make multiple changes simultaneously

**Why:** If you change 3 things and it works, you don't know which one fixed it.
