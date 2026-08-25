# Prompt Patterns Reference

## Zero-shot

Direct instruction without examples. Best for simple, well-defined tasks.

```
Extract the email address from the following text.
Text: {{text}}
Email:
```

## Few-shot

Provide 2-5 examples to establish the pattern. Best for classification, extraction, and formatting tasks.

```
Classify the intent of the user message as: question, complaint, or compliment.
Message: "How do I reset my password?"
Intent: question
Message: "This product is terrible and broke immediately."
Intent: complaint
Message: "Love the new update, works perfectly!"
Intent: compliment
Message: {{message}}
Intent:
```

## Chain-of-thought (CoT)

Ask the model to reason step by step. Best for math, logic, and multi-step reasoning.

```
Solve the following problem step by step.
Problem: {{problem}}
Steps:
```

## ReAct (Reason + Act)

Interleave reasoning with actions. Best for tool use and multi-step tasks.

```
Question: {{question}}
Thought: Let me think about what I need to do.
Action: search
Action Input: {{search_query}}
Observation: {{observation}}
... (repeat as needed)
Thought: I now have enough information to answer.
Final Answer:
```

## Tree-of-thoughts

Explore multiple reasoning paths. Best for complex problems with multiple valid approaches.

```
Consider 3 different approaches to solve this problem.
For each approach, list pros and cons.
Problem: {{problem}}
Approaches:
```

## Constitutional AI

Apply principles to guide behavior. Best for safety, tone, and policy adherence.

```
You are a helpful assistant. Follow these principles:
1. Be honest and accurate
2. Respect user privacy
3. Avoid harmful content
4. Admit uncertainty when appropriate

User: {{message}}
Assistant:
```

## System prompt patterns

```
You are a {{role}} with expertise in {{domain}}.
Your task is to {{task}}.
Constraints:
- {{constraint_1}}
- {{constraint_2}}
Output format: {{format}}
```
