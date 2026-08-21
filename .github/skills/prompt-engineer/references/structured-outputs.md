# Structured Outputs Reference

## JSON mode

```
Return a JSON object with the following schema:
{
  "sentiment": "positive" | "negative" | "neutral",
  "confidence": float (0-1),
  "entities": [{"name": string, "type": string}]
}

Text: {{text}}
JSON:
```

## Function calling

```python
tools = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "Get current weather for a location",
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {"type": "string", "description": "City name"},
                    "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]}
                },
                "required": ["location"]
            }
        }
    }
]
```

## Schema design principles

- Use specific types, not generic "string"
- Mark required fields explicitly
- Provide descriptions for ambiguous fields
- Use enums for fixed sets
- Keep schemas flat when possible

## Validation

```python
from pydantic import BaseModel, ValidationError

class AnalysisResult(BaseModel):
    sentiment: Literal["positive", "negative", "neutral"]
    confidence: float = Field(ge=0, le=1)
    entities: list[dict]

try:
    result = AnalysisResult.model_validate_json(llm_output)
except ValidationError as e:
    # Handle malformed output
```

## Prompting for structured output

```
You must respond with valid JSON matching this schema:
{schema}

Rules:
- No additional text before or after the JSON
- Use null for missing values
- Follow the schema exactly

Input: {{input}}
JSON:
```

## Error recovery

```
If you cannot produce valid JSON, respond with:
{"error": "reason", "partial": {}}
```
