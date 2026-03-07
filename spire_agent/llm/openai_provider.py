"""OpenAI-compatible LLM provider (OpenAI, OpenRouter, Ollama)."""

from __future__ import annotations

from .base import LLMProvider


class OpenAIProvider(LLMProvider):
    """LLM provider using the openai package.

    Works with OpenAI, OpenRouter, or Ollama by setting base_url.
    """

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        default_model: str | None = None,
    ) -> None:
        self.default_model = default_model
        self._api_key = api_key
        self._base_url = base_url
        self._client = None

    def _get_client(self):
        if self._client is None:
            from openai import AsyncOpenAI  # type: ignore

            kwargs: dict = {}
            if self._api_key:
                kwargs["api_key"] = self._api_key
            if self._base_url:
                kwargs["base_url"] = self._base_url
            self._client = AsyncOpenAI(**kwargs)
        return self._client

    async def complete(self, messages: list[dict], model: str | None = None) -> str:
        """Call chat completions endpoint."""
        _model = model or self.default_model
        if not _model:
            raise ValueError("No model specified and no default_model set")

        client = self._get_client()
        response = await client.chat.completions.create(
            model=_model,
            messages=messages,
        )
        return response.choices[0].message.content
