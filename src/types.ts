export interface GameState {
  screen: string;
  floor?: number;
  act?: number;
  player?: Player;
  enemies?: Enemy[];
  combat?: {
    is_player_turn?: boolean;
    enemies?: Enemy[];
  };
  available_actions?: Action[];
  card_choices?: Card[];
  rewards?: Reward[];
  event_text?: string;
  event?: { body?: string };
  shop?: Shop;
}

export interface Power {
  id?: string;
  name?: string;
  amount?: number;
  type?: string;
}

export interface Player {
  hp: number;
  max_hp: number;
  energy: number;
  max_energy?: number;
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
  powers?: Power[];
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
  vars?: Record<string, number>;
  upgrade_preview?: {
    description?: string;
    vars?: Record<string, number>;
  };
}

export interface Enemy {
  name: string;
  hp: number;
  max_hp: number;
  block?: number;
  is_hittable?: boolean;
  intent?: Intent;
  intents?: Intent[];
  powers?: Power[];
}

export interface Intent {
  type?: string;
  damage?: number;
  hits?: number;
}

export interface Relic {
  name: string;
  description?: string;
}

export interface Potion {
  name: string;
  description?: string;
}

export interface Reward {
  type: string;
  name?: string;
  gold?: number;
}

export interface ShopItem {
  index?: number;
  name?: string;
  description?: string;
  cost?: number;
  affordable?: boolean;
  type?: string;
  card_type?: string;
}

export interface Shop {
  gold?: number;
  items?: ShopItem[];
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
