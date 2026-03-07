"""LLM-powered strategy — delegates decisions to a language model."""

from __future__ import annotations

import logging
import re
from typing import Any

from ..llm.base import LLMProvider
from ..state import (
    GameState,
    get_actions,
    get_enemies,
    get_hand,
    get_screen,
    player_energy,
    player_hp,
)
from .base import Strategy

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are an expert Slay the Spire 2 player. "
    "Analyze the game state and choose the best action. "
    "Respond with ONLY the action number."
)


def _format_state(state: GameState, actions: list[dict]) -> str:
    """Format game state into a human-readable prompt."""
    lines: list[str] = []

    screen = get_screen(state)
    lines.append(f"Screen: {screen}")

    # Player stats
    player = state.get("player", {})
    if player:
        hp, max_hp = player_hp(state)
        energy = player_energy(state)
        lines.append(f"Player: HP {hp}/{max_hp}, Energy {energy}")

    # Hand
    hand = get_hand(state)
    if hand:
        lines.append("Hand:")
        for i, card in enumerate(hand):
            name = card.get("name", f"Card {i}")
            cost = card.get("cost", "?")
            card_type = card.get("type", "")
            desc = card.get("description", "")
            lines.append(f"  [{i}] {name} (Cost: {cost}, Type: {card_type}) — {desc}")

    # Enemies
    enemies = get_enemies(state)
    if enemies:
        lines.append("Enemies:")
        for i, enemy in enumerate(enemies):
            name = enemy.get("name", f"Enemy {i}")
            hp = enemy.get("hp", "?")
            max_hp = enemy.get("max_hp", "?")
            intent = enemy.get("intent", {})
            intent_str = ""
            if intent:
                intent_type = intent.get("type", "")
                intent_dmg = intent.get("damage", "")
                intent_str = f", Intent: {intent_type}"
                if intent_dmg:
                    intent_str += f" {intent_dmg}"
            lines.append(f"  [{i}] {name}: HP {hp}/{max_hp}{intent_str}")

    # Card choices (non-combat screens)
    card_choices = state.get("card_choices", [])
    if card_choices:
        lines.append("Card Choices:")
        for i, card in enumerate(card_choices):
            name = card.get("name", f"Card {i}")
            rarity = card.get("rarity", "")
            lines.append(f"  [{i}] {name} ({rarity})")

    # Available actions
    lines.append("\nAvailable Actions:")
    for i, action in enumerate(actions):
        lines.append(f"  {i + 1}. {action}")

    return "\n".join(lines)


def _parse_action_number(text: str, num_actions: int) -> int | None:
    """Extract a 1-based action number from LLM response."""
    text = text.strip()
    # Try direct integer parse
    try:
        n = int(text)
        if 1 <= n <= num_actions:
            return n
    except ValueError:
        pass
    # Regex: first number in response
    match = re.search(r"\b(\d+)\b", text)
    if match:
        n = int(match.group(1))
        if 1 <= n <= num_actions:
            return n
    return None


class LLMStrategy(Strategy):
    """Strategy that uses a language model to decide actions."""

    def __init__(self, provider: LLMProvider, model: str | None = None) -> None:
        self.provider = provider
        self.model = model

    async def decide(self, state: GameState) -> dict[str, Any] | None:
        """Ask the LLM to pick an action from the available list."""
        actions = get_actions(state)
        if not actions:
            return None

        prompt = _format_state(state, actions)
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ]

        for attempt in range(3):
            try:
                response = await self.provider.complete(messages, model=self.model)
                logger.debug("LLM response (attempt %d): %r", attempt + 1, response)
                idx = _parse_action_number(response, len(actions))
                if idx is not None:
                    chosen = actions[idx - 1]
                    logger.info("LLM chose action %d: %s", idx, chosen)
                    return dict(chosen)
                logger.warning("Could not parse action number from: %r (attempt %d)",
                               response, attempt + 1)
            except Exception:
                logger.exception("LLM call failed on attempt %d", attempt + 1)
                if attempt == 2:
                    return None

        logger.warning("LLM failed after 3 attempts, falling back to first action")
        return dict(actions[0])
