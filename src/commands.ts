import { SpireBridgeClient } from "./client.js";
import { Action, Card, Enemy, GameState, Potion, Reward } from "./types.js";
import { debug } from "./debug.js";
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
  continue_run: "continue",
  skip: "choose-card skip",
  get_state: "state",
  discard_potion: "discard-potion",
  shop_buy: "shop-buy",
  open_chest: "open-chest",
};

function actionToCli(action: string): string {
  return ACTION_TO_CLI[action] ?? action.replace(/_/g, "-");
}

function cardName(card: Card): string {
  let name = card.name ?? "?";
  if (card.upgraded && !name.endsWith("+")) name += "+";
  return name;
}

function fmtPileSummary(cards: Card[]): string {
  const counts: Record<string, number> = {};
  for (const c of cards) {
    counts[cardName(c)] = (counts[cardName(c)] ?? 0) + 1;
  }
  return Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, n]) => (n > 1 ? `${name} x${n}` : name))
    .join(", ");
}

function fmtCard(card: Card): string {
  let name = cardName(card);
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
  
  // Handle intents (array from SpireBridge) or intent (singular legacy)
  const intents: Array<{type?: string; damage?: number; hits?: number}> = 
    (enemy as unknown as Record<string, unknown>).intents as Array<{type?: string; damage?: number; hits?: number}> 
    ?? (enemy.intent ? [enemy.intent] : []);
  let intentStr = "";
  if (intents.length > 0) {
    const parts: string[] = [];
    for (const intent of intents) {
      const itype = intent.type ?? "";
      const dmg = intent.damage ?? 0;
      const hits = intent.hits ?? 1;
      if (dmg && hits) {
        parts.push(hits > 1 ? `${itype} ${dmg}x${hits}=${dmg * hits}` : `${itype} ${dmg}`);
      } else {
        parts.push(String(itype));
      }
    }
    intentStr = ` [${parts.join(" + ")}]`;
  }
  
  const block = enemy.block ?? 0;
  const blockStr = block ? ` 🛡${block}` : "";
  
  const powers = (enemy as unknown as Record<string, unknown>).powers as Array<Record<string, unknown>> | undefined;
  let powerStr = "";
  if (powers && powers.length > 0) {
    const ps = powers.map(p => {
      const name = p.name as string ?? p.id as string ?? "?";
      const amt = p.amount as number;
      return amt && amt !== 1 ? `${name} ${amt}` : name;
    });
    powerStr = ` (${ps.join(", ")})`;
  }
  
  return `${name} ${hp}/${maxHp}${blockStr}${intentStr}${powerStr}`;
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
  const energy = player.energy;
  const maxEnergy = (player as unknown as Record<string, unknown>).max_energy;
  const block = player.block ?? 0;
  lines.push("\n--- Player ---");
  let playerLine = `HP: ${hp}/${maxHp}`;
  if (energy !== undefined) playerLine += `  Energy: ${energy}${maxEnergy !== undefined ? `/${maxEnergy}` : ""}`;
  if (block) playerLine += `  Block: ${block}`;
  lines.push(playerLine);

  // Player powers/status effects
  const powers = (player as unknown as Record<string, unknown>).powers as Array<Record<string, unknown>> | undefined;
  if (powers && powers.length > 0) {
    const powerStrs = powers.map(p => {
      const name = p.name as string ?? p.id as string ?? "?";
      const amt = p.amount as number;
      return amt && amt !== 1 ? `${name} ${amt}` : name;
    });
    lines.push(`Status: ${powerStrs.join(", ")}`);
  }

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
    for (let i = 0; i < enemies.length; i++) lines.push(`  [${i}] ${fmtEnemy(enemies[i])}`);
  }

  const hand = getHand(state);
  if (hand.length > 0) {
    lines.push(`\n--- Hand (${hand.length} cards) ---`);
    hand.forEach((card, i) => {
      const unplayable = card.playable === false ? " ✗" : "";
      lines.push(`  [${i}] ${fmtCard(card)}${unplayable}`);
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
      counts[cardName(c)] = (counts[cardName(c)] ?? 0) + 1;
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
      const up = (c as unknown as Record<string, unknown>).upgrade_preview as Record<string, unknown> | undefined;
      if (up?.description) line += ` → Upgraded: ${up.description}`;
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

  // Shop items (use rich shop state if available, fall back to actions)
  const shopData = (state as unknown as Record<string, unknown>).shop as Record<string, unknown> | undefined;
  const shopItemsList = (shopData?.items as Array<Record<string, unknown>>) ?? [];
  const shopActions = findActions(state, "shop_buy");
  if (shopItemsList.length > 0 || shopActions.length > 0) {
    const gold = shopData?.gold;
    lines.push(`\n--- Shop${gold !== undefined ? ` (${gold} gold)` : ""} ---`);
    if (shopItemsList.length > 0) {
      for (const item of shopItemsList) {
        const cost = item.cost ?? "?";
        const affordable = item.affordable === false ? " ✗ Can't afford" : "";
        const name = (item.name as string) ?? "item";
        const desc = (item.description as string) ? ` — ${item.description}` : "";
        const type = (item.type as string) ?? "";
        const cardType = (item.card_type as string) ?? "";
        const suffix = type === "card" && cardType ? ` ${cardType}` : "";
        lines.push(`  [${item.index}] ${name} (${cost}g)${suffix}${desc}${affordable}`);
      }
    } else {
      for (const item of shopActions) {
        const cost = item["cost"] ?? "?";
        const affordable = item["affordable"] ? "" : " ✗ Can't afford";
        const desc = (item["description"] as string)?.replace(/^Buy /, "") ?? `item (${cost}g)`;
        lines.push(`  [${item["index"]}] ${desc}${affordable}`);
      }
    }
  }

  const available: Action[] = state.available_actions ?? [];
  if (available.length > 0) {
    const cliCommands = [...new Set(available.map((a) => {
      const cli = actionToCli(a.action ?? "?");
      switch (a.action) {
        case "play": return "play";
        case "use_potion": return "use-potion";
        case "choose_reward": return "choose-reward <index>";
        case "choose_card": return "choose-card";
        case "choose_option": return "choose-event <index>";
        case "choose_node": return "choose-map";
        case "choose_rest_option": return "rest <heal|smith>";
        case "shop_buy": return "shop-buy";
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

function resolveCard(hand: Card[], name: string): [number, Card] | null {
  const idx = parseInt(name, 10);
  if (!isNaN(idx) && idx >= 0 && idx < hand.length) {
    debug("resolve", `card "${name}" → index [${idx}] ${hand[idx].name}`);
    return [idx, hand[idx]];
  }
  const lower = name.toLowerCase();
  for (let i = 0; i < hand.length; i++) {
    if (cardName(hand[i]).toLowerCase() === lower) {
      debug("resolve", `card "${name}" → exact [${i}] ${hand[i].name}`);
      return [i, hand[i]];
    }
  }
  for (let i = 0; i < hand.length; i++) {
    if (cardName(hand[i]).toLowerCase().includes(lower)) {
      debug("resolve", `card "${name}" → partial [${i}] ${hand[i].name}`);
      return [i, hand[i]];
    }
  }
  debug("resolve", `card "${name}" → NOT FOUND`);
  return null;
}

function resolveEnemy(enemies: Enemy[], target: string): number | null {
  const idx = parseInt(target, 10);
  if (!isNaN(idx) && idx >= 0 && idx < enemies.length) {
    debug("resolve", `enemy "${target}" → index [${idx}] ${enemies[idx].name}`);
    return idx;
  }
  const lower = target.toLowerCase();
  for (let i = 0; i < enemies.length; i++) {
    if ((enemies[i].name ?? "").toLowerCase() === lower) {
      debug("resolve", `enemy "${target}" → exact [${i}] ${enemies[i].name}`);
      return i;
    }
  }
  for (let i = 0; i < enemies.length; i++) {
    if ((enemies[i].name ?? "").toLowerCase().includes(lower)) {
      debug("resolve", `enemy "${target}" → partial [${i}] ${enemies[i].name}`);
      return i;
    }
  }
  debug("resolve", `enemy "${target}" → NOT FOUND (${enemies.length} enemies)`);
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

async function settledState(client: SpireBridgeClient, _prevScreen?: string): Promise<string> {
  debug("settle", `start prevScreen=${_prevScreen}`);
  await client.drainUpdates();
  let state = client.lastState;
  if (!state) return "";

  let screen = getScreen(state);
  debug("settle", `after drain: screen=${screen} actions=${(state.available_actions ?? []).map(a => a.action).join(",")}`);

  // If push state looks stale or transitional, do an active getState poll
  const isStale = (_prevScreen && screen === _prevScreen) || screen === "unknown";
  if (isStale) {
    debug("settle", `stale/transitional screen detected (screen=${screen} prev=${_prevScreen}), polling getState`);
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 500));
      state = await client.getState();
      screen = getScreen(state);
      debug("settle", `poll: screen=${screen}`);
      if (screen !== "unknown" && screen !== _prevScreen) break;
    }
  }

  // After combat ends, rewards overlay may open slightly after the map push.
  // Poll briefly to catch rewards screen that appears after combat_ended.
  if (screen === "map" && _prevScreen !== "map") {
    debug("settle", `map after non-map, checking for rewards transition`);
    const rewardDeadline = Date.now() + 2000;
    while (Date.now() < rewardDeadline) {
      await new Promise((r) => setTimeout(r, 300));
      state = await client.getState();
      screen = getScreen(state);
      debug("settle", `rewards check: screen=${screen}`);
      if (screen !== "map") break;
    }
  }

  // Light safety net: if state looks incomplete, poll briefly
  const looksIncomplete =
    (screen === "event" && findActions(state, "choose_option").length === 0) ||
    (screen === "combat" && getPlayer(state).energy === undefined);

  if (looksIncomplete) {
    debug("settle", `incomplete state, polling`);
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 500));
      state = await client.getState();
      screen = getScreen(state);
      if (screen === "event" && findActions(state, "choose_option").length > 0) break;
      if (screen === "combat" && getPlayer(state).energy !== undefined) break;
    }
  }

  // Combat: wait for player's play phase (enemy animations + card draw must complete)
  if (screen === "combat") {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 500));
      state = await client.getState();
      const hand = getHand(state);
      const energy = getPlayer(state).energy;
      const actions = (state.available_actions ?? []).filter(a => a.action !== "get_state" && a.action !== "discard_potion");
      const hasPlayActions = actions.some(a => a.action === "play" || a.action === "end_turn");
      debug("settle", `combat wait: hand=${hand.length} energy=${energy} hasPlay=${hasPlayActions}`);
      if (hasPlayActions && hand.length > 0) break;
    }
  }

  // Auto-proceed if only parameterless action available
  // Track screen to prevent infinite loops (don't re-execute on same screen)
  const PARAMETERLESS = new Set(["proceed", "end_turn"]);
  const actions = (state.available_actions ?? []).filter(a => a.action !== "get_state" && a.action !== "discard_potion");
  // Map: auto-proceed to close overview (proceed closes the overview, revealing interactive map)
  if (screen === "map" && actions.some(a => a.action === "proceed") && actions.some(a => a.action === "choose_node")) {
    debug("settle", `map overview detected, auto-proceeding to close`);
    const resp = await client.send("proceed");
    if (resp.status !== "error") {
      const next = await settledState(client, "map");
      return `\n\n(Auto: proceed)` + next;
    }
  }

  debug("settle", `auto-exec check: actions=[${actions.map(a=>a.action)}] screen=${screen} prevScreen=${_prevScreen}`);
  if (actions.length === 1 && PARAMETERLESS.has(actions[0].action ?? "") && screen !== _prevScreen) {
    const action = actions[0].action!;
    debug("settle", `auto-executing: ${action}`);
    const resp = await client.send(action);
    if (resp.status !== "error") {
      const cli = ACTION_TO_CLI[action] ?? action;
      const next = await settledState(client, screen);
      return `\n\n(Auto: ${cli})` + next;
    }
  }

  debug("settle", `done: screen=${screen}`);
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

  // Auto-execute if only one parameterless action available
  const actions = state.available_actions ?? [];
  const PARAMETERLESS = new Set(["proceed", "end_turn", "get_state"]);
  const nonState = actions.filter(a => a.action !== "get_state");
  if (nonState.length === 1 && PARAMETERLESS.has(nonState[0].action ?? "")) {
    const action = nonState[0].action!;
    const resp = await client.send(action);
    if (resp.status !== "error") {
      const cli = ACTION_TO_CLI[action] ?? action;
      return `(Auto-executed: ${cli})\n` + await settledState(client);
    }
  }

  return formatFullState(state);
}

export async function playCard(
  client: SpireBridgeClient,
  cardName: string,
  target?: string
): Promise<string> {
  debug("cmd", `playCard cardName="${cardName}" target="${target}"`);
  const state = await client.getState();
  const hand = getHand(state);
  debug("cmd", `hand: ${hand.map((c,i) => `[${i}]${c.name}`).join(", ")}`);

  const result = resolveCard(hand, cardName);
  if (!result) {
    const available = hand.map((c) => c.name ?? "?").join(", ");
    return `Card '${cardName}' not found. Available cards: ${available}`;
  }
  const [cardIdx, card] = result;
  debug("cmd", `resolved card: [${cardIdx}] ${card.name}`);

  const params: Record<string, unknown> = { card: cardIdx };

  if (target !== undefined) {
    const enemies = getHittableEnemies(state);
    debug("cmd", `enemies: ${enemies.map((e,i) => `[${i}]${e.name}`).join(", ")}`);
    const enemyIdx = resolveEnemy(enemies, target);
    if (enemyIdx === null) {
      const available = enemies.map((e) => e.name ?? "?").join(", ");
      return `Target '${target}' not found. Available enemies: ${available}`;
    }
    params["target"] = enemyIdx;
    debug("cmd", `resolved target: [${enemyIdx}] ${enemies[enemyIdx].name}`);
  }

  debug("cmd", `send play params=${JSON.stringify(params)}`);
  const resp = await client.send("play", params);
  if (resp.status === "error") {
    return `Error playing ${card.name}: ${resp.error ?? resp.message}`;
  }

  const targetStr = target ? ` on ${target}` : "";
  return `Played ${card.name}${targetStr}.` + await settledState(client);
}

export async function playCards(
  client: SpireBridgeClient,
  specs: string[]
): Promise<string> {
  debug("cmd", `playCards specs=${JSON.stringify(specs)}`);
  // Pre-resolve indices to names using current hand (before any cards are played)
  const preState = await client.getState();
  const preHand = getHand(preState);
  debug("cmd", `preHand: ${preHand.map((c,i) => `[${i}]${c.name}`).join(", ")}`);
  const preEnemies = getHittableEnemies(preState);
  debug("cmd", `preEnemies: ${preEnemies.map((e,i) => `[${i}]${e.name}`).join(", ")}`);
  const resolvedSpecs = specs.map(spec => {
    const parts = spec.trim().split(/\s+/);
    const cardRef = parts[0];
    const idx = parseInt(cardRef, 10);
    if (!isNaN(idx) && idx >= 0 && idx < preHand.length) {
      parts[0] = preHand[idx].name ?? cardRef;
    }
    if (parts.length > 1) {
      const targetIdx = parseInt(parts.slice(1).join(" "), 10);
      if (!isNaN(targetIdx)) {
        const enemies = getHittableEnemies(preState);
        if (targetIdx >= 0 && targetIdx < enemies.length) {
          parts[1] = enemies[targetIdx].name ?? parts[1];
          parts.length = 2;
        }
      }
    }
    return parts.join(" ");
  });
  debug("cmd", `resolvedSpecs=${JSON.stringify(resolvedSpecs)}`);

  const results: string[] = [];
  for (const spec of resolvedSpecs) {
    const state = await client.getState();
    const hand = getHand(state);
    debug("cmd", `multi-play "${spec}" hand: ${hand.map((c,i) => `[${i}]${c.name}`).join(", ")}`);
    
    const parts = spec.trim().split(/\s+/);
    let result: [number, Card] | null = null;
    let target: string | undefined;
    for (let i = parts.length; i >= 1; i--) {
      const tryName = parts.slice(0, i).join(" ");
      result = resolveCard(hand, tryName);
      if (result) {
        target = i < parts.length ? parts.slice(i).join(" ") : undefined;
        break;
      }
    }
    if (!result) {
      results.push(`Card '${spec.trim()}' not found — stopping.`);
      break;
    }
    const [cardIdx, card] = result;
    const params: Record<string, unknown> = { card: cardIdx };
    debug("cmd", `resolved: [${cardIdx}] ${card.name} target=${target}`);
    
    if (target !== undefined) {
      const enemies = getHittableEnemies(state);
      const enemyIdx = resolveEnemy(enemies, target);
      if (enemyIdx === null) {
        results.push(`Target '${target}' not found for ${card.name} — stopping.`);
        break;
      }
      params["target"] = enemyIdx;
      debug("cmd", `resolved target: [${enemyIdx}] ${enemies[enemyIdx].name}`);
    }
    
    debug("cmd", `send play params=${JSON.stringify(params)}`);
    const resp = await client.send("play", params);
    if (resp.status === "error") {
      results.push(`Error playing ${card.name}: ${resp.error ?? resp.message} — stopping.`);
      break;
    }
    await client.drainUpdates(500);
    const targetStr = target ? ` on ${target}` : "";
    results.push(`Played ${card.name}${targetStr}.`);
  }
  
  return results.join("\n") + await settledState(client);
}

export async function endTurn(client: SpireBridgeClient): Promise<string> {
  const resp = await client.send("end_turn");
  if (resp.status === "error") {
    return `Error ending turn: ${resp.error ?? resp.message}`;
  }

  return `Turn ended.` + await settledState(client);
}

export async function usePotion(
  client: SpireBridgeClient,
  potionName: string,
  target?: string
): Promise<string> {
  debug("cmd", `usePotion potion="${potionName}" target="${target}"`);
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

  return `Used ${potion.name}.` + await settledState(client);
}

export async function chooseMapNode(client: SpireBridgeClient, nodeType: string): Promise<string> {
  debug("cmd", `chooseMapNode nodeType="${nodeType}"`);
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
    return `Navigated to ${node["type"]}.` + await settledState(client, "map");
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

  return `Navigated to ${node["type"]}.` + await settledState(client, "map");
}

export async function chooseReward(client: SpireBridgeClient, index: number): Promise<string> {
  const resp = await client.send("choose_reward", { index });
  if (resp.status === "error") {
    return `Error choosing reward ${index}: ${resp.error ?? resp.message}`;
  }

  return `Chose reward [${index}].` + await settledState(client);
}

export async function chooseCardReward(client: SpireBridgeClient, cardName: string): Promise<string> {
  debug("cmd", `chooseCardReward cardName="${cardName}"`);
  const state = await client.getState();
  const screen = getScreen(state);

  if (cardName.toLowerCase() === "skip") {
    const resp = await client.send("skip");
    if (resp.status === "error") {
      return `Error skipping: ${resp.error ?? resp.message}`;
    }
    return "Skipped card reward." + await settledState(client);
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
  return `${action} ${chosen}.` + await settledState(client, screen);
}

export async function restSiteAction(
  client: SpireBridgeClient,
  action: string,
  cardName?: string
): Promise<string> {
  debug("cmd", `restSiteAction action="${action}" cardName="${cardName}"`);
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
      return `Upgraded ${cardName} at rest site.` + await settledState(client);
    } else if (matchIdx === null) {
      return `Rested (smith selected) but card '${cardName}' not found in deck for upgrade.` + await settledState(client);
    }
  }

  return `Performed '${action}' at rest site.` + await settledState(client, "rest_site");
}

