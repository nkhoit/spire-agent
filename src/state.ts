import { Action, GameState, Player, Card, Enemy } from "./types.js";

export function getActions(state: GameState): Action[] {
  return state.available_actions ?? [];
}

export function findActions(state: GameState, actionType: string): Action[] {
  return getActions(state).filter((a) => a.action === actionType);
}

export function getScreen(state: GameState): string {
  return state.screen ?? "unknown";
}

export function getPlayer(state: GameState): Player {
  return state.player ?? { hp: 0, max_hp: 0, energy: 0 };
}

export function getHand(state: GameState): Card[] {
  return getPlayer(state).hand ?? [];
}

export function getEnemies(state: GameState): Enemy[] {
  return state.enemies ?? [];
}

export function getHittableEnemies(state: GameState): Enemy[] {
  return getEnemies(state).filter((e) => e.is_hittable);
}

export function playerHp(state: GameState): [number, number] {
  const p = getPlayer(state);
  return [p.hp, p.max_hp];
}

export function playerEnergy(state: GameState): number {
  return getPlayer(state).energy;
}

export function incomingDamage(state: GameState): number {
  let total = 0;
  for (const e of getEnemies(state)) {
    const intent = e.intent ?? {};
    total += (intent.damage ?? 0) * (intent.hits ?? 1);
  }
  return total;
}
