"""MCP server that wraps SpireBridge as LLM-friendly tools."""

from __future__ import annotations

import logging
from typing import Any

from mcp.server.fastmcp import FastMCP

from .client import SpireBridgeClient
from .state import (
    GameState,
    find_actions,
    get_enemies,
    get_hand,
    get_hittable_enemies,
    get_player,
    get_screen,
    player_energy,
    player_hp,
)

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
# Formatting helpers
# ---------------------------------------------------------------------------


def _fmt_card(card: dict[str, Any]) -> str:
    parts = [card.get("name", "?")]
    cost = card.get("cost")
    if cost is not None:
        parts[0] = f"{card['name']}({cost})"
    if card.get("damage"):
        parts.append(f"dmg:{card['damage']}")
    if card.get("block"):
        parts.append(f"blk:{card['block']}")
    if card.get("type"):
        parts.append(card["type"])
    if card.get("exhausts"):
        parts.append("Exhaust")
    return " ".join(parts)


def _fmt_enemy(enemy: dict[str, Any]) -> str:
    name = enemy.get("name", "Enemy")
    hp = enemy.get("hp", "?")
    max_hp = enemy.get("max_hp", "?")
    intent = enemy.get("intent", {})
    intent_str = ""
    if intent:
        itype = intent.get("type", "")
        dmg = intent.get("damage", 0)
        hits = intent.get("hits", 1)
        if dmg and hits:
            intent_str = f" [{itype} {dmg}x{hits}={dmg*hits}]" if hits > 1 else f" [{itype} {dmg}]"
        else:
            intent_str = f" [{itype}]"
    block = enemy.get("block", 0)
    block_str = f" 🛡{block}" if block else ""
    return f"{name} {hp}/{max_hp}{block_str}{intent_str}"


def _brief_combat_state(state: GameState) -> str:
    hp, max_hp = player_hp(state)
    energy = player_energy(state)
    block = get_player(state).get("block", 0)
    block_str = f" 🛡{block}" if block else ""
    enemies = get_enemies(state)
    enemy_str = ", ".join(_fmt_enemy(e) for e in enemies) if enemies else "none"
    return f"HP: {hp}/{max_hp}{block_str} | Energy: {energy} | Enemies: {enemy_str}"


def _format_full_state(state: GameState) -> str:
    lines: list[str] = []
    screen = get_screen(state)
    lines.append(f"=== Screen: {screen.upper()} ===")

    # Floor / act
    floor = state.get("floor")
    act = state.get("act")
    if floor is not None:
        lines.append(f"Floor {floor}" + (f", Act {act}" if act else ""))

    # Player
    player = get_player(state)
    hp, max_hp = player_hp(state)
    energy = player_energy(state)
    block = player.get("block", 0)
    lines.append("\n--- Player ---")
    lines.append(f"HP: {hp}/{max_hp}  Energy: {energy}" + (f"  Block: {block}" if block else ""))

    # Relics
    relics = player.get("relics", [])
    if relics:
        relic_names = [r.get("name", "?") if isinstance(r, dict) else str(r) for r in relics]
        lines.append(f"Relics: {', '.join(relic_names)}")

    # Potions
    potions = player.get("potions", [])
    active_potions = [p for p in potions if p and p.get("name") and p.get("name") != "Potion Slot"]
    if active_potions:
        potion_names = [p.get("name", "?") for p in active_potions]
        lines.append(f"Potions: {', '.join(potion_names)}")

    # Enemies (combat)
    enemies = get_enemies(state)
    if enemies:
        lines.append("\n--- Enemies ---")
        for e in enemies:
            lines.append(f"  {_fmt_enemy(e)}")

    # Hand (combat)
    hand = get_hand(state)
    if hand:
        lines.append(f"\n--- Hand ({len(hand)} cards) ---")
        for i, card in enumerate(hand):
            playable = "✓" if card.get("playable", True) else "✗"
            lines.append(f"  [{i}] {playable} {_fmt_card(card)}")

    # Deck overview
    deck = player.get("deck", [])
    if deck:
        lines.append(f"\n--- Deck ({len(deck)} cards) ---")
        # Group by name
        counts: dict[str, int] = {}
        for c in deck:
            name = c.get("name", "?") if isinstance(c, dict) else str(c)
            counts[name] = counts.get(name, 0) + 1
        deck_parts = [f"{name} x{n}" if n > 1 else name for name, n in sorted(counts.items())]
        lines.append("  " + ", ".join(deck_parts))

    # Card choices (card_reward screen)
    card_choices = state.get("card_choices", [])
    if card_choices:
        lines.append("\n--- Card Choices ---")
        for i, c in enumerate(card_choices):
            lines.append(f"  [{i}] {_fmt_card(c)}")

    # Rewards
    rewards = state.get("rewards", [])
    if rewards:
        lines.append("\n--- Rewards ---")
        for i, r in enumerate(rewards):
            rtype = r.get("type", "?")
            rdesc = r.get("name") or r.get("gold") or ""
            lines.append(f"  [{i}] {rtype}" + (f": {rdesc}" if rdesc else ""))

    # Map nodes
    map_nodes = find_actions(state, "choose_node")
    if map_nodes:
        lines.append("\n--- Available Map Nodes ---")
        for n in map_nodes:
            lines.append(f"  Row {n.get('row')} Col {n.get('col')}: {n.get('type', '?')}")

    # Rest site options
    rest_opts = find_actions(state, "choose_rest_option")
    if rest_opts:
        lines.append("\n--- Rest Options ---")
        for o in rest_opts:
            lines.append(f"  [{o.get('index', '?')}] {o.get('id', '?')}")

    # Event options
    event_opts = find_actions(state, "choose_option")
    if event_opts:
        event_text = state.get("event_text") or state.get("event", {}).get("body", "")
        if event_text:
            lines.append("\n--- Event ---")
            lines.append(f"  {event_text[:300]}")
        lines.append("\n--- Event Options ---")
        for o in event_opts:
            label = o.get("label") or o.get("text") or str(o.get("index", "?"))
            lines.append(f"  [{o.get('index', '?')}] {label}")

    # Available actions summary
    available = state.get("available_actions", [])
    if available:
        action_types = sorted({a.get("action", "?") for a in available})
        lines.append(f"\nAvailable actions: {', '.join(action_types)}")

    return "\n".join(lines)