export async function chooseEventOption(client: SpireBridgeClient, index: number): Promise<string> {
  debug("cmd", `chooseEventOption index=${index}`);
  const resp = await client.send("choose_option", { index });
  if (resp.status === "error") {
    return `Error choosing event option ${index}: ${resp.error ?? resp.message}`;
  }

  return `Chose event option [${index}].` + await settledState(client);
}

export async function shopBuy(client: SpireBridgeClient, index: number): Promise<string> {
  const resp = await client.send("shop_buy", { index });
  if (resp.status === "error") {
    return `Error buying item ${index}: ${resp.error ?? resp.message}`;
  }
  return `Bought item [${index}].` + await settledState(client);
}

export async function openChest(client: SpireBridgeClient): Promise<string> {
  debug("cmd", `openChest`);
  const state = await client.getState();
  const preScreen = getScreen(state);
  const resp = await client.send("open_chest");
  if (resp.status === "error") {
    return `Error opening chest: ${resp.error ?? resp.message}`;
  }

  return `Opened chest.` + await settledState(client, preScreen);
}

export async function proceed(client: SpireBridgeClient): Promise<string> {
  debug("cmd", `proceed`);
  const state = await client.getState();
  const preScreen = getScreen(state);
  const resp = await client.send("proceed");
  if (resp.status === "error") {
    return `Error proceeding: ${resp.error ?? resp.message}`;
  }

  return `Proceeded.` + await settledState(client, preScreen);
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
  return `Started run as ${character}.` + await settledState(client);
}

