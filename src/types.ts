export interface GameState {
  screen: string;
  floor?: number;
  act?: number;
  player?: Player;
  enemies?: Enemy[];
  available_actions?: Action[];
  card_choices?: Card[];
  rewards?: Reward[];
  event_text?: string;
  event?: { body?: string };
}

export interface Player {
  hp: number;
  max_hp: number;
  energy: number;
  block?: number;
  hand?: Card[];
  deck?: Card[];
  draw_pile?: Card[];
  draw_pile_count?: number;
  discard_pile?: Card[];
  discard_pile_count?: number;
  exhaust_pile?: Card[];
  exhaust_pile_count?: number;
  relics?: Relic[];
  potions?: Potion[];
}

export interface Card {
  name: string;
  cost?: number;
  type?: string;
  damage?: number;
  block?: number;
  description?: string;
  rarity?: string;
  playable?: boolean;
  exhausts?: boolean;
  upgraded?: boolean;
}

export interface Enemy {
  name: string;
  hp: number;
  max_hp: number;
  block?: number;
  is_hittable?: boolean;
  intent?: Intent;
}

export interface Intent {
  type?: string;
  damage?: number;
  hits?: number;
}

export interface Relic {
  name: string;
}

export interface Potion {
  name: string;
}

export interface Reward {
  type: string;
  name?: string;
  gold?: number;
}

export interface Action {
  action: string;
  [key: string]: unknown;
}

export interface ActionResponse {
  id: string;
  status: string;
  data?: GameState | null;
  error?: string;
  message?: string;
}

export interface StateUpdate {
  event: string;
  seq: number;
  state: GameState;
}