def _resolve_card(hand: list[dict], card_name: str) -> tuple[int, dict] | None:
    """Find a card in hand by name (case-insensitive, partial match)."""
    lower = card_name.lower()
    for i, card in enumerate(hand):
        if card.get("name", "").lower() == lower:
            return i, card
    for i, card in enumerate(hand):
        if lower in card.get("name", "").lower():
            return i, card
    return None


def _resolve_enemy(enemies: list[dict], target: str) -> int | None:
    """Find enemy index by name (case-insensitive, partial match)."""
    lower = target.lower()
    for i, e in enumerate(enemies):
        if e.get("name", "").lower() == lower:
            return i
    for i, e in enumerate(enemies):
        if lower in e.get("name", "").lower():
            return i
    return None


def _resolve_potion(potions: list[dict], potion_name: str) -> tuple[int, dict] | None:
    """Find potion by name."""
    lower = potion_name.lower()
    for i, p in enumerate(potions):
        if not p or not p.get("name"):
            continue
        if p["name"].lower() == lower or lower in p["name"].lower():
            return i, p
    return None


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------


@mcp.tool()
async def get_game_state() -> str:
    """Get the current full game state — screen, player, enemies, hand, deck, map, etc."""
    client = await get_client()
    state = await client.get_state()
    if not state:
        return "No game state available. Is Slay the Spire running with SpireBridge?"
    return _format_full_state(state)


@mcp.tool()
async def play_card(card_name: str, target: str | None = None) -> str:
    """Play a card from hand by name. Optionally specify a target enemy by name."""
    client = await get_client()
    state = await client.get_state()
    hand = get_hand(state)

    result = _resolve_card(hand, card_name)
    if result is None:
        available = ", ".join(c.get("name", "?") for c in hand)
        return f"Card '{card_name}' not found. Available cards: {available}"
    card_idx, card = result

    cmd: dict[str, Any] = {"action": "play", "card": card_idx}

    if target is not None:
        enemies = get_hittable_enemies(state)
        enemy_idx = _resolve_enemy(enemies, target)
        if enemy_idx is None:
            available = ", ".join(e.get("name", "?") for e in enemies)
            return f"Target '{target}' not found. Available enemies: {available}"
        cmd["target"] = enemy_idx

    resp = await client.send(**cmd)
    if resp.status == "error":
        return f"Error playing {card.get('name')}: {resp.error or resp.message}"

    await client.drain_updates(wait=1.0)
    new_state = client.last_state or state

    target_str = f" on {target}" if target else ""
    brief = _brief_combat_state(new_state)
    return f"Played {card.get('name')}{target_str}. {brief}"


