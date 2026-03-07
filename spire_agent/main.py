"""CLI entrypoint."""

from __future__ import annotations

import asyncio
import argparse
import logging

from .agent import Agent
from .client import SpireBridgeClient


def main() -> None:
    parser = argparse.ArgumentParser(description="AI agent for Slay the Spire 2")
    parser.add_argument("--url", default="ws://127.0.0.1:38642", help="SpireBridge WebSocket URL")
    parser.add_argument("--character", default="Ironclad", help="Character to play")
    parser.add_argument("--runs", type=int, default=1, help="Number of runs to play")
    parser.add_argument("-v", "--verbose", action="store_true", help="Debug logging")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )

    client = SpireBridgeClient(url=args.url)
    agent = Agent(client, character=args.character)
    asyncio.run(agent.run(max_runs=args.runs))


if __name__ == "__main__":
    main()
