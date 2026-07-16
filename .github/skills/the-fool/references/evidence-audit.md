# Evidence Audit Reference

## Method

Apply falsificationism to claims: for each claim, identify what would prove it false, then evaluate the evidence against those criteria.

## Process

### 1. Extract Claims

List every factual claim in the user's position. Separate facts from opinions.

| # | Claim | Type (Fact/Opinion) | Source |
|---|-------|---------------------|--------|
| 1 | [Claim] | Fact/Opinion | [Where it came from] |

### 2. Define Falsification Criteria

For each factual claim, specify what would prove it false:

| Claim | Falsification Criterion |
|-------|------------------------|
| [Claim 1] | [Specific condition that would disprove it] |
| [Claim 2] | [Specific condition that would disprove it] |

### 3. Grade Evidence

Evaluate the evidence for each claim:

| Grade | Meaning | Criteria |
|-------|---------|----------|
| A | Strong | Multiple independent sources, reproducible, peer-reviewed |
| B | Moderate | Single strong source, some corroboration |
| C | Weak | Anecdotal, single source, or indirect |
| D | Speculative | No direct evidence, logical inference only |
| F | Contradicted | Evidence actively disputes the claim |

### 4. Identify Competing Explanations

For each claim, what else could explain the observed evidence?

- Alternative cause
- Confounding variable
- Selection bias
- Measurement error

### 5. Weight and Conclude

Combine evidence grades with falsification results:

- **Well-supported:** Grade A/B, no falsification
- **Plausible but unproven:** Grade C, no falsification
- **Speculative:** Grade D, no falsification
- **Contradicted:** Grade F or falsified

## Output Template

```
Steelmanned Thesis:
[User's position in strongest form]

Claims Extracted:

1. [Claim 1] — Type: [Fact/Opinion], Source: [Source]
2. [Claim 2] — Type: [Fact/Opinion], Source: [Source]
...

Falsification Criteria:

| Claim | What would prove it false |
|-------|---------------------------|
| [Claim 1] | [Criterion] |
| [Claim 2] | [Criterion] |

Evidence Audit:

| Claim | Grade | Evidence Summary | Falsified? |
|-------|-------|------------------|------------|
| [Claim 1] | A/B/C/D/F | [Summary] | Yes/No/Partial |
| [Claim 2] | A/B/C/D/F | [Summary] | Yes/No/Partial |

Competing Explanations:
- For [Claim 1]: [Alternative explanation]
- For [Claim 2]: [Alternative explanation]

Conclusion:
[Overall assessment of how well evidence supports the thesis]

Confidence Rating: [High/Medium/Low]
What would change this assessment: [List]
```

## Usage Notes

- Be rigorous about falsification — what would actually prove the claim wrong?
- Grade evidence honestly; don't inflate weak evidence
- Always consider alternative explanations
- Distinguish between "no evidence against" and "evidence for"
