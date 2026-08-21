# Context Management Reference

## Attention budget

- Front-load critical instructions in system prompt
- Place examples early in the context
- Put stable reference material before variable content
- Reserve last 20% of context for the model's reasoning

## Degradation patterns

| Pattern | Symptom | Mitigation |
|---------|---------|------------|
| Lost-in-the-middle | Model ignores middle context | Put critical info at start or end |
| Context crowding | Later instructions override earlier | Use explicit section markers |
| Token exhaustion | Truncation of important context | Summarize or compress history |
| Attention dilution | Model attends to irrelevant details | Remove noise, use delimiters |

## Optimization techniques

### Context compression

```
Before: [Full conversation history - 5000 tokens]
After: [Summary of key decisions + last 2 turns - 1000 tokens]
```

### Retrieval augmentation

```
Relevant context:
{{retrieved_documents}}

Task: {{task}}
```

### Sliding window

- Keep last N turns in full
- Summarize older turns
- Refresh summary when context is compressed

## Context window planning

| Model | Context | Strategy |
|-------|---------|----------|
| GPT-4 | 128K | Full context for most tasks |
| Claude | 200K | Long documents, full conversations |
| Gemini | 1M+ | Very long documents, RAG preferred |
| GPT-3.5 | 16K | Aggressive compression, RAG |

## Prompt structure for long contexts

```
[SYSTEM - Stable instructions]
[CONTEXT - Retrieved or summarized background]
[EXAMPLES - Few-shot demonstrations]
[TASK - Current request]
[FORMAT - Output requirements]
```

## Degradation mitigation

- Repeat critical constraints at the end
- Use explicit markers: "IMPORTANT:", "REMEMBER:", "NOTE:"
- Test with progressively longer contexts
- Monitor for instruction drift in long conversations
