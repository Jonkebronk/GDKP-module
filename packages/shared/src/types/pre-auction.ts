// Pre-auction types

export type PreAuctionStatus = 'ACTIVE' | 'ENDED' | 'CLAIMED' | 'UNCLAIMED';

export interface PreAuctionItem {
  id: string;
  raid_id: string;
  tbc_item_id: string;
  status: PreAuctionStatus;
  current_bid: number;
  min_increment: number;
  winner_id: string | null;
  ends_at: Date | string;
  created_at: Date | string;

  // Joined fields
  tbc_item?: {
    id: string;
    wowhead_id: number;
    name: string;
    icon: string;
    quality: number;
    slot: string | null;
    item_level: number | null;
    raid_instance: string;
    boss_name: string | null;
  };
  winner?: {
    id: string;
    discord_username: string;
    alias: string | null;
    discord_avatar: string | null;
  };
}

export interface PreAuctionBid {
  id: string;
  pre_auction_item_id: string;
  user_id: string;
  amount: number;
  is_winning: boolean;
  created_at: Date | string;

  // Joined fields
  user?: {
    id: string;
    discord_username: string;
    alias: string | null;
    discord_avatar: string | null;
  };
}

export interface PreAuctionItemWithBids extends PreAuctionItem {
  bids: PreAuctionBid[];
  bid_count: number;
}

// API payloads
export interface LockRosterPayload {
  duration_hours: number; // 1-72 hours
}

export interface PlacePreAuctionBidPayload {
  amount: number;
}

export interface PreAuctionFilters {
  slot?: string;
  quality?: number;
  boss?: string;
  search?: string;
  status?: PreAuctionStatus;
}

// Socket event payloads
export interface PreAuctionBidNewPayload {
  pre_auction_item_id: string;
  bid_id: string;
  user_id: string;
  username: string;
  amount: number;
  timestamp: string;
  previous_winner_id: string | null;
}

export interface PreAuctionEndedPayload {
  raid_id: string;
  ended_at: string;
  items_with_winners: number;
  items_without_winners: number;
}

export interface PreAuctionItemClaimedPayload {
  pre_auction_item_id: string;
  item_name: string;
  winner_id: string;
  winner_name: string;
  amount: number;
}
