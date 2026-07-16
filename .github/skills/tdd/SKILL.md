---
name: tdd
description: "Test-driven development. Use when the user wants to build features or fix bugs test-first, mentions 'red-green-refactor', or wants integration tests."
license: MIT
metadata:
  author: https://github.com/Jeffallan
  version: 1.0.0
  domain: quality
  triggers: tdd, test-driven, red-green-refactor, test-first, integration tests, write tests first
  roles: specialist
  scope: implementation
  output-format: code
  related-skills:
    - test-master
    - code-review
---

# Test-Driven Development

TDD is the red → green loop. This skill is the reference that makes that loop produce tests worth keeping: what a good test is, where tests go, the anti-patterns, and the rules of the loop.

Every section applies on every cycle — consult them before and during the loop, not after.

When exploring the codebase, read `CONTEXT.md` (if it exists) so test names and interface vocabulary match the project's domain language, and respect ADRs in the area you're touching.

## What a Good Test Is

Tests verify behavior through public interfaces, not implementation details. Code can change entirely; tests shouldn't.

A good test reads like a specification — "user can checkout with valid cart" tells you exactly what capability exists — and survives refactors because it doesn't care about internal structure.

See [tests.md](tests.md) for examples and [mocking.md](mocking.md) for mocking guidelines.

## Seams — Where Tests Go

A seam is the public boundary you test at: the interface where you observe behavior without reaching inside.

Tests live at seams, never against internals. Test only at pre-agreed seams.

Before writing any test, write down the seams under test and confirm them with the user. No test is written at an unconfirmed seam.

You can't test everything — agreeing the seams up front is how testing effort lands on the critical paths and complex logic instead of every edge case.

Ask: "What's the public interface, and which seams should we test?"

## Anti-Patterns

- **Implementation-coupled** — mocks internal collaborators, tests private methods, or verifies through a side channel (querying the database instead of using the interface). The tell: the test breaks when you refactor but behavior hasn't changed.
- **Tautological** — the assertion recomputes the expected value the way the code does (`expect(add(a, b)).toBe(a + b)`, a snapshot derived by hand the same way, a constant asserted equal to itself), so it passes by construction and can never disagree with the code. Expected values must come from an independent source of truth — a known-good literal, a worked example, the spec.
- **Horizontal slicing** — writing all tests first, then all implementation. Bulk tests verify imagined behavior: you test the shape of things rather than user-facing behavior, the tests go insensitive to real changes, and you commit to test structure before understanding the implementation.

Work in vertical slices instead — one test → one implementation → repeat, each test a tracer bullet that responds to what the last cycle taught you.

## Rules of the Loop

- **Red before green.** Write the failing test first, then only enough code to pass it. Don't anticipate future tests or add speculative features.
- **One slice at a time.** One seam, one test, one minimal implementation per cycle.
- **Refactoring is not part of the loop.** It belongs to the review stage (see the `code-review` skill), not the red → green implementation cycle.

## Constraints

### MUST DO

- Write the failing test before writing implementation
- Test behavior through public interfaces only
- Confirm seams with the user before writing tests
- Use vertical slices: one test → one implementation → repeat
- Keep tests independent and deterministic

### MUST NOT DO

- Mock internal collaborators or test private methods
- Write tautological tests that recompute expected values
- Write all tests first, then all implementation (horizontal slicing)
- Add speculative features "for the future"
- Let refactoring bleed into the red-green cycle

## Output Template

When running a TDD cycle, report:

```markdown
## TDD Cycle: [Feature/Bug Name]

**Seam:** [Public interface being tested]
**Test:** [What the test verifies]

### Red
[The failing test code]

### Green
[The minimal implementation code]

### Refactor
[Any cleanup needed — defer to code-review skill]
```

## Example Prompts

- "Let's build the checkout feature test-first."
- "Write a failing test for the bug we just discussed."
- "Help me refactor this module — start by reviewing the existing tests."
- "I want to add integration tests for the API layer."
