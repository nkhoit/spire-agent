"""SpireBridge WebSocket client with push event support."""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

import websockets
from websockets.asyncio.client import ClientConnection

logger = logging.getLogger(__name__)

GameState = dict[str, Any]


@dataclass
class StateUpdate:
    """A push state update from SpireBridge."""

    event: str
    seq: int
    state: GameState


@dataclass
class ActionResponse:
    """Response to a command sent to SpireBridge."""

    id: str
    status: str
    data: dict[str, Any] | None = None
    error: str | None = None
    message: str | None = None


class SpireBridgeClient:
    """Persistent WebSocket client for SpireBridge.

    Handles response correlation by request ID and routes push
    state_update events to subscribers.
    """

    def __init__(self, url: str = "ws://127.0.0.1:38642"):
        self.url = url
        self._ws: ClientConnection | None = None
        self._req_counter = 0
        self._pending: dict[str, asyncio.Future[dict]] = {}
        self._state_queue: asyncio.Queue[StateUpdate] = asyncio.Queue()
        self._reader_task: asyncio.Task | None = None
        self.last_state: GameState | None = None

    async def connect(self) -> None:
        """Connect to SpireBridge WebSocket server."""
        self._ws = await websockets.connect(self.url)
        self._reader_task = asyncio.create_task(self._read_loop())
        logger.info("Connected to SpireBridge at %s", self.url)

    async def close(self) -> None:
        """Close the connection."""
        if self._reader_task:
            self._reader_task.cancel()
            try:
                await self._reader_task
            except asyncio.CancelledError:
                pass
        if self._ws:
            await self._ws.close()

    async def _read_loop(self) -> None:
        """Read messages and route to response futures or state queue."""
        assert self._ws is not None
        try:
            async for raw in self._ws:
                try:
                    msg = json.loads(raw)
                except json.JSONDecodeError:
                    continue

                if msg.get("type") == "state_update":
                    update = StateUpdate(
                        event=msg["event"],
                        seq=msg.get("seq", 0),
                        state=msg["state"],
                    )
                    self.last_state = update.state
                    await self._state_queue.put(update)
                elif "id" in msg:
                    rid = msg["id"]
                    if rid in self._pending:
                        self._pending[rid].set_result(msg)
        except websockets.ConnectionClosed:
            logger.warning("WebSocket connection closed")
        except asyncio.CancelledError:
            pass

    async def send(self, action: str, **params: Any) -> ActionResponse:
        """Send a command and wait for the correlated response."""
        assert self._ws is not None
        self._req_counter += 1
        rid = f"req_{self._req_counter}"

        payload = {"action": action, "id": rid, **params}
        fut: asyncio.Future[dict] = asyncio.get_event_loop().create_future()
        self._pending[rid] = fut

        await self._ws.send(json.dumps(payload))

        try:
            result = await asyncio.wait_for(fut, timeout=15.0)
            return ActionResponse(
                id=result.get("id", rid),
                status=result.get("status", "unknown"),
                data=result.get("data"),
                error=result.get("error"),
                message=result.get("message"),
            )
        except asyncio.TimeoutError:
            logger.error("Timeout waiting for response to %s", action)
            return ActionResponse(id=rid, status="error", error="timeout")
        finally:
            self._pending.pop(rid, None)

    async def get_state(self) -> GameState:
        """Query current game state."""
        resp = await self.send("get_state")
        if resp.data:
            self.last_state = resp.data
        return self.last_state or {}

    async def wait_for_screen(
        self, target: str | set[str], timeout: float = 15.0
    ) -> GameState | None:
        """Wait for a push state_update matching the target screen(s)."""
        targets = {target} if isinstance(target, str) else target

        # Check last known state
        if self.last_state and self.last_state.get("screen") in targets:
            return self.last_state

        deadline = asyncio.get_event_loop().time() + timeout
        while True:
            remaining = deadline - asyncio.get_event_loop().time()
            if remaining <= 0:
                break
            try:
                update = await asyncio.wait_for(
                    self._state_queue.get(), timeout=remaining
                )
                if update.state.get("screen") in targets:
                    return update.state
            except asyncio.TimeoutError:
                break

        # Fallback: explicit query
        return await self.get_state()

    async def drain_updates(self, wait: float = 0.3) -> GameState | None:
        """Wait briefly, then drain all queued state updates."""
        await asyncio.sleep(wait)
        while not self._state_queue.empty():
            try:
                update = self._state_queue.get_nowait()
                self.last_state = update.state
            except asyncio.QueueEmpty:
                break
        return self.last_state

    async def state_updates(self) -> AsyncIterator[StateUpdate]:
        """Async iterator over state updates."""
        while True:
            update = await self._state_queue.get()
            yield update
