#!/usr/bin/env node
import { Command } from "commander";
import { SpireBridgeClient } from "./client.js";
import { enableDebug } from "./debug.js";
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
  .option("--url <url>", "SpireBridge WebSocket URL", DEFAULT_URL)
  .option("--debug", "Enable debug logging to /tmp/spire-debug.log (or set SPIRE_DEBUG=1)")
  .hook("preAction", () => {
    const opts = program.opts<{ debug?: boolean }>();
    if (opts.debug || process.env.SPIRE_DEBUG === "1") enableDebug();
  });

program
  .command("state")
  .description("Get current game state")
  .action(async () => {
    const { url } = program.opts<{ url: string }>();
    await run(url, (c) => commands.getGameState(c));
  });

program
  .command("play <cards...>")
  .description("Play one or more cards. Use commas to separate: play strike,bash target,defend")
  .option("--target <enemy>", "Target enemy name (for single card)")
  .action(async (cards: string[], opts: { target?: string }) => {
    const { url } = program.opts<{ url: string }>();
    // If single card with --target, use playCard; otherwise parse comma-separated or multiple args
    const joined = cards.join(" ");
    const specs = joined.includes(",") ? joined.split(",") : cards.length === 1 ? [joined] : cards;
    if (specs.length === 1 && !specs[0].includes(" ")) {
      await run(url, (c) => commands.playCard(c, specs[0].trim(), opts.target));
    } else {
      await run(url, (c) => commands.playCards(c, specs.map(s => s.trim())));
    }
  });

program
  .command("end-turn")
  .description("End the current combat turn")
  .action(async () => {
    const { url } = program.opts<{ url: string }>();
    await run(url, (c) => commands.endTurn(c));
  });

program
  .command("use-potion <name>")
  .description("Use a potion")
  .option("--target <enemy>", "Target enemy name")
  .action(async (name: string, opts: { target?: string }) => {
    const { url } = program.opts<{ url: string }>();
    await run(url, (c) => commands.usePotion(c, name, opts.target));
  });

program
  .command("choose-map <type>")
  .description("Choose a map node by type (Monster, Elite, RestSite, Shop, Event, Treasure)")
  .action(async (type: string) => {
    const { url } = program.opts<{ url: string }>();
    await run(url, (c) => commands.chooseMapNode(c, type));
  });

program
  .command("choose-reward <index>")
  .description("Choose a reward by index")
  .action(async (index: string) => {
    const { url } = program.opts<{ url: string }>();
    await run(url, (c) => commands.chooseReward(c, parseInt(index, 10)));
  });

program
  .command("choose-card <name>")
  .description("Choose a card by name from card reward or card selection screen (or 'skip')")
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
  .command("choose-event <index>")
  .description("Choose an event option by index")
  .action(async (index: string) => {
    const { url } = program.opts<{ url: string }>();
    await run(url, (c) => commands.chooseEventOption(c, parseInt(index, 10)));
  });

program
  .command("shop-buy <index>")
  .description("Buy an item from the shop by index")
  .action(async (index: string) => {
    const { url } = program.opts<{ url: string }>();
    await run(url, (c) => commands.shopBuy(c, parseInt(index, 10)));
  });

program
  .command("proceed")
  .description("Proceed/continue past current screen")
  .action(async () => {
    const { url } = program.opts<{ url: string }>();
    await run(url, (c) => commands.proceed(c));
  });

program
  .command("start-run")
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

program
  .command("continue")
  .description("Continue an existing run from main menu")
  .action(async () => {
    const { url } = program.opts<{ url: string }>();
    await run(url, (c) => commands.continueRun(c));
  });

program
  .command("card-info <name>")
  .description("Look up detailed card information by name")
  .action(async (name: string) => {
    const { url } = program.opts<{ url: string }>();
    await run(url, (c) => commands.cardInfo(c, name));
  });

program
  .command("relic-info <name>")
  .description("Look up relic information by name")
  .action(async (name: string) => {
    const { url } = program.opts<{ url: string }>();
    await run(url, (c) => commands.relicInfo(c, name));
  });

program
  .command("potion-info <name>")
  .description("Look up potion information by name")
  .action(async (name: string) => {
    const { url } = program.opts<{ url: string }>();
    await run(url, (c) => commands.potionInfo(c, name));
  });

program
  .command("notes")
  .description("Read persistent notes/learnings")
  .action(() => {
    console.log(commands.readNotes());
  });

program
  .command("note <text>")
  .description("Save a persistent note/learning")
  .action((text: string) => {
    console.log(commands.writeNote(text));
  });

program.parse();
