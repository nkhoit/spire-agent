"""CLI interface for Slay the Spire 2 SpireBridge commands."""

from __future__ import annotations

import argparse
import asyncio
import sys

from . import commands
from .client import SpireBridgeClient

DEFAULT_URL = "ws://127.0.0.1:38642"


async def _run(url: str, coro) -> None:
    client = SpireBridgeClient(url=url)
    await client.connect()
    try:
        result = await coro(client)
        print(result)
    finally:
        await client.close()


def main() -> None:
    """Entry point for the spire-cli command."""
    parser = argparse.ArgumentParser(
        prog="spire-cli",
        description="Control Slay the Spire 2 via SpireBridge",
    )
    parser.add_argument(
        "--url",
        default=DEFAULT_URL,
        help=f"SpireBridge WebSocket URL (default: {DEFAULT_URL})",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # state
    sub.add_parser("state", help="Get current game state")

    # play
    p_play = sub.add_parser("play", help="Play a card from hand")
    p_play.add_argument("card_name", help="Card name (case-insensitive, partial match)")
    p_play.add_argument("--target", help="Target enemy name")

    # end-turn
    sub.add_parser("end-turn", help="End the current combat turn")

    # potion
    p_potion = sub.add_parser("potion", help="Use a potion")
    p_potion.add_argument("potion_name", help="Potion name")
    p_potion.add_argument("--target", help="Target enemy name")

    # map
    p_map = sub.add_parser("map", help="Choose a map node by type")
    p_map.add_argument(
        "node_type",
        help="Node type: Monster, Elite, RestSite, Shop, Event, Treasure",
    )

    # reward
    p_reward = sub.add_parser("reward", help="Choose a reward by index")
    p_reward.add_argument("index", type=int, help="Reward index")

    # card-reward
    p_card_reward = sub.add_parser("card-reward", help="Choose a card reward by name (or 'skip')")
    p_card_reward.add_argument("card_name", help="Card name or 'skip'")

    # rest
    p_rest = sub.add_parser("rest", help="Perform a rest site action")
    p_rest.add_argument("action", help="Action: heal, smith/upgrade")
    p_rest.add_argument("--card", dest="card_name", help="Card to upgrade (for smith)")

    # event
    p_event = sub.add_parser("event", help="Choose an event option by index")
    p_event.add_argument("index", type=int, help="Option index")

    # proceed
    sub.add_parser("proceed", help="Proceed/continue past current screen")

    # start
    p_start = sub.add_parser("start", help="Start a new run")
    p_start.add_argument(
        "--character", default="Ironclad", help="Character name (default: Ironclad)"
    )

    # abandon
    sub.add_parser("abandon", help="Abandon the current run")

    args = parser.parse_args()

    async def run(client: SpireBridgeClient) -> str:
        cmd = args.command
        if cmd == "state":
            return await commands.get_game_state(client)
        elif cmd == "play":
            return await commands.play_card(client, args.card_name, args.target)
        elif cmd == "end-turn":
            return await commands.end_turn(client)
        elif cmd == "potion":
            return await commands.use_potion(client, args.potion_name, args.target)
        elif cmd == "map":
            return await commands.choose_map_node(client, args.node_type)
        elif cmd == "reward":
            return await commands.choose_reward(client, args.index)
        elif cmd == "card-reward":
            return await commands.choose_card_reward(client, args.card_name)
        elif cmd == "rest":
            return await commands.rest_site_action(client, args.action, args.card_name)
        elif cmd == "event":
            return await commands.choose_event_option(client, args.index)
        elif cmd == "proceed":
            return await commands.proceed(client)
        elif cmd == "start":
            return await commands.start_run(client, args.character)
        elif cmd == "abandon":
            return await commands.abandon_run(client)
        else:
            return f"Unknown command: {cmd}"

    try:
        asyncio.run(_run(args.url, run))
    except ConnectionRefusedError:
        print(f"Could not connect to SpireBridge at {args.url}", file=sys.stderr)
        print("Make sure Slay the Spire 2 is running with the SpireBridge mod.", file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
