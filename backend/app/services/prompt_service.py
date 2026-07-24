from __future__ import annotations

from typing import Any


class PromptTemplate:
    def __init__(self, name: str, version: str, template_str: str):
        self.name = name
        self.version = version
        self.template_str = template_str

    def render(self, **kwargs: Any) -> str:
        return self.template_str.format(**kwargs)


SYSTEM_PROMPT_V1 = PromptTemplate(
    name="system_copilot",
    version="1.0.0",
    template_str=(
        "You are DevAtlas AI Copilot, an expert analyst on the Indian software developer ecosystem.\n"
        "Ground your answers in available data metrics and regional trends.\n\n"
        "--- REPOSITORY CONTEXT ---\n{context}\n---------------------------"
    ),
)


class PromptService:
    @staticmethod
    def get_system_prompt(context: str) -> str:
        return SYSTEM_PROMPT_V1.render(context=context)

    @staticmethod
    def format_conversation_history(messages: list[dict[str, str]]) -> str:
        formatted = []
        for msg in messages:
            role = msg.get("role", "user").capitalize()
            content = msg.get("content", "")
            formatted.append(f"{role}: {content}")
        return "\n".join(formatted)
