# spire-agent

MCP server for Slay the Spire 2 via [SpireBridge](https://github.com/nkhoit/SpireBridge). Connect it to any MCP-capable LLM client (GitHub Copilot CLI, Claude Code, Codex, Claude Desktop, etc.) and let the AI play Spire.

## Setup

```bash
npm install && npm run build
```

Or install globally:

```bash
npm install -g .
```

Then use `spire-mcp` and `spire-cli` directly.

## Usage

### GitHub Copilot CLI / Claude Code / Codex

Add to your MCP config (`.copilot/mcp-config.json`, `.claude/mcp-config.json`, etc.):

```json
{
  "mcpServers": {
    "spire-bridge": {
      "command": "spire-mcp"
    }
  }
}
```

Or without global install:

```json
{
  "mcpServers": {
    "spire-bridge": {
      "command": "npx",
      "args": ["--prefix", "/path/to/spire-agent", "spire-mcp"]
    }
  }
}
```

### Claude Desktop

Add to Claude Desktop settings → Developer → MCP Servers.

### Then

1. Start Slay the Spire 2 with SpireBridge mod loaded
2. Open your MCP client
3. Tell the AI to play: "Start a Slay the Spire run as Ironclad"

## Architecture

```
MCP Client (LLM)           MCP Server              SpireBridge
┌──────────────┐   stdio   ┌──────────────┐   WS   ┌──────────┐
│ Copilot CLI  │◄─────────►│ spire-mcp    │◄──────►│ STS2     │
│ Claude Code  │           │ Name → Index  │        │ game     │
│ Codex, etc.  │           │ State format  │        │          │
└──────────────┘           └──────────────┘        └──────────┘
```

## Tools

| Tool | Description |
|------|-------------|
| `get_game_state` | Get current game state (screen, HP, hand, enemies, etc.) |
| `play_card` | Play a card by name, with optional target |
| `end_turn` | End the current turn |
| `use_potion` | Use a potion by name |
| `choose_map_node` | Navigate to a map node by type |
| `choose_reward` | Pick a reward |
| `choose_card_reward` | Pick a card reward by name or skip |
| `rest_site_action` | Heal, smith, or upgrade at rest sites |
| `choose_event_option` | Pick an event option |
| `proceed` | Continue/advance |
| `start_run` | Start a new run |
| `abandon_run` | Abandon current run |

## CLI

```
spire-cli state
spire-cli play <card> [--target <enemy>]
spire-cli end-turn
spire-cli potion <name> [--target <enemy>]
spire-cli map <type>
spire-cli reward <index>
spire-cli card-reward <name>
spire-cli rest <action> [--card <name>]
spire-cli event <index>
spire-cli proceed
spire-cli start [--character <name>]
spire-cli abandon
```

### OpenClaw

spire-agent includes an [OpenClaw](https://github.com/openclaw/openclaw) skill at `skill/SKILL.md`. Install it to let your OpenClaw assistant play Spire via CLI:

```bash
# In your OpenClaw workspace skills config, add:
openclaw skills add /path/to/spire-agent/skill
```

The skill teaches the agent the CLI commands and gameplay loop. The agent will call `spire-cli` via `exec`, get the full game state back after each action, and make decisions autonomously.

**How it works:**
1. Each CLI command opens a WebSocket to SpireBridge, sends the action, waits for the game state to settle (via push events), and returns the full state
2. The agent reads the state, decides what to do, and calls the next command
3. No persistent connection needed — each invocation is self-contained

**Requirements:** The game must be running on the same machine as OpenClaw (or the agent needs network access to the SpireBridge WebSocket at `ws://127.0.0.1:38642`).

## Requirements

- Node.js 18+
- [SpireBridge](https://github.com/nkhoit/SpireBridge) v0.1.1+ mod in STS2
- Slay the Spire 2 running on the same machine (or accessible via WebSocket)
