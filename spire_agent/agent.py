"""Main agent loop — receive state, decide, act."""

from __future__ import annotations

import asyncio
import logging

from .client import SpireBridgeClient
from .state import find_actions, get_screen, get_actions
from .strategy.base import Strategy
from .strategy.heuristic import HeuristicStrategy

logger = logging.getLogger(__name__)


class Agent:
    """SpireBridge agent that plays STS2 autonomously."""

    def __init__(
        self,
        client: SpireBridgeClient,
        strategy: Strategy | None = None,
        character: str = "Ironclad",
    ):
        self.client = client
        self.strategy = strategy or HeuristicStrategy()
        self.character = character
        self.runs = 0
        self.floors_cleared = 0

    async def run(self, max_runs: int = 1) -> None:
        """Play through runs."""
        await self.client.connect()
        try:
            for _ in range(max_runs):
                await self._play_run()
                self.runs += 1
                logger.info("Run %d complete. Floors cleared: %d", self.runs, self.floors_cleared)
        finally:
            await self.client.close()

    async def _play_run(self) -> None:
        """Play a single run from start to death/victory."""
        state = await self.client.get_state()
        screen = get_screen(state)

        # Handle existing game state
        if screen == "game_over":
            pass  # Will start new run below
        elif screen not in ("main_menu",):
            # Abandon current run
            await self.client.send("abandon_run")
            await self.client.drain_updates(8)
            state = await self.client.get_state()
            if get_screen(state) not in ("main_menu", "game_over"):
                await self.client.send("abandon_run")
                await self.client.drain_updates(8)

        # Start run
        logger.info("Starting run as %s", self.character)
        await self.client.send("start_run", character=self.character)
        state = await self.client.wait_for_screen({"event", "map", "rewards"}, timeout=20)

        # Main game loop
        while True:
            state = await self.client.get_state()
            screen = get_screen(state)

            if screen == "game_over":
                logger.info("Game over!")
                return

            try:
                action = self.strategy.decide(state)
            except Exception:
                logger.exception("Strategy error on screen %s", screen)
                await asyncio.sleep(1)
                continue

            if action is None:
                logger.debug("No action for screen %s, waiting...", screen)
                await asyncio.sleep(1)
                continue

            action_name = action.pop("action")
            logger.info("Action: %s %s", action_name, action)
            resp = await self.client.send(action_name, **action)

            if resp.status == "error":
                logger.warning("Action failed: %s — %s", resp.error, resp.message)
                await asyncio.sleep(0.5)
            else:
                # Wait for state to settle
                await self.client.drain_updates(0.5)

                # For combat actions, wait for turn_started push
                if screen == "combat" and action_name in ("play", "end_turn", "use_potion"):
                    await self.client.drain_updates(1.0)

                if screen == "map":
                    # Map navigation triggers room transition
                    await self.client.drain_updates(2.0)
                    # Wait for the destination screen
                    state = await self.client.wait_for_screen(
                        {"combat", "event", "rest_site", "shop", "treasure", "map"},
                        timeout=10,
                    )
                    if get_screen(state) == "combat":
                        # Wait for combat animations
                        await asyncio.sleep(2)
