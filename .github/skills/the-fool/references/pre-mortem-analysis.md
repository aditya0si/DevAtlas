# Pre-Mortem Analysis Reference

## Method

Imagine the project/decision has failed spectacularly. Work backward to identify how it happened, then build mitigations.

## Process

### 1. Set the Scene

Assume complete failure. The project is dead, the decision was disastrous, the system collapsed. When? How bad?

### 2. Generate Failure Narratives

Brainstorm 5-10 specific ways it could have failed. For each:

- **Failure mode:** What went wrong?
- **Causal chain:** How did we get there? (2-3 steps)
- **Early warning signs:** What would we have seen beforehand?
- **Mitigation:** What could have prevented this?

### 3. Rank by Likelihood and Impact

| Failure | Likelihood | Impact | Risk Score |
|---------|-----------|--------|------------|
| [Failure 1] | High/Med/Low | High/Med/Low | [product] |
| ... | ... | ... | ... |

### 4. Second-Order Thinking

For the top 3 risks, ask: "And then what?"

- What happens after the failure?
- How does it cascade?
- What secondary failures does it trigger?

### 5. Inversion Check

Instead of "how do we succeed?", ask: "how do we guarantee failure?"

- List all the ways to guarantee failure
- Check if any of those are happening now
- Build safeguards against them

## Output Template

```
Steelmanned Thesis:
[User's position in strongest form]

Failure Narratives (Ranked):

1. [Failure Mode] — Risk Score: [X/10]
   - Causal chain: [Step 1] → [Step 2] → [Failure]
   - Early warning signs: [Sign 1], [Sign 2]
   - Mitigation: [Specific action]

2. [Failure Mode] — Risk Score: [X/10]
   ...

Second-Order Effects:
- [Failure 1] leads to [cascade]
- [Failure 2] triggers [secondary failure]

Inversion Check:
To guarantee failure, we would:
1. [Action that guarantees failure]
2. ...

Current safeguards:
- [Safeguard 1]
- [Safeguard 2]

Recommended Actions:
1. [Immediate action for highest risk]
2. [Medium-term action]
3. [Long-term action]
```

## Usage Notes

- Be specific, not generic ("team conflict" → "backend and frontend disagree on API contract")
- Focus on preventable failures, not acts of God
- Prioritize failures that are both likely and high-impact
- Always end with actionable mitigations
