"""Base LLM provider interface."""

from __future__ import annotations

from abc import ABC, abstractmethod


class LLMProvider(ABC):
    """Abstract LLM provider — wraps any model API."""

    @abstractmethod
    async def complete(self, messages: list[dict], model: str | None = None) -> str:
        """Send messages and return the response text.

        Args:
            messages: OpenAI-style message list, e.g.
                [{"role": "system", "content": "..."}, {"role": "user", "content": "..."}]
            model: Optional model override. Provider uses its default if None.

        Returns:
            The assistant's response text.
        """
        ...
