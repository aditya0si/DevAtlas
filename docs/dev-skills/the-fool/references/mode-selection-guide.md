# Mode Selection Guide

Use this guide to auto-recommend a mode when the user selects "You choose" or when context doesn't clearly point to one mode.

## Decision Tree

```
What is the user's goal?
│
├─ "I want to check if this is a good idea before committing"
│  └─ Recommend: Find the Failure Modes (pre-mortem)
│
├─ "I want to understand the risks and how to mitigate them"
│  └─ Recommend: Attack This (red team)
│
├─ "I want to challenge the reasoning or evidence"
│  └─ Recommend: Test the Evidence (falsification)
│
├─ "I want to explore what I'm assuming"
│  └─ Recommend: Expose My Assumptions (Socratic)
│
├─ "I want to hear the strongest argument against this"
│  └─ Recommend: Argue the Other Side (dialectic)
│
└─ "I want a comprehensive stress test"
   └─ Recommend: Attack This (red team) — broadest coverage
```

## Context-Based Recommendations

| Context | Recommended Mode | Rationale |
|---------|-----------------|-----------|
| New architecture/design | Attack This | Find adversarial attack vectors |
| Business strategy | Find the Failure Modes | Pre-mortem on strategic bets |
| Technical proposal | Test the Evidence | Falsify technical claims |
| Unclear requirements | Expose My Assumptions | Surface hidden assumptions |
| Controversial decision | Argue the Other Side | Steelman the opposition |
| Security-sensitive | Attack This | Adversarial perspective critical |
| Research/analysis | Test the Evidence | Evidence quality is key |
| Early-stage idea | Expose My Assumptions | Foundation needs checking |

## Mode Combinations

For complex topics, consider running multiple modes sequentially:

1. **Expose My Assumptions** — Surface what's taken for granted
2. **Test the Evidence** — Verify the factual claims
3. **Find the Failure Modes** — Stress-test the plan
4. **Argue the Other Side** — Challenge the conclusion
5. **Attack This** — Adversarial final check

## Quick Reference

| Mode | Best For | Time | Output |
|------|----------|------|--------|
| Expose My Assumptions | Early-stage ideas, unclear requirements | 5-10 min | Question inventory |
| Argue the Other Side | Controversial decisions, debates | 10-15 min | Counter-argument + synthesis |
| Find the Failure Modes | Plans before commitment | 10-15 min | Ranked risks + mitigations |
| Attack This | Security, adversarial contexts | 15-20 min | Threat model + defenses |
| Test the Evidence | Research, analysis, claims | 10-15 min | Evidence audit + grades |
