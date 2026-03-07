"""Heuristic strategy — rule-based decision making."""

from __future__ import annotations

import logging
from typing import Any

from ..state import (
    GameState,
    find_actions,
    get_actions,
    get_hand,
    get_hittable_enemies,
    get_screen,
    incoming_damage,
    player_hp,
)
from .base import Strategy

logger = logging.getLogger(__name__)


class HeuristicStrategy(Strategy):
    """Simple heuristic strategy.

    Combat priority:
    1. Use potions if low HP
    2. Play high-damage attacks targeting lowest HP enemy
    3. Play block cards if incoming damage is high
    4. End turn when out of energy or no good plays
    """

    async def decide(self, state: GameState) -> dict[str, Any] | None:
        screen = get_screen(state)
        actions = get_actions(state)

        if not actions:
            return None

        handler = getattr(self, f"_handle_{screen}", None)
        if handler:
            return handler(state, actions)

        logger.warning("Unhandled screen: %s", screen)
        return None

    def _handle_combat(self, state: GameState, actions: list) -> dict | None:
        hp, max_hp = player_hp(state)
        enemies = get_hittable_enemies(state)
        inc_dmg = incoming_damage(state)

        # Use potion if low HP
        if hp < max_hp * 0.3:
            potions = find_actions(state, "use_potion")
            for p in potions:
                cmd = {"action": "use_potion", "potion_index": p["potion_index"]}
                if "targets" in p and p["targets"]:
                    cmd["target"] = p["targets"][0]
                return cmd

        plays = find_actions(state, "play")
        if not plays:
            return {"action": "end_turn"}

        # Separate attacks and blocks
        hand = get_hand(state)
        attacks = []
        blocks = []
        other = []
        for p in plays:
            card_idx = p["card"]
            card = hand[card_idx] if card_idx < len(hand) else None
            if card is None:
                continue
            card_type = card.get("type", "")
            if card_type == "Attack":
                attacks.append((p, card))
            elif card_type == "Skill" and card.get("block"):
                blocks.append((p, card))
            else:
                other.append((p, card))

        # If incoming damage > our HP, prioritize block
        if inc_dmg > hp * 0.6 and blocks:
            p, card = blocks[0]
            return {"action": "play", "card": p["card"]}

        # Play highest damage attack targeting lowest HP enemy
        if attacks and enemies:
            # Sort by damage descending
            attacks.sort(key=lambda x: x[1].get("damage") or 0, reverse=True)
            p, card = attacks[0]
            target_enemy = min(enemies, key=lambda e: e.get("hp", 999))
            target_idx = enemies.index(target_enemy)
            cmd: dict[str, Any] = {"action": "play", "card": p["card"]}
            if "targets" in p and p["targets"]:
                cmd["target"] = target_idx
            return cmd

        # Play blocks
        if blocks:
            p, card = blocks[0]
            return {"action": "play", "card": p["card"]}

        # Play other cards
        if other:
            p, card = other[0]
            cmd = {"action": "play", "card": p["card"]}
            if "targets" in p and p["targets"]:
                cmd["target"] = 0
            return cmd

        return {"action": "end_turn"}

    def _handle_map(self, state: GameState, actions: list) -> dict | None:
        nodes = find_actions(state, "choose_node")
        if not nodes:
            return None

        hp, max_hp = player_hp(state)

        # Prefer: monster > event > rest (if high HP) > elite
        priority = {"Monster": 2, "Event": 3, "RestSite": 4, "Shop": 5, "Elite": 6, "Treasure": 1}
        if hp < max_hp * 0.4:
            priority["RestSite"] = 0  # Prioritize rest when low HP

        best = min(nodes, key=lambda n: priority.get(n.get("type", ""), 10))
        return {"action": "choose_node", "row": best["row"], "col": best["col"]}

    def _handle_event(self, state: GameState, actions: list) -> dict | None:
        opts = find_actions(state, "choose_option")
        if opts:
            return {"action": "choose_option", "index": opts[0]["index"]}
        return None

    def _handle_rewards(self, state: GameState, actions: list) -> dict | None:
        rewards = find_actions(state, "choose_reward")
        if rewards:
            return {"action": "choose_reward", "index": rewards[0]["index"]}
        # All collected
        return {"action": "proceed"}

    def _handle_card_reward(self, state: GameState, actions: list) -> dict | None:
        cards = state.get("card_choices", [])
        if not cards:
            return {"action": "skip"}

        # Pick highest rarity card
        rarity_order = {"Rare": 0, "Uncommon": 1, "Common": 2, "Basic": 3}
        best = min(cards, key=lambda c: rarity_order.get(c.get("rarity", ""), 5))
        idx = cards.index(best)
        return {"action": "choose_card", "index": idx}

    def _handle_card_select(self, state: GameState, actions: list) -> dict | None:
        picks = find_actions(state, "choose_card")
        if picks:
            return {"action": "choose_card", "index": picks[0]["index"]}
        return None

    def _handle_rest_site(self, state: GameState, actions: list) -> dict | None:
        hp, max_hp = player_hp(state)
        opts = find_actions(state, "choose_rest_option")

        # Heal if below 60%, otherwise smith
        heal = next((o for o in opts if o.get("id", "").upper() == "HEAL"), None)
        smith = next((o for o in opts if o.get("id", "").upper() == "SMITH"), None)

        if hp < max_hp * 0.6 and heal:
            return {"action": "choose_rest_option", "index": heal["index"]}
        if smith:
            return {"action": "choose_rest_option", "index": smith["index"]}
        if heal:
            return {"action": "choose_rest_option", "index": heal["index"]}
        if opts:
            return {"action": "choose_rest_option", "index": opts[0]["index"]}
        return None

    def _handle_shop(self, state: GameState, actions: list) -> dict | None:
        # Just leave for now
        return {"action": "proceed"}

    def _handle_treasure(self, state: GameState, actions: list) -> dict | None:
        chest = find_actions(state, "open_chest")
        if chest:
            return {"action": "open_chest"}
        return {"action": "proceed"}

    def _handle_main_menu(self, state: GameState, actions: list) -> dict | None:
        return None  # Agent loop handles this

    def _handle_game_over(self, state: GameState, actions: list) -> dict | None:
        return None  # Agent loop handles this
