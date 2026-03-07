import { SpireBridgeClient } from "./client.js";
import { Action, Card, Enemy, GameState, Potion, Reward } from "./types.js";
import {
  findActions,
  getEnemies,
  getHand,
  getHittableEnemies,
  getPlayer,
  getScreen,
  playerEnergy,
  playerHp,
} from "./state.js";
import { readFileSync, appendFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const NOTES_PATH = join(__dirname, "..", "notes.md");

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

const ACTION_TO_CLI: Record<string, string> = {
  play: "play",
  end_turn: "end-turn",
  use_potion: "use-potion",
  choose_node: "choose-map",
  choose_reward: "choose-reward",
  choose_card: "choose-card",
  choose_option: "choose-event",
  choose_rest_option: "rest",
  start_run: "start-run",
  proceed: "proceed",
  abandon: "abandon",
  skip: "choose-card skip",
  get_state: "state",
  discard_potion: "discard-potion",
  shop_buy: "shop-buy",
  open_chest: "open-chest",
};

function actionToCli(action: string): string {
  return ACTION_TO_CLI[action] ?? action.replace(/_/g, "-");
}

function fmtPileSummary(cards: Card[]): string {
  const counts: Record<string, number> = {};
  for (const c of cards) {
    let name = c.name ?? "?";
    if (c.upgraded) name += "+";
    counts[name] = (counts[name] ?? 0) + 1;
  }
  return Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, n]) => (n > 1 ? `${name} x${n}` : name))
    .join(", ");
}

function fmtCard(card: Card): string {
  let name = card.name ?? "?";
  if (card.upgraded) name += "+";
  if (card.cost !== undefined) name = `${name}(${card.cost})`;
  const parts = [name];
  if (card.damage) parts.push(`dmg:${card.damage}`);
  if (card.block) parts.push(`blk:${card.block}`);
  if (card.type) parts.push(card.type);
  if (card.exhausts) parts.push("Exhaust");
  return parts.join(" ");
}

function fmtEnemy(enemy: Enemy): string {
  const name = enemy.name ?? "Enemy";
  const hp = enemy.hp ?? "?";
  const maxHp = enemy.max_hp ?? "?";
  const intent = enemy.intent ?? {};
  let intentStr = "";
  if (Object.keys(intent).length > 0) {
    const itype = intent.type ?? "";
    const dmg = intent.damage ?? 0;
    const hits = intent.hits ?? 1;
    if (dmg && hits) {
      intentStr = hits > 1 ? ` [${itype} ${dmg}x${hits}=${dmg * hits}]` : ` [${itype} ${dmg}]`;
    } else {
      intentStr = ` [${itype}]`;
    }
  }
  const block = enemy.block ?? 0;
  const blockStr = block ? ` 🛡${block}` : "";
  return `${name} ${hp}/${maxHp}${blockStr}${intentStr}`;
}