@mcp.tool()
async def end_turn() -> str:
    """End the current combat turn."""
    client = await get_client()
    resp = await client.send(action="end_turn")
    if resp.status == "error":
        return f"Error ending turn: {resp.error or resp.message}"

    await client.drain_updates(wait=1.5)
    new_state = client.last_state
    if new_state:
        screen = get_screen(new_state)
        if screen == "combat":
            return f"Turn ended. {_brief_combat_state(new_state)}"
        return f"Turn ended. Screen: {screen}"
    return "Turn ended."


@mcp.tool()
async def use_potion(potion_name: str, target: str | None = None) -> str:
    """Use a potion by name. Optionally specify a target enemy."""
    client = await get_client()
    state = await client.get_state()
    player = get_player(state)
    potions = player.get("potions", [])

    result = _resolve_potion(potions, potion_name)
    if result is None:
        available = [
            p["name"] for p in potions if p and p.get("name") and p["name"] != "Potion Slot"
        ]
        return f"Potion '{potion_name}' not found. Available: {', '.join(available) or 'none'}"
    potion_idx, potion = result

    cmd: dict[str, Any] = {"action": "use_potion", "potion_index": potion_idx}
    if target is not None:
        enemies = get_hittable_enemies(state)
        enemy_idx = _resolve_enemy(enemies, target)
        if enemy_idx is None:
            available = ", ".join(e.get("name", "?") for e in enemies)
            return f"Target '{target}' not found. Available enemies: {available}"
        cmd["target"] = enemy_idx

    resp = await client.send(**cmd)
    if resp.status == "error":
        return f"Error using {potion.get('name')}: {resp.error or resp.message}"

    await client.drain_updates(wait=1.0)
    new_state = client.last_state or state
    return f"Used {potion.get('name')}. {_brief_combat_state(new_state)}"


@mcp.tool()
async def choose_map_node(node_type: str) -> str:
    """Navigate the map to a node of the given type.

    Valid types: Monster, Elite, RestSite, Shop, Event, Treasure.
    """
    client = await get_client()
    state = await client.get_state()

    nodes = find_actions(state, "choose_node")
    if not nodes:
        return f"No map nodes available. Current screen: {get_screen(state)}"

    lower = node_type.lower()
    matches = [n for n in nodes if n.get("type", "").lower() == lower]
    if not matches:
        # Partial match
        matches = [n for n in nodes if lower in n.get("type", "").lower()]
    if not matches:
        available = ", ".join(sorted({n.get("type", "?") for n in nodes}))
        return f"No node of type '{node_type}' available. Available types: {available}"

    node = matches[0]
    resp = await client.send(action="choose_node", row=node["row"], col=node["col"])
    if resp.status == "error":
        return f"Error choosing node: {resp.error or resp.message}"

    await client.drain_updates(wait=2.0)
    new_state = client.last_state or state
    screen = get_screen(new_state)
    node_type_str = node.get("type")
    screen = get_screen(new_state)
    return (
        f"Navigated to {node_type_str} at row {node['row']}, col {node['col']}."
        f" Now on screen: {screen}"
    )


@mcp.tool()
async def choose_reward(index: int) -> str:
    """Pick a reward by index from the rewards screen."""
    client = await get_client()
    resp = await client.send(action="choose_reward", index=index)
    if resp.status == "error":
        return f"Error choosing reward {index}: {resp.error or resp.message}"

    await client.drain_updates(wait=1.0)
    new_state = client.last_state
    screen = get_screen(new_state) if new_state else "unknown"
    return f"Chose reward [{index}]. Screen: {screen}"


@mcp.tool()
async def choose_card_reward(card_name: str) -> str:
    """Pick a card from the card reward screen by name, or pass 'skip' to skip."""
    client = await get_client()
    state = await client.get_state()

    if card_name.lower() == "skip":
        resp = await client.send(action="skip")
        if resp.status == "error":
            return f"Error skipping: {resp.error or resp.message}"
        await client.drain_updates(wait=1.0)
        return "Skipped card reward."

    cards = state.get("card_choices", [])
    if not cards:
        return f"No card choices available. Screen: {get_screen(state)}"

    lower = card_name.lower()
    match = None
    for i, c in enumerate(cards):
        if c.get("name", "").lower() == lower:
            match = i
            break
    if match is None:
        for i, c in enumerate(cards):
            if lower in c.get("name", "").lower():
                match = i
                break
    if match is None:
        available = ", ".join(c.get("name", "?") for c in cards)
        return f"Card '{card_name}' not found. Available: {available}"

    resp = await client.send(action="choose_card", index=match)
    if resp.status == "error":
        return f"Error choosing card: {resp.error or resp.message}"

    await client.drain_updates(wait=1.0)
    chosen = cards[match].get("name", f"card[{match}]")
    return f"Added {chosen} to deck."


