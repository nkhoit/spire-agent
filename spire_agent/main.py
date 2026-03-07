"""CLI entrypoint."""

from __future__ import annotations

import argparse
import asyncio
import logging

from .agent import Agent
from .client import SpireBridgeClient


def main() -> None:
    parser = argparse.ArgumentParser(description="AI agent for Slay the Spire 2")
    parser.add_argument("--url", default="ws://127.0.0.1:38642", help="SpireBridge WebSocket URL")
    parser.add_argument("--character", default="Ironclad", help="Character to play")
    parser.add_argument("--runs", type=int, default=1, help="Number of runs to play")
    parser.add_argument("-v", "--verbose", action="store_true", help="Debug logging")
    # Strategy options
    parser.add_argument(
        "--strategy", choices=["heuristic", "llm"], default="heuristic", help="Strategy to use"
    )
    parser.add_argument(
        "--provider",
        choices=["copilot", "openai", "openrouter", "ollama"],
        default="copilot",
        help="LLM provider (used when --strategy=llm)",
    )
    parser.add_argument("--model", default=None, help="LLM model name override")
    parser.add_argument("--api-key", default=None, help="API key for openai/openrouter")
    parser.add_argument("--base-url", default=None, help="Base URL for openai-compatible providers")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )

    strategy = None
    if args.strategy == "llm":
        from .llm.factory import create_provider
        from .strategy.llm import LLMStrategy

        provider = create_provider(
            args.provider,
            api_key=args.api_key,
            base_url=args.base_url,
            default_model=args.model,
        )
        strategy = LLMStrategy(provider, model=args.model)

    client = SpireBridgeClient(url=args.url)
    agent = Agent(client, strategy=strategy, character=args.character)
    asyncio.run(agent.run(max_runs=args.runs))


if __name__ == "__main__":
    main()
