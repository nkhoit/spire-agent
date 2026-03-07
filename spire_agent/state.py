"""Game state helpers and type aliases."""

from __future__ import annotations

from typing import Any

GameState = dict[str, Any]
Action = dict[str, Any]


def get_actions(state: GameState) -> list[Action]:
    """Get available_actions from state."""
    return state.get("available_actions", [])


def find_actions(state: GameState, action_type: str) -> list[Action]:
    """Filter available_actions by action type."""
    return [a for a in get_actions(state) if a.get("action") == action_type]


def get_screen(state: GameState) -> str:
    """Get current screen name."""
    return state.get("screen", "unknown")


def get_player(state: GameState) -> dict[str, Any]:
    """Get player info."""
    return state.get("player", {})


def get_hand(state: GameState) -> list[dict]:
    """Get cards in hand."""
    return get_player(state).get("hand", [])


def get_enemies(state: GameState) -> list[dict]:
    """Get enemy list."""
    return state.get("enemies", [])


def get_hittable_enemies(state: GameState) -> list[dict]:
    """Get enemies that can be targeted."""
    return [e for e in get_enemies(state) if e.get("is_hittable")]


def player_hp(state: GameState) -> tuple[int, int]:
    """Return (current_hp, max_hp)."""
    p = get_player(state)
    return p.get("hp", 0), p.get("max_hp", 0)


def player_energy(state: GameState) -> int:
    """Return current energy."""
    return get_player(state).get("energy", 0)


def incoming_damage(state: GameState) -> int:
    """Estimate total incoming damage from enemy intents."""
    total = 0
    for e in get_enemies(state):
        intent = e.get("intent", {})
        total += intent.get("damage", 0) * intent.get("hits", 1)
    return total
