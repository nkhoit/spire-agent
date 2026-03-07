"""Base strategy interface."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from ..state import GameState


class Strategy(ABC):
    """Abstract strategy — decides what action to take given game state."""

    @abstractmethod
    def decide(self, state: GameState) -> dict[str, Any] | None:
        """Return an action dict or None to wait.

        The returned dict must include an 'action' key matching a SpireBridge
        action name, plus any required parameters.
        """
        ...
