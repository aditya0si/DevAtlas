---
name: to-spec
description: "Turn the current conversation into a spec and publish it to the project issue tracker — no interview, just synthesis of what you've already discussed."
license: MIT
metadata:
  author: https://github.com/Jeffallan
  version: 1.0.0
  domain: planning
  triggers: to-spec, write spec, create PRD, document requirements, publish spec, issue tracker
  roles: specialist
  scope: planning
  output-format: markdown
  related-skills:
    - to-tickets
    - code-review
---

# To Spec

This skill takes the current conversation context and codebase understanding and produces a spec (you may know this document as a PRD).

**Do NOT interview the user — just synthesize what you already know.**

The issue tracker and triage label vocabulary should have been provided to you. Run `/setup-matt-pocock-skills` if not.

## Process

1. **Explore the repo** to understand the current state of the codebase, if you haven't already. Use the project's domain glossary vocabulary throughout the spec, and respect any ADRs in the area you're touching.
2. **Sketch out the seams** at which you're going to test the feature. Existing seams should be preferred to new ones. Use the highest seam possible. If new seams are needed, propose them at the highest point you can. The fewer seams across the codebase, the better — the ideal number is one. Check with the user that these seams match their expectations.
3. **Write the spec** using the template below, then publish it to the project issue tracker. Apply the `ready-for-agent` triage label — no need for additional triage.

## Spec Template

```markdown
# [Feature Name]

## Problem Statement

The problem that the user is facing, from the user's perspective.

## Solution

The solution to the problem, from the user's perspective.

## User Stories

A LONG, numbered list of user stories. Each user story should be in the format of:

1. As a [role], I want [feature], so that [benefit]

Example:
1. As a mobile bank customer, I want to see balance on my accounts, so that I can make better informed decisions about my spending

This list should be extremely extensive and cover all aspects of the feature.

## Implementation Decisions

A list of implementation decisions that were made. This can include:

- The modules that will be built/modified
- The interfaces of those modules that will be modified
- Technical clarifications from the developer
- Architectural decisions
- Schema changes
- API contracts
- Specific interactions

Do NOT include specific file paths or code snippets. They may end up being outdated very quickly.

Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it within the relevant decision and note briefly that it came from a prototype. Trim to the decision-rich parts — not a working demo, just the important bits.

## Testing Decisions

A list of testing decisions that were made. Include:

- A description of what makes a good test (only test external behavior, not implementation details)
- Which modules will be tested
- Prior art for the tests (i.e. similar types of tests in the codebase)

## Out of Scope

A description of the things that are out of scope for this spec.

## Further Notes

Any further notes about the feature.
```

## Constraints

### MUST DO

- Synthesize from existing conversation — do not interview the user
- Use the project's domain glossary vocabulary
- Respect ADRs in the relevant area
- Propose seams at the highest possible level
- Publish to the configured issue tracker
- Apply the `ready-for-agent` triage label

### MUST NOT DO

- Ask the user new questions to fill in gaps
- Use generic terminology instead of the project's domain language
- Propose new seams when existing ones would work
- Include specific file paths or code snippets (except decision-rich prototypes)
- Forget to publish the spec

## Output Template

```markdown
# Spec: [Feature Name]

**Published to:** [Issue tracker URL]
**Issue:** #[number]
**Label:** ready-for-agent

## Problem Statement

[From user's perspective]

## Solution

[From user's perspective]

## User Stories

1. As a [role], I want [feature], so that [benefit]
...

## Implementation Decisions

- [Decision 1]
- [Decision 2]

## Testing Decisions

- [What makes a good test]
- [Which modules]
- [Prior art]

## Out of Scope

- [What's not included]

## Further Notes

[Any additional context]
```

## Example Prompts

- "Turn our conversation into a spec for the checkout flow."
- "Write a PRD for the user authentication feature we discussed."
- "Publish a spec for the API migration to the issue tracker."
