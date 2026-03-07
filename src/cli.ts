#!/usr/bin/env node
import { Command } from "commander";
import { SpireBridgeClient } from "./client.js";
import * as commands from "./commands.js";

const DEFAULT_URL = "ws://127.0.0.1:38642";

async function run(url: string, fn: (client: SpireBridgeClient) => Promise<string>): Promise<void> {
  const client = new SpireBridgeClient(url);
  try {
    await client.connect();
  } catch {
    console.error(`Could not connect to SpireBridge at ${url}`);
    console.error("Make sure Slay the Spire 2 is running with the SpireBridge mod.");
    process.exit(1);
  }
  try {
    const result = await fn(client);
    console.log(result);
  } finally {
    client.close();
  }
}

const program = new Command();
program
  .name("spire-cli")
  .description("Control Slay the Spire 2 via SpireBridge")
  .option("--url <url>", "SpireBridge WebSocket URL", DEFAULT_URL);

program
  .command("state")
  .description("Get current game state")
  .action(async () => {
    const { url } = program.opts<{ url: string }>();
    await run(url, (c) => commands.getGameState(c));
  });

program
  .command("play <card>")
  .description("Play a card from hand")
  .option("--target <enemy>", "Target enemy name")
  .action(async (card: string, opts: { target?: string }) => {
    const { url } = program.opts<{ url: string }>();
    await run(url, (c) => commands.playCard(c, card, opts.target));
  });

program
  .command("end-turn")
  .description("End the current combat turn")
  .action(async () => {
    const { url } = program.opts<{ url: string }>();
    await run(url, (c) => commands.endTurn(c));
  });

program
  .command("potion <name>")
  .description("Use a potion")
  .option("--target <enemy>", "Target enemy name")
  .action(async (name: string, opts: { target?: string }) => {
    const { url } = program.opts<{ url: string }>();
    await run(url, (c) => commands.usePotion(c, name, opts.target));
  });

program
  .command("map <type>")
  .description("Choose a map node by type (Monster, Elite, RestSite, Shop, Event, Treasure)")
  .action(async (type: string) => {
    const { url } = program.opts<{ url: string }>();
    await run(url, (c) => commands.chooseMapNode(c, type));
  });

program
  .command("reward <index>")
  .description("Choose a reward by index")
  .action(async (index: string) => {
    const { url } = program.opts<{ url: string }>();
    await run(url, (c) => commands.chooseReward(c, parseInt(index, 10)));
  });

program
  .command("card-reward <name>")
  .description("Choose a card reward by name (or 'skip')")
  .action(async (name: string) => {
    const { url } = program.opts<{ url: string }>();
    await run(url, (c) => commands.chooseCardReward(c, name));
  });

program
  .command("rest <action>")
  .description("Perform a rest site action: heal, smith/upgrade")
  .option("--card <name>", "Card to upgrade (for smith)")
  .action(async (action: string, opts: { card?: string }) => {
    const { url } = program.opts<{ url: string }>();
    await run(url, (c) => commands.restSiteAction(c, action, opts.card));
  });

program
  .command("event <index>")
  .description("Choose an event option by index")
  .action(async (index: string) => {
    const { url } = program.opts<{ url: string }>();
    await run(url, (c) => commands.chooseEventOption(c, parseInt(index, 10)));
  });

program
  .command("proceed")
  .description("Proceed/continue past current screen")
  .action(async () => {
    const { url } = program.opts<{ url: string }>();
    await run(url, (c) => commands.proceed(c));
  });

program
  .command("start")
  .description("Start a new run")
  .option("--character <name>", "Character name", "Ironclad")
  .action(async (opts: { character: string }) => {
    const { url } = program.opts<{ url: string }>();
    await run(url, (c) => commands.startRun(c, opts.character));
  });

program
  .command("abandon")
  .description("Abandon the current run")
  .action(async () => {
    const { url } = program.opts<{ url: string }>();
    await run(url, (c) => commands.abandonRun(c));
  });

program.parse();
