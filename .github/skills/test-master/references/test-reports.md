# Test Reports Reference

## Test Plan Template

```markdown
# Test Plan: [Feature/Release Name]

**Date:** YYYY-MM-DD
**Tester:** [Name]
**Environment:** [Staging/Production-like]

## Scope

### In Scope
- [Feature 1]
- [Feature 2]

### Out of Scope
- [Excluded item 1]

## Test Cases

| ID | Description | Type | Priority | Status |
|----|-------------|------|----------|--------|
| TC-001 | [Test case] | Unit/Integration/E2E | P0/P1/P2 | Pass/Fail/Block |

## Results Summary

- Total: X
- Passed: X
- Failed: X
- Blocked: X
- Skipped: X

## Coverage

- Unit: X%
- Integration: X%
- E2E: X%

## Defects Found

| ID | Severity | Description | Steps to Reproduce |
|----|----------|-------------|---------------------|
| DEF-001 | Critical/High/Med/Low | [Description] | 1. ... 2. ... |

## Sign-off

- [ ] All P0 tests pass
- [ ] Critical defects resolved
- [ ] Coverage targets met
```

## Defect Report Template

```markdown
# Defect Report: DEF-001

**Severity:** Critical/High/Medium/Low
**Priority:** P0/P1/P2
**Status:** Open/In Progress/Resolved

## Description
[Clear description of the defect]

## Steps to Reproduce
1. [Step 1]
2. [Step 2]
3. [Step 3]

## Expected Result
[What should happen]

## Actual Result
[What actually happens]

## Environment
- OS: [Windows 11]
- Browser: [Chrome 120]
- Version: [1.2.3]

## Screenshots/Logs
[Attach evidence]

## Root Cause Analysis
[If known]

## Fix Recommendation
[Suggested fix]
```

## Severity Definitions

| Severity | Description | Examples |
|----------|-------------|----------|
| Critical | System down, data loss, security breach | Auth bypass, data corruption |
| High | Major feature broken, no workaround | Payment failure, crash on startup |
| Medium | Feature impaired, workaround exists | UI glitch, slow performance |
| Low | Minor issue, cosmetic | Typo, alignment issue |
| Informational | Enhancement or suggestion | UX improvement |

## Coverage Report Template

```markdown
# Coverage Report

## Summary
- Total lines: X
- Covered: X
- Coverage: X%

## Gaps

| File | Uncovered Lines | Risk | Recommendation |
|------|-----------------|------|----------------|
| [file.ts] | 45-67 | High | Add tests for error handling |
| [file.ts] | 123-145 | Low | Edge case, low priority |

## Action Items
1. [ ] Add tests for [module]
2. [ ] Increase coverage target to X%
```
