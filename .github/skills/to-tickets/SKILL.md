---
name: to-tickets
description: "Break a plan, spec, or the current conversation into a set of tracer-bullet tickets, each declaring its blocking edges, published to the configured tracker — edges as text in one file per ticket locally, or native blocking links on a real tracker."
license: MIT
metadata:
  author: https://github.com/Jeffallan
  version: 1.0.0
  domain: planning
  triggers: to-tickets, break down, create tickets, tracer bullet, vertical slices, issue breakdown, task breakdown
  roles: specialist
  scope: planning
  output-format: markdown
  related-skills:
    - to-spec
    - code-review
    - tdd
---

# To Tickets

Break a plan, spec, or conversation into a set of tickets — tracer-bullet vertical slices, each declaring the tickets that block it.

The issue tracker and triage label vocabulary should have been provided to you. Run `/setup-matt-pocock-skills` if not.

## Process

### 1. Gather Context

Work from whatever is already in the conversation context. If the user passes a reference (a spec path, an issue number or URL) as an argument, fetch it and read its full body and comments.

### 2. Explore the Codebase (Optional)

If you have not already explored the codebase, do so to understand the current state of the code.

Ticket titles and descriptions should use the project's domain glossary vocabulary, and respect ADRs in the area you're touching.

Look for opportunities to prefactor the code to make the implementation easier. "Make the change easy, then make the easy change."

### 3. Draft Vertical Slices

Break the work into tracer bullet tickets.

- Each slice cuts a narrow but COMPLETE path through every layer (schema, API, UI, tests) — vertical, NOT a horizontal slice of one layer
- A completed slice is demoable or verifiable on its own
- Each slice is sized to fit in a single fresh context window
- Any prefactoring should be done first

Give each ticket its blocking edges — the other tickets that must complete before it can start. A ticket with no blockers can start immediately.

**Wide refactors are the exception to vertical slicing.** A wide refactor is one mechanical change — rename a column, retype a shared symbol — whose blast radius fans across the whole codebase, so a single edit breaks thousands of call sites at once and no vertical slice can land green. Don't force it into a tracer bullet.

For renames or retypes, sequence it as **expand–contract**:

1. **Expand:** add the new form beside the old so nothing breaks.
2. **Migrate:** move call sites over in batches sized by blast radius (per package, per directory), each batch its own ticket blocked by the expand, keeping CI green batch to batch because the old form still exists.
3. **Contract:** delete the old form once no caller remains, in a ticket blocked by every migrate batch.

When even the batches can't stay green alone, keep the sequence but let them share an integration branch that all block a final integrate-and-verify ticket — green is promised only there.

### 4. Quiz the User

Present the proposed breakdown as a numbered list. For each ticket, show:

- **Title:** short descriptive name
- **Blocked by:** which other tickets (if any) must complete first
- **What it delivers:** the end-to-end behaviour this ticket makes work

Ask the user:

- Does the granularity feel right? (too coarse / too fine)
- Are the blocking edges correct — does each ticket only depend on tickets that genuinely gate it?
- Should any tickets be merged or split further?

Iterate until the user approves the breakdown.

### 5. Publish the Tickets to the Configured Tracker

Publish the approved tickets. How depends on the tracker `/setup-matt-pocock-skills` configured — the tickets are the same either way, only the shape of the blocking edges changes:

- **Local files** → write one file per ticket under `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01` in dependency order (blockers first). Each file's "Blocked by" lists the numbers/titles it depends on. Use the per-ticket file template below — one ticket per file, never a single combined file.
- **A real issue tracker (GitHub, Linear, …)** → publish one issue per ticket in dependency order (blockers first) so each ticket's blocking edges can reference real identifiers. Use the platform's native blocking / sub-issue relationship where it has one; otherwise set each ticket's "Blocked by" to the blocking issues.

Apply the `ready-for-agent` triage label unless instructed otherwise — the tickets are agent-grabbable by construction.

**Work the frontier:** any ticket whose blockers are all done. For a purely linear chain that means top to bottom.

Do NOT close or modify any parent issue.

## Per-Ticket File Template

```markdown
# [Ticket Title]

**Status:** ready-for-agent

## Parent

A reference to the parent issue on the tracker (if the source was an existing issue, otherwise omit this section).

## What to Build

The end-to-end behaviour this ticket makes work, from the user's perspective — not layer-by-layer implementation.

## Acceptance Criteria

- Criterion 1
- Criterion 2

## Blocked By

- A reference to each blocking ticket, or "None — can start immediately".

In either form, avoid specific file paths or code snippets — they go stale fast. Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it and note briefly that it came from a prototype. Trim to the decision-rich parts — not a working demo, just the important bits.

Work the frontier one ticket at a time with `/implement`, clearing context between tickets.
```

## Constraints

### MUST DO

- Break work into tracer-bullet vertical slices
- Declare blocking edges for each ticket
- Quiz the user before publishing
- Publish in dependency order (blockers first)
- Apply the `ready-for-agent` triage label
- Work the frontier (tickets with all blockers done)

### MUST NOT DO

- Create horizontal slices (one layer at a time)
- Force wide refactors into vertical slices
- Publish without user approval
- Close or modify parent issues
- Include stale file paths or code snippets in tickets

## Output Template

```markdown
# Tickets: [Feature Name]

**Spec:** [Link to spec or issue]
**Tracker:** [GitHub / Linear / Local files]

## Ticket Breakdown

1. **[Title]**
   - Blocked by: [tickets or "None"]
   - Delivers: [end-to-end behaviour]

2. **[Title]**
   - Blocked by: [tickets]
   - Delivers: [end-to-end behaviour]

...

## Next Steps

Work ticket [N] first (all blockers satisfied).
```

## Example Prompts

- "Break this spec into tickets."
- "Turn our conversation into a ticket breakdown."
- "Create tracer-bullet tickets for the checkout feature."
- "Break down the API migration into implementable tickets."
