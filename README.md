# spire-agent

AI agent that plays Slay the Spire 2 via [SpireBridge](https://github.com/nkhoit/SpireBridge).

## Setup

```bash
# Requires Python 3.11+
python -m venv .venv
source .venv/bin/activate
pip install -e .
```

## Usage

```bash
# Start Slay the Spire 2 with SpireBridge mod loaded, then:
spire-agent
```

The agent connects to `ws://127.0.0.1:38642`, starts a run, and plays autonomously.

## Architecture

```
SpireBridge (game mod)          spire-agent (this repo)
┌─────────────────────┐         ┌──────────────────────┐
│ STS2 game process   │  WS     │ Python client        │
│ WebSocket server    │◄───────►│ State → Decision     │
│ State/Action API    │         │ Strategy engine       │
└─────────────────────┘         └──────────────────────┘
```

- **Client** (`spire_agent/client.py`) — persistent WebSocket connection, push event handling, response correlation
- **Agent** (`spire_agent/agent.py`) — main loop: receive state → decide → act
- **Strategy** (`spire_agent/strategy/`) — pluggable decision-making (heuristic, LLM, hybrid)

## Requirements

- [SpireBridge](https://github.com/nkhoit/SpireBridge) v0.1.1+ mod installed in STS2
- Slay the Spire 2 running on the same machine