export async function abandonRun(client: SpireBridgeClient): Promise<string> {
  const resp = await client.send("abandon_run");
  if (resp.status === "error") {
    return `Error abandoning run: ${resp.error ?? resp.message}`;
  }
  return `Run abandoned.` + await settledState(client);
}

export async function continueRun(client: SpireBridgeClient): Promise<string> {
  debug("cmd", `continueRun`);
  const resp = await client.send("continue_run");
  if (resp.status === "error") {
    return `Error continuing run: ${resp.error ?? resp.message}`;
  }
  return `Run continued.` + await settledState(client, "main_menu");
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
  const up = (card as unknown as Record<string, unknown>).upgrade_preview as Record<string, unknown> | undefined;
  if (up?.description) lines.push(`  Upgrade: ${up.description}`);
  return lines.join("\n");
}

export async function cardInfo(client: SpireBridgeClient, cardName: string): Promise<string> {
  const state = await client.getState();
  const player = getPlayer(state);

  // Support index-based lookup (hand cards)
  const asNum = parseInt(cardName, 10);
  if (!isNaN(asNum)) {
    const hand = getHand(state);
    if (asNum >= 0 && asNum < hand.length) {
      const card = hand[asNum];
      return fmtCardDetailed(card);
    }
    return `Index ${asNum} out of range (hand has ${getHand(state).length} cards).`;
  }

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

  // Also search shop items as cards
  const shopState = (state as unknown as Record<string, unknown>).shop as Record<string, unknown> | undefined;
  const shopCards = ((shopState?.items as Array<Record<string, unknown>>) ?? [])
    .filter((i) => i.type === "card")
    .map((i) => i as unknown as Card);
  if (shopCards.length > 0) pools.push({ label: "Shop", cards: shopCards });

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
// Relic & Potion info
// ---------------------------------------------------------------------------

export async function relicInfo(client: SpireBridgeClient, name: string): Promise<string> {
  const state = await client.getState();
  const relics = getPlayer(state).relics ?? [];
  const lower = name.toLowerCase();
  const matches = relics.filter(r => (r.name ?? "").toLowerCase().includes(lower));
  if (matches.length === 0) return `Relic '${name}' not found. Relics: ${relics.map(r => r.name ?? "?").join(", ")}`;
  return matches.map(r => `**${r.name}**\n  ${r.description ?? "No description"}`).join("\n\n");
}

export async function potionInfo(client: SpireBridgeClient, name: string): Promise<string> {
  const state = await client.getState();
  const potions = (getPlayer(state).potions ?? []).filter((p): p is Potion => !!p && !!p.name && p.name !== "Potion Slot");
  const lower = name.toLowerCase();
  const matches = potions.filter(p => (p.name ?? "").toLowerCase().includes(lower));
  if (matches.length === 0) return `Potion '${name}' not found. Potions: ${potions.map(p => p.name ?? "?").join(", ")}`;
  return matches.map(p => `**${p.name}**\n  ${p.description ?? "No description"}`).join("\n\n");
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
