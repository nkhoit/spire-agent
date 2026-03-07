#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { SpireBridgeClient } from "./client.js";
import * as commands from "./commands.js";

const server = new McpServer({ name: "spire-bridge", version: "0.1.0" });

let _client: SpireBridgeClient | null = null;

async function getClient(): Promise<SpireBridgeClient> {
  if (!_client) {
    _client = new SpireBridgeClient();
    await _client.connect();
  }
  return _client;
}

server.tool(
  "get_game_state",
  "Get the current full game state — screen, player, enemies, hand, deck, map, etc.",
  {},
  async () => {
    const client = await getClient();
    const result = await commands.getGameState(client);
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "play_card",
  "Play a card from hand by name. Optionally specify a target enemy by name.",
  {
    card_name: z.string().describe("Card name (case-insensitive, partial match)"),
    target: z.string().optional().describe("Target enemy name"),
  },
  async ({ card_name, target }) => {
    const client = await getClient();
    const result = await commands.playCard(client, card_name, target);
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "end_turn",
  "End the current combat turn.",
  {},
  async () => {
    const client = await getClient();
    const result = await commands.endTurn(client);
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "use_potion",
  "Use a potion by name. Optionally specify a target enemy.",
  {
    potion_name: z.string().describe("Potion name"),
    target: z.string().optional().describe("Target enemy name"),
  },
  async ({ potion_name, target }) => {
    const client = await getClient();
    const result = await commands.usePotion(client, potion_name, target);
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "choose_map_node",
  "Navigate the map to a node of the given type. Valid types: Monster, Elite, RestSite, Shop, Event, Treasure.",
  {
    node_type: z.string().describe("Node type: Monster, Elite, RestSite, Shop, Event, Treasure"),
  },
  async ({ node_type }) => {
    const client = await getClient();
    const result = await commands.chooseMapNode(client, node_type);
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "choose_reward",
  "Pick a reward by index from the rewards screen.",
  {
    index: z.number().int().describe("Reward index"),
  },
  async ({ index }) => {
    const client = await getClient();
    const result = await commands.chooseReward(client, index);
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "choose_card_reward",
  "Pick a card from the card reward screen by name, or pass 'skip' to skip.",
  {
    card_name: z.string().describe("Card name or 'skip'"),
  },
  async ({ card_name }) => {
    const client = await getClient();
    const result = await commands.chooseCardReward(client, card_name);
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "rest_site_action",
  "Perform a rest site action: 'heal' or 'smith'/'upgrade'. For smith, optionally specify a card name to upgrade.",
  {
    action: z.string().describe("Action: heal, smith/upgrade"),
    card_name: z.string().optional().describe("Card to upgrade (for smith)"),
  },
  async ({ action, card_name }) => {
    const client = await getClient();
    const result = await commands.restSiteAction(client, action, card_name);
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "choose_event_option",
  "Pick an event option by index.",
  {
    index: z.number().int().describe("Option index"),
  },
  async ({ index }) => {
    const client = await getClient();
    const result = await commands.chooseEventOption(client, index);
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "proceed",
  "Generic proceed/continue — leave shop, skip rewards, advance past game over, etc.",
  {},
  async () => {
    const client = await getClient();
    const result = await commands.proceed(client);
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "start_run",
  "Start a new Slay the Spire run with the given character.",
  {
    character: z.string().default("Ironclad").describe("Character name (default: Ironclad)"),
  },
  async ({ character }) => {
    const client = await getClient();
    const result = await commands.startRun(client, character);
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "abandon_run",
  "Abandon the current run.",
  {},
  async () => {
    const client = await getClient();
    const result = await commands.abandonRun(client);
    return { content: [{ type: "text", text: result }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
