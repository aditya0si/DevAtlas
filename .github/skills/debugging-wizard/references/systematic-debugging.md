# Systematic Debugging

Structured methodology for complex bugs and root cause analysis.

## The Five-Step Process

### 1. Reproduce

**Goal:** Establish consistent, reliable reproduction steps.

**Actions:**
- Document exact steps to trigger the bug
- Identify inputs, environment, and state required
- Create automated test that reproduces the issue
- Verify reproduction is 100% reliable (not intermittent)

**Template:**
```
Reproduction Steps:
1. [Action 1]
2. [Action 2]
3. [Expected result]
4. [Actual result]

Environment:
- OS: [Windows 11 / Ubuntu 22.04 / macOS 14]
- Version: [App version / commit hash]
- Browser: [Chrome 120 / Firefox 119]
- Database: [PostgreSQL 15]

Automated Test:
[Code or command that reproduces]
```

### 2. Isolate

**Goal:** Narrow down to smallest failing case.

**Actions:**
- Remove unrelated code
- Test individual components
- Use binary search on codebase
- Create minimal reproduction

**Techniques:**
- Comment out half the code, test
- Replace complex dependencies with mocks
- Test with different input data
- Check if bug exists in simplified version

### 3. Hypothesize and Test

**Goal:** Form testable theories, verify/disprove each one.

**Actions:**
- List all possible causes
- Rank by likelihood
- Design experiment for top hypothesis
- Run experiment
- Update hypothesis list

**Hypothesis Template:**
```
Hypothesis #1: [Specific claim]
Rationale: [Why this might be the cause]
Test: [How to verify]
Expected if true: [What you'd observe]
Expected if false: [What you'd observe]
Result: [Actual outcome]
Conclusion: [Confirmed / Rejected / Inconclusive]
```

### 4. Fix

**Goal:** Implement and verify solution.

**Actions:**
- Implement minimal fix
- Run reproduction test — must pass
- Run full test suite — must not break other tests
- Test edge cases
- Review fix for side effects

**Fix Checklist:**
- [ ] Reproduction test passes
- [ ] All existing tests pass
- [ ] Edge cases tested
- [ ] No new warnings or errors
- [ ] Code reviewed
- [ ] Performance not degraded

### 5. Prevent

**Goal:** Add tests/safeguards against regression.

**Actions:**
- Add regression test
- Add monitoring/alerting if applicable
- Update documentation
- Share findings with team

## Root Cause Analysis Techniques

### The 5 Whys

Ask "why" repeatedly to drill down to root cause.

**Example:**
```
Problem: Server crashed

Why #1: Why did server crash? → Out of memory
Why #2: Why out of memory? → Memory leak in user session cache
Why #3: Why memory leak? → Sessions never expired
Why #4: Why never expired? → Expiry job not running
Why #5: Why not running? → Cron job misconfigured (wrong timezone)

Root Cause: Cron job timezone mismatch
Fix: Update cron to use UTC
```

### Fishbone Diagram (Ishikawa)

Categorize potential causes:

```
                    Bug: Login fails for some users
                           |
        -------------------------------------------------
        |         |         |         |         |        |
    People    Process    Technology   Data    Environment  Management
        |         |         |         |         |        |
    Password   Session   Token     User     Timezone   Monitoring
    reset      timeout   expiry    data     differences  gaps
    flow       logic     logic     format             in logging
```

### Fault Tree Analysis

Top-down approach from failure to root causes.

```
                    [Login Fails]
                         |
            ------------------------------
            |                            |
    [Invalid Token]              [Valid Token]
            |                            |
    -----------                -------------------
    |         |                |                   |
[Expired]  [Malformed]    [User Not Found]    [DB Error]
```

## Handling Intermittent Bugs

### Characteristics of Intermittent Bugs

- Works sometimes, fails other times
- Adding logging/breakpoints makes it work (Heisenbug)
- Only fails under specific load or timing
- Passes in isolation, fails in integration

### Investigation Strategy

1. **Gather data:**
   - How often does it fail? (1 in 10? 1 in 1000?)
   - What conditions trigger it? (load, time of day, specific user?)
   - What's different when it fails vs succeeds?

2. **Increase observability:**
   - Add structured logging with timestamps
   - Log state at key points
   - Capture full context (request ID, user ID, environment)

3. **Stress test:**
   - Run reproduction in loop until failure
   - Increase load to trigger faster
   - Test with different timing (add delays)

4. **Check for race conditions:**
   - Shared mutable state
   - Async operations completing out of order
   - Database transaction isolation issues

