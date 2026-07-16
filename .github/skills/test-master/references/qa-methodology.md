# QA Methodology Reference

## Shift-Left Testing

Integrate testing early in the development cycle:

```
Requirements → Design → [TEST PLANNING] → Development → [UNIT TESTS] → Integration → [INTEGRATION TESTS] → Release → [E2E TESTS]
```

**Principles:**
- Test requirements before code is written
- Write tests alongside features, not after
- Automate everything that can be automated
- Fail fast — catch defects at the cheapest stage

## Test Pyramid

```
        /\
       /E2E\       ← Few, slow, expensive, high confidence
      /------\
     /Integr.\    ← Some, medium speed, medium confidence
    /----------\
   /Unit Tests\   ← Many, fast, cheap, low-level confidence
  /--------------\
```

**Ratio guideline:** 70% unit, 20% integration, 10% E2E

## Quality Gates

Define gates that must pass before promotion:

| Gate | Criteria | Blocking? |
|------|----------|-----------|
| Unit tests | 100% pass, >80% coverage | Yes |
| Integration tests | 100% pass | Yes |
| Lint | 0 errors | Yes |
| Security scan | 0 critical/high | Yes |
| E2E smoke | P0 flows pass | Yes |
| Performance | p95 < SLA | Yes |

## Continuous Testing

- Run unit tests on every commit
- Run integration tests on PR
- Run E2E on staging deploy
- Run performance tests nightly
- Run security scans on schedule

## Exploratory Testing

When to use:
- New feature exploration
- Complex user flows
- After automated tests pass
- Before major releases

Charter template:
```
Mission: Explore [feature/area] focusing on [aspect]
Timebox: 60 minutes
Approach: [Specific scenarios to try]
Report: Bugs found, questions raised, areas needing more testing
```

## Test Maintenance

- Review tests quarterly
- Remove obsolete tests
- Update tests when requirements change
- Refactor test code like production code
- Document test strategy changes
