"""Factory for creating LLM providers."""

from __future__ import annotations

from .base import LLMProvider


def create_provider(provider_name: str, **kwargs) -> LLMProvider:
    """Create an LLM provider by name.

    Args:
        provider_name: One of "copilot", "openai", "openrouter", "ollama".
        **kwargs: Provider-specific options (api_key, base_url, default_model).

    Returns:
        Configured LLMProvider instance.
    """
    name = provider_name.lower()

    if name == "copilot":
        from .copilot import CopilotProvider

        return CopilotProvider(default_model=kwargs.get("default_model", "claude-sonnet-4"))

    if name == "openai":
        from .openai_provider import OpenAIProvider

        return OpenAIProvider(
            api_key=kwargs.get("api_key"),
            base_url=kwargs.get("base_url"),
            default_model=kwargs.get("default_model"),
        )

    if name == "openrouter":
        from .openai_provider import OpenAIProvider

        return OpenAIProvider(
            api_key=kwargs.get("api_key"),
            base_url="https://openrouter.ai/api/v1",
            default_model=kwargs.get("default_model"),
        )

    if name == "ollama":
        from .openai_provider import OpenAIProvider

        return OpenAIProvider(
            api_key=None,
            base_url=kwargs.get("base_url", "http://localhost:11434/v1"),
            default_model=kwargs.get("default_model"),
        )

    raise ValueError(
        f"Unknown provider: {provider_name!r}. Choose from: copilot, openai, openrouter, ollama"
    )
