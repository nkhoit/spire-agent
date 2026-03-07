"""MCP server that wraps SpireBridge as LLM-friendly tools."""

from __future__ import annotations

import logging

from mcp.server.fastmcp import FastMCP

from . import commands
from .client import SpireBridgeClient

logger = logging.getLogger(__name__)

mcp = FastMCP("spire-bridge")

# ---------------------------------------------------------------------------
# Persistent connection
# ---------------------------------------------------------------------------

_client: SpireBridgeClient | None = None


async def get_client() -> SpireBridgeClient:
    global _client
    if _client is None:
        _client = SpireBridgeClient()
        await _client.connect()
    return _client


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------


@mcp.tool()
async def get_game_state() -> str:
    """Get the current full game state — screen, player, enemies, hand, deck, map, etc."""
    client = await get_client()
    return await commands.get_game_state(client)


@mcp.tool()
async def play_card(card_name: str, target: str | None = None) -> str:
    """Play a card from hand by name. Optionally specify a target enemy by name."""
    client = await get_client()
    return await commands.play_card(client, card_name, target)


@mcp.tool()
async def end_turn() -> str:
    """End the current combat turn."""
    client = await get_client()
    return await commands.end_turn(client)


@mcp.tool()
async def use_potion(potion_name: str, target: str | None = None) -> str:
    """Use a potion by name. Optionally specify a target enemy."""
    client = await get_client()
    return await commands.use_potion(client, potion_name, target)


@mcp.tool()
async def choose_map_node(node_type: str) -> str:
    """Navigate the map to a node of the given type.

    Valid types: Monster, Elite, RestSite, Shop, Event, Treasure.
    """
    client = await get_client()
    return await commands.choose_map_node(client, node_type)


@mcp.tool()
async def choose_reward(index: int) -> str:
    """Pick a reward by index from the rewards screen."""
    client = await get_client()
    return await commands.choose_reward(client, index)


@mcp.tool()
async def choose_card_reward(card_name: str) -> str:
    """Pick a card from the card reward screen by name, or pass 'skip' to skip."""
    client = await get_client()
    return await commands.choose_card_reward(client, card_name)


@mcp.tool()
async def rest_site_action(action: str, card_name: str | None = None) -> str:
    """Perform a rest site action: 'heal' or 'smith'/'upgrade'.

    For smith, optionally specify a card name to upgrade.
    """
    client = await get_client()
    return await commands.rest_site_action(client, action, card_name)


@mcp.tool()
async def choose_event_option(index: int) -> str:
    """Pick an event option by index."""
    client = await get_client()
    return await commands.choose_event_option(client, index)


@mcp.tool()
async def proceed() -> str:
    """Generic proceed/continue — leave shop, skip rewards, advance past game over, etc."""
    client = await get_client()
    return await commands.proceed(client)


@mcp.tool()
async def start_run(character: str = "Ironclad") -> str:
    """Start a new Slay the Spire run with the given character."""
    client = await get_client()
    return await commands.start_run(client, character)


@mcp.tool()
async def abandon_run() -> str:
    """Abandon the current run."""
    client = await get_client()
    return await commands.abandon_run(client)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main() -> None:
    """Run the MCP server over stdio."""
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
