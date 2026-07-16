# Evaluation Frameworks Reference

## Metrics

| Metric | What it measures | How to calculate |
|--------|------------------|-------------------|
| Accuracy | Correct outputs / total | Human eval or ground truth comparison |
| Consistency | Same input → same output | Run 3x, measure variance |
| Latency | Time to first token | API response time |
| Token usage | Cost per request | Input + output tokens |
| Hallucination rate | Unsupported claims | Human eval on factual claims |
| Instruction following | Adherence to constraints | Checklist of requirements |

## Test suite structure

```
tests/
  unit/           # Single-turn, deterministic tasks
  integration/    # Multi-turn, context-dependent
  edge_cases/     # Boundary conditions, adversarial inputs
  regression/     # Previously failed cases
```

## Test case template

```yaml
id: "classify_001"
input: "The battery life is incredible, lasts all day."
expected: "Positive"
category: "sentiment"
difficulty: "easy"
notes: "Clear positive sentiment with superlative"
```

## Automated evaluation

```python
def evaluate_prompt(prompt, test_cases):
    results = []
    for case in test_cases:
        output = run_llm(prompt, case["input"])
        score = {
            "correct": output == case["expected"],
            "tokens": count_tokens(prompt + case["input"] + output),
            "latency_ms": measure_latency(),
        }
        results.append(score)
    return aggregate(results)
```

## Failure pattern analysis

When accuracy < 80%:
1. Categorize failures: ambiguous instructions, missing examples, edge case gaps, model limitations
2. Identify if failures cluster by input type or constraint
3. Prioritize fixes by frequency and severity
4. Make one change, re-test, compare

## Continuous monitoring

- Log prompts and outputs in production
- Track metrics over time
- Alert on degradation (>5% accuracy drop)
- Retrain/evaluate on new distribution shifts
