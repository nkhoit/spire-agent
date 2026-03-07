"""GitHub Copilot LLM provider."""

from __future__ import annotations

import asyncio

from .base import LLMProvider

DEFAULT_MODEL = "claude-sonnet-4.6"


class CopilotProvider(LLMProvider):
    """LLM provider backed by GitHub Copilot via github-copilot-sdk."""

    def __init__(self, default_model: str = DEFAULT_MODEL) -> None:
        self.default_model = default_model
        self._client = None

    def _get_client(self):
        if self._client is None:
            from github_copilot_sdk import CopilotClient  # type: ignore

            self._client = CopilotClient()
        return self._client

    async def complete(self, messages: list[dict], model: str | None = None) -> str:
        """Call Copilot chat completions (sync SDK wrapped in asyncio.to_thread)."""
        _model = model or self.default_model

        def _sync_call() -> str:
            client = self._get_client()
            response = client.chat.completions.create(
                model=_model,
                messages=messages,
            )
            return response.choices[0].message.content

        return await asyncio.to_thread(_sync_call)