@mcp.tool()
async def rest_site_action(action: str, card_name: str | None = None) -> str:
    """Perform a rest site action: 'heal' or 'smith'/'upgrade'.

    For smith, optionally specify a card name to upgrade.
    """
    client = await get_client()
    state = await client.get_state()

    opts = find_actions(state, "choose_rest_option")
    if not opts:
        return f"No rest options available. Screen: {get_screen(state)}"

    action_lower = action.lower()
    # Normalize synonyms
    if action_lower in ("upgrade", "smith"):
        id_target = "SMITH"
    elif action_lower == "heal":
        id_target = "HEAL"
    elif action_lower == "recall":
        id_target = "RECALL"
    elif action_lower == "lift":
        id_target = "LIFT"
    else:
        id_target = action.upper()

    opt = next((o for o in opts if o.get("id", "").upper() == id_target), None)
    if opt is None:
        available = ", ".join(o.get("id", "?") for o in opts)
        return f"Rest option '{action}' not found. Available: {available}"

    resp = await client.send(action="choose_rest_option", index=opt["index"])
    if resp.status == "error":
        return f"Error at rest site: {resp.error or resp.message}"

    await client.drain_updates(wait=1.0)

    # If smith and card_name provided, we need to select the card to upgrade
    if id_target == "SMITH" and card_name:
        new_state = client.last_state or state
        upgrade_actions = find_actions(new_state, "choose_card")
        deck = get_player(new_state).get("deck", [])
        lower = card_name.lower()
        match_idx = None
        for i, c in enumerate(deck):
            name = c.get("name", "") if isinstance(c, dict) else str(c)
            if name.lower() == lower or lower in name.lower():
                match_idx = i
                break
        if match_idx is not None and upgrade_actions:
            await client.send(action="choose_card", index=match_idx)
            await client.drain_updates(wait=1.0)
            return f"Upgraded {card_name} at rest site."
        elif match_idx is None:
            return f"Rested (smith selected) but card '{card_name}' not found in deck for upgrade."

    return f"Performed '{action}' at rest site."


@mcp.tool()
async def choose_event_option(index: int) -> str:
    """Pick an event option by index."""
    client = await get_client()
    resp = await client.send(action="choose_option", index=index)
    if resp.status == "error":
        return f"Error choosing event option {index}: {resp.error or resp.message}"

    await client.drain_updates(wait=1.5)
    new_state = client.last_state
    screen = get_screen(new_state) if new_state else "unknown"
    return f"Chose event option [{index}]. Screen: {screen}"


@mcp.tool()
async def proceed() -> str:
    """Generic proceed/continue — leave shop, skip rewards, advance past game over, etc."""
    client = await get_client()
    resp = await client.send(action="proceed")
    if resp.status == "error":
        return f"Error proceeding: {resp.error or resp.message}"

    await client.drain_updates(wait=1.0)
    new_state = client.last_state
    screen = get_screen(new_state) if new_state else "unknown"
    return f"Proceeded. Screen: {screen}"


@mcp.tool()
async def start_run(character: str = "Ironclad") -> str:
    """Start a new Slay the Spire run with the given character."""
    client = await get_client()
    resp = await client.send(action="start_run", character=character)
    if resp.status == "error":
        return f"Error starting run: {resp.error or resp.message}"

    await client.drain_updates(wait=2.0)
    new_state = client.last_state
    screen = get_screen(new_state) if new_state else "unknown"
    return f"Started run as {character}. Screen: {screen}"


@mcp.tool()
async def abandon_run() -> str:
    """Abandon the current run."""
    client = await get_client()
    resp = await client.send(action="abandon")
    if resp.status == "error":
        return f"Error abandoning run: {resp.error or resp.message}"

    await client.drain_updates(wait=2.0)
    new_state = client.last_state
    screen = get_screen(new_state) if new_state else "unknown"
    return f"Run abandoned. Screen: {screen}"


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main() -> None:
    """Run the MCP server over stdio."""
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