function formatFullState(state: GameState): string {
  const lines: string[] = [];
  const screen = getScreen(state);
  lines.push(`=== Screen: ${screen.toUpperCase()} ===`);

  if (state.floor !== undefined) {
    lines.push(`Floor ${state.floor}` + (state.act !== undefined ? `, Act ${state.act}` : ""));
  }

  const player = getPlayer(state);
  const [hp, maxHp] = playerHp(state);
  const energy = playerEnergy(state);
  const block = player.block ?? 0;
  lines.push("\n--- Player ---");
  lines.push(`HP: ${hp}/${maxHp}  Energy: ${energy}` + (block ? `  Block: ${block}` : ""));

  const relics = player.relics ?? [];
  if (relics.length > 0) {
    const relicNames = relics.map((r) => r.name ?? "?");
    lines.push(`Relics: ${relicNames.join(", ")}`);
  }

  const potions = player.potions ?? [];
  const activePotions = potions.filter((p): p is Potion => !!p && !!p.name && p.name !== "Potion Slot");
  if (activePotions.length > 0) {
    lines.push(`Potions: ${activePotions.map((p) => p.name).join(", ")}`);
  }

  const enemies = getEnemies(state);
  if (enemies.length > 0) {
    lines.push("\n--- Enemies ---");
    for (const e of enemies) lines.push(`  ${fmtEnemy(e)}`);
  }

  const hand = getHand(state);
  if (hand.length > 0) {
    lines.push(`\n--- Hand (${hand.length} cards) ---`);
    hand.forEach((card, i) => {
      const playable = card.playable !== false ? "✓" : "✗";
      lines.push(`  [${i}] ${playable} ${fmtCard(card)}`);
    });
  }

  // Combat piles (only during combat)
  const drawPile = player.draw_pile ?? [];
  const discardPile = player.discard_pile ?? [];
  const exhaustPile = player.exhaust_pile ?? [];
  if (drawPile.length > 0 || discardPile.length > 0 || exhaustPile.length > 0) {
    if (drawPile.length > 0) {
      lines.push(`\n--- Draw Pile (${drawPile.length}) ---`);
      lines.push(`  ${fmtPileSummary(drawPile)}`);
    }
    if (discardPile.length > 0) {
      lines.push(`\n--- Discard Pile (${discardPile.length}) ---`);
      lines.push(`  ${fmtPileSummary(discardPile)}`);
    }
    if (exhaustPile.length > 0) {
      lines.push(`\n--- Exhaust Pile (${exhaustPile.length}) ---`);
      lines.push(`  ${fmtPileSummary(exhaustPile)}`);
    }
  }

  const deck = player.deck ?? [];
  if (deck.length > 0) {
    lines.push(`\n--- Deck (${deck.length} cards) ---`);
    const counts: Record<string, number> = {};
    for (const c of deck) {
      let name = c.name ?? "?";
      if (c.upgraded) name += "+";
      counts[name] = (counts[name] ?? 0) + 1;
    }
    const deckParts = Object.entries(counts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, n]) => (n > 1 ? `${name} x${n}` : name));
    lines.push(`  ${deckParts.join(", ")}`);
  }

  const cardChoices = state.card_choices ?? [];
  if (cardChoices.length > 0) {
    lines.push("\n--- Card Choices ---");
    cardChoices.forEach((c, i) => {
      let line = `  [${i}] ${fmtCard(c)}`;
      if (c.description) line += ` — ${c.description}`;
      lines.push(line);
    });
  }

  const rewards: Reward[] = state.rewards ?? [];
  if (rewards.length > 0) {
    lines.push("\n--- Rewards ---");
    rewards.forEach((r, i) => {
      const desc = r.name ?? r.gold ?? "";
      lines.push(`  [${i}] ${r.type}` + (desc ? `: ${desc}` : ""));
    });
  }

  const mapNodes = findActions(state, "choose_node");
  if (mapNodes.length > 0) {
    lines.push("\n--- Available Map Nodes ---");
    for (let i = 0; i < mapNodes.length; i++) {
      lines.push(`  [${i}] ${mapNodes[i]["type"] ?? "?"}`);
    }
  }

  const restOpts = findActions(state, "choose_rest_option");
  if (restOpts.length > 0) {
    lines.push("\n--- Rest Options ---");
    for (const o of restOpts) {
      lines.push(`  [${o["index"] ?? "?"}] ${o["id"] ?? "?"}`);
    }
  }

  const eventOpts = findActions(state, "choose_option");
  if (eventOpts.length > 0) {
    const eventText = state.event_text ?? state.event?.body ?? "";
    if (eventText) {
      lines.push("\n--- Event ---");
      lines.push(`  ${eventText.slice(0, 300)}`);
    }
    lines.push("\n--- Event Options ---");
    for (const o of eventOpts) {
      let label = (o["text"] as string) || (o["label"] as string) || "";
      if (!label) {
        const desc = (o["description"] as string) || "";
        if (desc && desc !== "Choose: ") label = desc;
      }
      if (!label && o["is_proceed"]) label = "[Proceed]";
      if (!label) label = "[Continue]";
      lines.push(`  [${o["index"] ?? "?"}] ${label}`);
    }
  }

  // Shop items
  const shopItems = findActions(state, "shop_buy");
  if (shopItems.length > 0) {
    const gold = (state as unknown as Record<string, unknown>).shop 
      ? ((state as unknown as Record<string, unknown>).shop as Record<string, unknown>)?.gold 
      : undefined;
    lines.push(`\n--- Shop${gold !== undefined ? ` (${gold} gold)` : ""} ---`);
    for (const item of shopItems) {
      const cost = item["cost"] ?? "?";
      const affordable = item["affordable"] ? "" : " [can't afford]";
      const desc = (item["description"] as string)?.replace(/^Buy /, "") ?? `item (${cost}g)`;
      lines.push(`  [${item["index"]}] ${desc}${affordable}`);
    }
  }

  const available: Action[] = state.available_actions ?? [];
  if (available.length > 0) {
    const cliCommands = [...new Set(available.map((a) => {
      const cli = actionToCli(a.action ?? "?");
      switch (a.action) {
        case "play": return 'play "<card>" [--target "<enemy>"]';
        case "use_potion": return 'use-potion "<name>" [--target "<enemy>"]';
        case "choose_reward": return "choose-reward <index>";
        case "choose_card": return 'choose-card "<name>"';
        case "choose_option": return "choose-event <index>";
        case "choose_node": return 'choose-map "<type or index>"';
        case "choose_rest_option": return "rest <heal|smith>";
        case "shop_buy": return 'shop-buy <index>';
        case "start_run": return "start-run [--character <name>]";
        default: return cli;
      }
    }))];
    lines.push(`\nAvailable commands: ${cliCommands.join(", ")}`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Resolution helpers
// ---------------------------------------------------------------------------

function resolveCard(hand: Card[], cardName: string): [number, Card] | null {
  const lower = cardName.toLowerCase();
  for (let i = 0; i < hand.length; i++) {
    if ((hand[i].name ?? "").toLowerCase() === lower) return [i, hand[i]];
  }
  for (let i = 0; i < hand.length; i++) {
    if ((hand[i].name ?? "").toLowerCase().includes(lower)) return [i, hand[i]];
  }
  return null;
}

function resolveEnemy(enemies: Enemy[], target: string): number | null {
  const lower = target.toLowerCase();
  for (let i = 0; i < enemies.length; i++) {
    if ((enemies[i].name ?? "").toLowerCase() === lower) return i;
  }
  for (let i = 0; i < enemies.length; i++) {
    if ((enemies[i].name ?? "").toLowerCase().includes(lower)) return i;
  }
  return null;
}

function resolvePotion(potions: (Potion | null | undefined)[], potionName: string): [number, Potion] | null {
  const lower = potionName.toLowerCase();
  for (let i = 0; i < potions.length; i++) {
    const p = potions[i];
    if (!p || !p.name) continue;
    if (p.name.toLowerCase() === lower || p.name.toLowerCase().includes(lower)) return [i, p];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Post-action state helper
// ---------------------------------------------------------------------------

async function settledState(client: SpireBridgeClient, waitMs = 1000): Promise<string> {
  await client.drainUpdates(waitMs);
  let state = client.lastState;
  if (!state) return "";

  // Event screens load options after the screen type changes — retry until populated
  const screen = getScreen(state);
  if (screen === "event" && findActions(state, "choose_option").length === 0) {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 500));
      state = await client.getState();
      if (getScreen(state) !== "event" || findActions(state, "choose_option").length > 0) break;
    }
  }

  return "\n\n" + formatFullState(state);
}

// ---------------------------------------------------------------------------
// Command functions
// ---------------------------------------------------------------------------

export async function getGameState(client: SpireBridgeClient): Promise<string> {
  const state = await client.getState();
  if (!state || Object.keys(state).length === 0) {
    return "No game state available. Is Slay the Spire running with SpireBridge?";
  }
  return formatFullState(state);
}

export async function playCard(
  client: SpireBridgeClient,
  cardName: string,
  target?: string
): Promise<string> {
  const state = await client.getState();
  const hand = getHand(state);

  const result = resolveCard(hand, cardName);
  if (!result) {
    const available = hand.map((c) => c.name ?? "?").join(", ");
    return `Card '${cardName}' not found. Available cards: ${available}`;
  }
  const [cardIdx, card] = result;

  const params: Record<string, unknown> = { card: cardIdx };

  if (target !== undefined) {
    const enemies = getHittableEnemies(state);
    const enemyIdx = resolveEnemy(enemies, target);
    if (enemyIdx === null) {
      const available = enemies.map((e) => e.name ?? "?").join(", ");
      return `Target '${target}' not found. Available enemies: ${available}`;
    }
    params["target"] = enemyIdx;
  }

  const resp = await client.send("play", params);
  if (resp.status === "error") {
    return `Error playing ${card.name}: ${resp.error ?? resp.message}`;
  }

  const targetStr = target ? ` on ${target}` : "";
  return `Played ${card.name}${targetStr}.` + await settledState(client, 1000);
}

export async function endTurn(client: SpireBridgeClient): Promise<string> {
  const resp = await client.send("end_turn");
  if (resp.status === "error") {
    return `Error ending turn: ${resp.error ?? resp.message}`;
  }

  return `Turn ended.` + await settledState(client, 1500);
}

export async function usePotion(
  client: SpireBridgeClient,
  potionName: string,
  target?: string
): Promise<string> {
  const state = await client.getState();
  const player = getPlayer(state);
  const potions = player.potions ?? [];

  const result = resolvePotion(potions, potionName);
  if (!result) {
    const available = potions
      .filter((p): p is Potion => !!p && !!p.name && p.name !== "Potion Slot")
      .map((p) => p.name)
      .join(", ");
    return `Potion '${potionName}' not found. Available: ${available || "none"}`;
  }
  const [potionIdx, potion] = result;

  const params: Record<string, unknown> = { potion_index: potionIdx };
  if (target !== undefined) {
    const enemies = getHittableEnemies(state);
    const enemyIdx = resolveEnemy(enemies, target);
    if (enemyIdx === null) {
      const available = enemies.map((e) => e.name ?? "?").join(", ");
      return `Target '${target}' not found. Available enemies: ${available}`;
    }
    params["target"] = enemyIdx;
  }

  const resp = await client.send("use_potion", params);
  if (resp.status === "error") {
    return `Error using ${potion.name}: ${resp.error ?? resp.message}`;
  }

  return `Used ${potion.name}.` + await settledState(client, 1000);
}

export async function chooseMapNode(client: SpireBridgeClient, nodeType: string): Promise<string> {
  const state = await client.getState();
  const nodes = findActions(state, "choose_node");

  if (nodes.length === 0) {
    return `No map nodes available. Current screen: ${getScreen(state)}`;
  }

  // Support index-based selection
  const asNum = parseInt(nodeType, 10);
  if (!isNaN(asNum) && asNum >= 0 && asNum < nodes.length) {
    const node = nodes[asNum];
    const resp = await client.send("choose_node", { row: node["row"], col: node["col"] });
    if (resp.status === "error") {
      return `Error choosing node: ${resp.error ?? resp.message}`;
    }
    return `Navigated to ${node["type"]}.` + await settledState(client, 2000);
  }

  const lower = nodeType.toLowerCase();
  let matches = nodes.filter((n) => (n["type"] as string ?? "").toLowerCase() === lower);
  if (matches.length === 0) {
    matches = nodes.filter((n) => (n["type"] as string ?? "").toLowerCase().includes(lower));
  }
  if (matches.length === 0) {
    const available = nodes.map((n, i) => `[${i}] ${n["type"] ?? "?"}`).join(", ");
    return `No node of type '${nodeType}' available. Available: ${available}`;
  }

  const node = matches[0];
  const resp = await client.send("choose_node", { row: node["row"], col: node["col"] });
  if (resp.status === "error") {
    return `Error choosing node: ${resp.error ?? resp.message}`;
  }

  return `Navigated to ${node["type"]}.` + await settledState(client, 2000);
}

export async function chooseReward(client: SpireBridgeClient, index: number): Promise<string> {
  const resp = await client.send("choose_reward", { index });
  if (resp.status === "error") {
    return `Error choosing reward ${index}: ${resp.error ?? resp.message}`;
  }

  return `Chose reward [${index}].` + await settledState(client, 1000);
}

export async function chooseCardReward(client: SpireBridgeClient, cardName: string): Promise<string> {
  const state = await client.getState();
  const screen = getScreen(state);

  if (cardName.toLowerCase() === "skip") {
    const resp = await client.send("skip");
    if (resp.status === "error") {
      return `Error skipping: ${resp.error ?? resp.message}`;
    }
    return "Skipped card reward." + await settledState(client, 1000);
  }

  const cards = state.card_choices ?? [];
  if (cards.length === 0) {
    return `No card choices available. Screen: ${screen}`;
  }

  const lower = cardName.toLowerCase();
  let matchIdx: number | null = null;

  // Support index-based selection
  const asNum = parseInt(cardName, 10);
  if (!isNaN(asNum) && asNum >= 0 && asNum < cards.length) {
    matchIdx = asNum;
  }

  // Name matching (exact then partial)
  if (matchIdx === null) {
    for (let i = 0; i < cards.length; i++) {
      if ((cards[i].name ?? "").toLowerCase() === lower) { matchIdx = i; break; }
    }
  }
  if (matchIdx === null) {
    for (let i = 0; i < cards.length; i++) {
      if ((cards[i].name ?? "").toLowerCase().includes(lower)) { matchIdx = i; break; }
    }
  }
  if (matchIdx === null) {
    const available = cards.map((c) => c.name ?? "?").join(", ");
    return `Card '${cardName}' not found. Available: ${available}`;
  }

  const resp = await client.send("choose_card", { index: matchIdx });
  if (resp.status === "error") {
    return `Error choosing card: ${resp.error ?? resp.message}`;
  }

  const chosen = cards[matchIdx].name ?? `card[${matchIdx}]`;
  // Context-aware response based on screen type
  const action = screen === "card_select" ? "Selected" : "Added";
  return `${action} ${chosen}.` + await settledState(client, 1000);
}

export async function restSiteAction(
  client: SpireBridgeClient,
  action: string,
  cardName?: string
): Promise<string> {
  const state = await client.getState();
  const opts = findActions(state, "choose_rest_option");

  if (opts.length === 0) {
    return `No rest options available. Screen: ${getScreen(state)}`;
  }

  const lower = action.toLowerCase();
  let idTarget: string;
  if (lower === "upgrade" || lower === "smith") idTarget = "SMITH";
  else if (lower === "heal") idTarget = "HEAL";
  else if (lower === "recall") idTarget = "RECALL";
  else if (lower === "lift") idTarget = "LIFT";
  else idTarget = action.toUpperCase();

  const opt = opts.find((o) => (o["id"] as string ?? "").toUpperCase() === idTarget);
  if (!opt) {
    const available = opts.map((o) => o["id"] ?? "?").join(", ");
    return `Rest option '${action}' not found. Available: ${available}`;
  }

  const resp = await client.send("choose_rest_option", { index: opt["index"] });
  if (resp.status === "error") {
    return `Error at rest site: ${resp.error ?? resp.message}`;
  }

  await client.drainUpdates(1000);

  if (idTarget === "SMITH" && cardName) {
    const newState = client.lastState ?? state;
    const upgradeActions = findActions(newState, "choose_card");
    const deck = getPlayer(newState).deck ?? [];
    const lowerCard = cardName.toLowerCase();
    let matchIdx: number | null = null;
    for (let i = 0; i < deck.length; i++) {
      const name = deck[i].name ?? "";
      if (name.toLowerCase() === lowerCard || name.toLowerCase().includes(lowerCard)) {
        matchIdx = i;
        break;
      }
    }
    if (matchIdx !== null && upgradeActions.length > 0) {
      await client.send("choose_card", { index: matchIdx });
      return `Upgraded ${cardName} at rest site.` + await settledState(client, 1000);
    } else if (matchIdx === null) {
      return `Rested (smith selected) but card '${cardName}' not found in deck for upgrade.` + await settledState(client, 500);
    }
  }

  return `Performed '${action}' at rest site.` + await settledState(client, 500);
}

export async function chooseEventOption(client: SpireBridgeClient, index: number): Promise<string> {
  const resp = await client.send("choose_option", { index });
  if (resp.status === "error") {
    return `Error choosing event option ${index}: ${resp.error ?? resp.message}`;
  }

  return `Chose event option [${index}].` + await settledState(client, 2000);
}

export async function shopBuy(client: SpireBridgeClient, index: number): Promise<string> {
  const resp = await client.send("shop_buy", { index });
  if (resp.status === "error") {
    return `Error buying item ${index}: ${resp.error ?? resp.message}`;
  }
  return `Bought item [${index}].` + await settledState(client, 1000);
}

export async function proceed(client: SpireBridgeClient): Promise<string> {
  const resp = await client.send("proceed");
  if (resp.status === "error") {
    return `Error proceeding: ${resp.error ?? resp.message}`;
  }

  return `Proceeded.` + await settledState(client, 1000);
}

export async function startRun(client: SpireBridgeClient, character = "Ironclad"): Promise<string> {
  const resp = await client.send("start_run", { character });
  if (resp.status === "error") {
    return `Error starting run: ${resp.error ?? resp.message}`;
  }

  // Wait for the Neow event screen (or map if Neow is skipped)
  const screen = await client.waitForScreen(new Set(["event", "map", "combat"]), 5000);
  if (screen) {
    return `Started run as ${character}.\n\n` + formatFullState(screen);
  }
  return `Started run as ${character}.` + await settledState(client, 2000);
}

export async function abandonRun(client: SpireBridgeClient): Promise<string> {
  const resp = await client.send("abandon");
  if (resp.status === "error") {
    return `Error abandoning run: ${resp.error ?? resp.message}`;
  }

  return `Run abandoned.` + await settledState(client, 2000);
}

// ---------------------------------------------------------------------------
// Card info — detailed lookup
// ---------------------------------------------------------------------------

function fmtCardDetailed(card: Card): string {
  const lines: string[] = [];
  let name = card.name ?? "?";
  if (card.upgraded) name += "+";
  lines.push(`**${name}**`);
  if (card.type) lines.push(`  Type: ${card.type}`);
  if (card.cost !== undefined) lines.push(`  Cost: ${card.cost}`);
  if (card.damage) lines.push(`  Damage: ${card.damage}`);
  if (card.block) lines.push(`  Block: ${card.block}`);
  if (card.rarity) lines.push(`  Rarity: ${card.rarity}`);
  if (card.exhausts) lines.push(`  Exhausts: yes`);
  if (card.description) lines.push(`  ${card.description}`);
  return lines.join("\n");
}

export async function cardInfo(client: SpireBridgeClient, cardName: string): Promise<string> {
  const state = await client.getState();
  const player = getPlayer(state);
  const lower = cardName.toLowerCase().replace(/\+$/, "");

  // Search all card pools: hand, deck, draw, discard, exhaust, card choices
  const pools: { label: string; cards: Card[] }[] = [
    { label: "Hand", cards: getHand(state) },
    { label: "Deck", cards: player.deck ?? [] },
    { label: "Draw Pile", cards: player.draw_pile ?? [] },
    { label: "Discard Pile", cards: player.discard_pile ?? [] },
    { label: "Exhaust Pile", cards: player.exhaust_pile ?? [] },
    { label: "Card Choices", cards: state.card_choices ?? [] },
  ];

  const matches: Card[] = [];
  const seen = new Set<string>();

  for (const pool of pools) {
    for (const card of pool.cards) {
      const name = (card.name ?? "").toLowerCase();
      const key = `${card.name}|${card.upgraded ?? false}`;
      if ((name === lower || name.includes(lower)) && !seen.has(key)) {
        seen.add(key);
        matches.push(card);
      }
    }
  }

  if (matches.length === 0) {
    return `Card '${cardName}' not found in hand, deck, or piles.`;
  }

  return matches.map(fmtCardDetailed).join("\n\n");
}

// ---------------------------------------------------------------------------
// Notes — persistent learnings across sessions
// ---------------------------------------------------------------------------

export function readNotes(): string {
  if (!existsSync(NOTES_PATH)) return "No notes yet.";
  const content = readFileSync(NOTES_PATH, "utf-8").trim();
  return content || "No notes yet.";
}

export function writeNote(note: string): string {
  const timestamp = new Date().toISOString().slice(0, 19).replace("T", " ");
  const entry = `- [${timestamp}] ${note}\n`;
  appendFileSync(NOTES_PATH, entry, "utf-8");
  return `Note saved.`;
}
