# Prompt Optimization Reference

## Iterative refinement

1. Establish baseline with current prompt
2. Make one change at a time
3. Test on held-out set
4. Accept change only if it improves metrics
5. Repeat

## Token reduction

- Remove redundant instructions
- Use shorter synonyms
- Compress examples without losing signal
- Move stable context to system prompt
- Use abbreviations for repeated terms

```
Before: "Please provide a comprehensive and detailed analysis of the following text..."
After: "Analyze the following text..."
```

## A/B testing

- Split test set into two halves
- Run both prompts on same inputs
- Compare metrics: accuracy, consistency, latency, token usage
- Use statistical significance test if sample size allows

## Clarity improvements

- Use numbered lists for sequential steps
- Use bullet points for parallel options
- Put constraints in a dedicated section
- Use examples that match target distribution
- Avoid ambiguous words: "appropriate", "relevant", "good"

## Consistency enforcement

- Add explicit format requirements
- Use delimiters for structured output
- Specify what to include/exclude
- Add "If unsure, say so" for calibration

```
Before: "Summarize this article."
After: "Summarize the article in 2-3 sentences. Include only facts from the article. If the article is unclear, say so."
```

## Temperature guidance

- `0.0-0.3`: Factual tasks, classification, extraction
- `0.4-0.7`: Creative tasks, open-ended generation
- `0.8-1.0`: Brainstorming, diverse outputs
