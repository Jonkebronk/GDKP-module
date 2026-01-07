// TBC Item Quality Enum
export type ItemQuality = 0 | 1 | 2 | 3 | 4 | 5;

export const ITEM_QUALITY_NAMES: Record<ItemQuality, string> = {
  0: 'Poor',
  1: 'Common',
  2: 'Uncommon',
  3: 'Rare',
  4: 'Epic',
  5: 'Legendary',
};

export const ITEM_QUALITY_COLORS: Record<ItemQuality, string> = {
  0: '#9d9d9d', // Poor (gray)
  1: '#ffffff', // Common (white)
  2: '#1eff00', // Uncommon (green)
  3: '#0070dd', // Rare (blue)
  4: '#a335ee', // Epic (purple)
  5: '#ff8000', // Legendary (orange)
};

// TBC Raid Instance metadata
export interface TbcRaidInstance {
  id: string;
  name: string;
  phase: number;
  size: '10-man' | '25-man' | '40-man';
}

export const TBC_RAID_INSTANCES: TbcRaidInstance[] = [
  { id: 'karazhan', name: 'Karazhan', phase: 1, size: '10-man' },
  { id: 'gruuls-lair', name: "Gruul's Lair", phase: 1, size: '25-man' },
  { id: 'magtheridons-lair', name: "Magtheridon's Lair", phase: 1, size: '25-man' },
  { id: 'ssc', name: 'Serpentshrine Cavern', phase: 2, size: '25-man' },
  { id: 'tk', name: 'Tempest Keep', phase: 2, size: '25-man' },
  { id: 'hyjal', name: 'Mount Hyjal', phase: 3, size: '25-man' },
  { id: 'bt', name: 'Black Temple', phase: 3, size: '25-man' },
  { id: 'za', name: "Zul'Aman", phase: 4, size: '10-man' },
  { id: 'swp', name: 'Sunwell Plateau', phase: 5, size: '25-man' },
];

// Item slot types
export const ITEM_SLOTS = [
  'Head',
  'Neck',
  'Shoulder',
  'Back',
  'Chest',
  'Wrist',
  'Hands',
  'Waist',
  'Legs',
  'Feet',
  'Finger',
  'Trinket',
  'Main Hand',
  'Off Hand',
  'Two-Hand',
  'Ranged',
  'Relic',
  // Recipes & Patterns
  'Pattern',
  'Formula',
  'Schematic',
  'Recipe',
  'Plans',
  'Design',
] as const;

export type ItemSlot = (typeof ITEM_SLOTS)[number];

// TBC Raid Item from database
export interface TbcRaidItem {
  id: string;
  wowhead_id: number;
  name: string;
  icon: string;
  quality: ItemQuality;
  slot: ItemSlot | null;
  item_level: number | null;
  raid_instance: string;
  boss_name: string | null;
  phase: number;
  drop_count?: number; // Computed from loot history
}

// Loot History entry
export interface LootHistoryEntry {
  id: string;
  tbc_item_id: string;
  raid_id: string | null;
  winner_name: string | null;
  gold_amount: number | null;
  import_source: 'gargul' | 'rclootcouncil';
  dropped_at: Date;
  imported_at: Date;
  tbc_item?: TbcRaidItem;
}

// Import result
export interface LootImportResult {
  success: boolean;
  imported_count: number;
  matched_count: number;
  unmatched_items: string[];
  errors: string[];
}

// API Query filters for items
export interface TbcItemFilters {
  raid_instance?: string;
  slot?: ItemSlot;
  quality?: ItemQuality;
  phase?: number;
  search?: string;
  has_dropped?: boolean;
  page?: number;
  limit?: number;
}

// Paginated response
export interface PaginatedTbcItems {
  items: TbcRaidItem[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

// Gargul export item structure (after decoding)
export interface GargulLootEntry {
  itemId: number;
  itemLink: string;
  player: string;
  gold: number;
  timestamp: number;
}

// RCLootCouncil CSV row structure
export interface RCLootCouncilEntry {
  player: string;
  date: string;
  time: string;
  itemID: number;
  item: string;
  response: string;
  instance: string;
  boss: string;
}

// WoWhead helper functions
export function getWowheadItemUrl(wowheadId: number): string {
  return `https://www.wowhead.com/tbc/item=${wowheadId}`;
}

export function getWowheadIconUrl(iconName: string): string {
  return `https://wow.zamimg.com/images/wow/icons/large/${iconName}.jpg`;
}

export function getItemQualityClass(quality: ItemQuality): string {
  const classes: Record<ItemQuality, string> = {
    0: 'text-gray-500',
    1: 'text-white',
    2: 'text-green-400',
    3: 'text-blue-400',
    4: 'text-purple-400',
    5: 'text-orange-400',
  };
  return classes[quality];
}
