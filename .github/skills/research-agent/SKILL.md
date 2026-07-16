---
name: research-agent
description: "Investigate a question against high-trust primary sources and capture the findings as a Markdown file in the repo. Use when the user wants a topic researched, docs or API facts gathered, or reading legwork delegated to a background agent."
license: MIT
metadata:
  author: https://github.com/Jeffallan
  version: 1.0.0
  domain: research
  triggers: research, investigate, find docs, look up, primary source, official docs, API facts, reading legwork, background research
  roles: specialist
  scope: analysis
  output-format: markdown
  related-skills:
    - prompt-engineer
    - fastapi-expert
---

# Research Agent

Delegate research tasks to a background agent that investigates questions against primary sources and writes findings to a Markdown file.

## Core Workflow

1. **Clarify the question** — Ensure the research question is specific and answerable
2. **Spin up a background agent** — Launch a subagent to do the reading and investigation
3. **Investigate primary sources** — Use official docs, source code, specs, first-party APIs; follow every claim back to the source that owns it
4. **Write findings** — Capture results in a single Markdown file, citing each claim's source
5. **Save to repo** — Place the file where the repo already keeps such notes; match existing convention, or choose a sensible location and report where

## Background Agent Prompt Template

Use this prompt when launching the research subagent:

```
Investigate the following question against primary sources only:

QUESTION: [user's question]

REQUIREMENTS:
1. Use only primary sources: official documentation, source code, specifications, first-party APIs, or authoritative references.
2. Do NOT rely on secondary write-ups, blog posts, or community articles unless they are the only available source — and clearly label them as such.
3. Follow every claim back to the source that owns it. Include the source URL, document title, section, and line or page reference if available.
4. Write findings to a single Markdown file.
5. Save the file to: [determined location based on repo conventions].

OUTPUT FORMAT:
- One Markdown file with:
  - Title and date
  - Research question
  - Findings organized by topic or claim
  - Each claim followed by its citation (source, URL, section)
  - Summary of key takeaways
  - List of sources consulted
```

## Determining Output Location

1. **Check existing conventions:** Look for directories like `docs/`, `notes/`, `research/`, `decisions/`, or `wiki/`.
2. **Match the pattern:** If the repo uses `docs/api/research/`, save there.
3. **If no convention exists:** Save to `docs/research/<topic-slug>.md` or `notes/<topic-slug>.md`.
4. **Report the location:** Tell the user where the file was saved.

## Constraints

### MUST DO

- Use primary sources (official docs, source code, specs, first-party APIs)
- Cite every claim with its source
- Write findings to a single Markdown file
- Save the file in the repo following existing conventions
- Report the file location to the user

### MUST NOT DO

- Rely on secondary write-ups or blog posts as primary evidence
- Make claims without citing a source
- Scatter findings across multiple files
- Save outside the repo without telling the user
- Invent or guess when a source is unavailable — say "not found in primary sources"

## Output Template

```markdown
# Research: [Topic]

**Date:** YYYY-MM-DD
**Question:** [Original research question]

## Findings

### [Claim or Topic 1]

[Explanation of the finding]

**Source:** [Title], [Section/Page], [URL]

### [Claim or Topic 2]

[Explanation]

**Source:** [Title], [Section/Page], [URL]

## Summary

[Key takeaways in 2-3 bullet points]

## Sources Consulted

1. [Source 1](URL)
2. [Source 2](URL)
...
```

## Example Prompts

- "Research the official FastAPI dependency injection docs and save the key patterns to a note."
- "Investigate how PostgreSQL handles MVCC and write up the findings."
- "Look up the current Rust async runtime landscape from primary sources."
- "Find the official Go interface semantics in the spec and save them."