5. **Use deterministic replay:**
   - Record execution with rr (Linux)
   - Replay to examine exact state at failure

## Complex Bug Investigation Template

```markdown
## Bug Report

**Title:** [One-line description]
**Severity:** [Critical / High / Medium / Low]
**Reporter:** [Name / Team]

## Reproduction

**Steps:**
1.
2.
3.

**Expected:** [What should happen]
**Actual:** [What actually happens]

**Frequency:** [Always / Sometimes / Rare]
**Environment:** [OS, version, browser, etc.]

## Investigation Log

### Attempt 1: [Date/Time]
**Hypothesis:** [What I think is wrong]
**Test:** [What I did to verify]
**Result:** [What happened]
**Conclusion:** [What I learned]

### Attempt 2: [Date/Time]
...

## Root Cause

**What:** [Specific code/logic causing issue]
**Why:** [Why it causes the bug]
**When introduced:** [Commit/version/date]

## Fix

**Change:** [What code to change]
**Why it works:** [Explanation]
**Side effects:** [Any unintended consequences]

## Prevention

**Test:** [Regression test to add]
**Monitoring:** [Alert to add]
**Documentation:** [What to document]
```

## Debugging Anti-Patterns to Avoid

### Shotgun Debugging

**What:** Making multiple changes at once hoping one fixes it.

**Why bad:** You don't learn which change fixed it, might introduce new bugs.

**Instead:** Change one thing, test, repeat.

### Blame-Driven Debugging

**What:** Assuming "this code is wrong" without evidence.

**Why bad:** Wastes time investigating wrong code, creates conflict.

**Instead:** Follow evidence, let data guide investigation.

### Debugging in Production Without Safeguards

**What:** Adding debug code, changing configs directly in production.

**Why bad:** Can make bugs worse, affect users, leave debug code behind.

**Instead:** Use feature flags, canary deployments, staging environment.

### Ignoring Intermittent Bugs

**What:** "It's probably a fluke, let's ship it."

**Why bad:** Intermittent bugs often indicate serious issues (race conditions, memory corruption).

**Instead:** Investigate root cause, add monitoring.

### Debugging Without Reproduction

**What:** Trying to fix bug you can't reliably reproduce.

**Why bad:** Can't verify fix works, might be fixing wrong thing.

**Instead:** Invest time in creating reliable reproduction first.

## Post-Mortem Template

```markdown
# Incident Post-Mortem: [Title]

**Date:** [YYYY-MM-DD]
**Duration:** [How long impact lasted]
**Severity:** [Critical / High / Medium / Low]
**Impact:** [Users affected, services impacted]

## Timeline

- HH:MM — [Event]
- HH:MM — [Event]
- HH:MM — [Event]

## Root Cause

[Detailed explanation of what caused the incident]

## Impact

- [Affected service/feature]
- [Number of users affected]
- [Data loss?]
- [Financial impact?]

## Resolution

[What was done to resolve]

## Action Items

- [ ] [Preventive action 1] — Owner: [Name] — Due: [Date]
- [ ] [Preventive action 2] — Owner: [Name] — Due: [Date]

## Lessons Learned

[What the team learned from this incident]
```

## Tools for Complex Debugging

### Process Inspection

```bash
# Linux: inspect running process
strace -p <pid> -f -tt  # System calls
ltrace -p <pid>          # Library calls
lsof -p <pid>            # Open files/sockets

# Windows: Process Explorer
# - View DLLs loaded
# - View handles
# - View threads
```

### Core Dump Analysis

```bash
# Generate core dump
ulimit -c unlimited  # Linux
./myprogram  # Crashes, creates core dump

# Analyze with gdb
gdb ./myprogram core
(gdb) bt  # Backtrace
(gdb) info locals  # Local variables at crash
```

### Network Packet Capture

```bash
# Capture traffic
tcpdump -i eth0 -w capture.pcap host api.example.com and port 443

# Analyze in Wireshark
wireshark capture.pcap
```

### Database Query Analysis

```sql
-- PostgreSQL: find slow queries
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Enable slow query log
ALTER SYSTEM SET log_min_duration_statement = 1000;
```

## When to Escalate

Escalate to senior engineer or specialist when:
- Bug involves critical production system
- Security implications suspected
- Multiple failed fix attempts
- Requires deep domain knowledge (compiler, kernel, database internals)
- Time-sensitive and you're stuck

**Escalation template:**
```
Need help with: [Brief description]
I've tried: [List of attempts]
Current hypothesis: [What you think is wrong]
Blocked because: [What you can't figure out]
Urgency: [How soon this needs to be fixed]
```
