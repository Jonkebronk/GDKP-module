export type ItemStatus = 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export interface Item {
  id: string;
  raid_id: string;
  name: string;
  wowhead_id: number | null;
  icon_url: string | null;
  status: ItemStatus;
  starting_bid: number;
  current_bid: number;
  min_increment: number;
  winner_id: string | null;
  auction_duration: number; // seconds
  started_at: Date | null;
  ends_at: Date | null;
  completed_at: Date | null;
}

export interface ItemWithWinner extends Item {
  winner: {
    id: string;
    discord_username: string;
    discord_avatar: string | null;
  } | null;
}

export interface Bid {
  id: string;
  item_id: string;
  user_id: string;
  amount: number;
  is_winning: boolean;
  created_at: Date;
  user: {
    id: string;
    discord_username: string;
    discord_avatar: string | null;
  };
}

export interface CreateItemInput {
  name: string;
  wowhead_id?: number;
  icon_url?: string;
  starting_bid?: number;
  min_increment?: number;
  auction_duration?: number;
}

export interface PlaceBidInput {
  item_id: string;
  amount: number;
}

export interface PlaceBidResult {
  success: boolean;
  bid?: Bid;
  error?: string;
  min_required?: number;
  new_end_time?: Date;
}

export interface AuctionStartedPayload {
  item: Item;
  ends_at: string;
  min_increment: number;
}

export interface AuctionEndedPayload {
  item_id: string;
  item_name?: string;
  winner_id: string | null;
  winner_name: string | null;
  final_amount: number;
  pot_total: number;
  is_manual_award?: boolean;
}

export interface BidAcceptedPayload {
  bid_id: string;
  amount: number;
  timestamp: string;
}

export interface BidRejectedPayload {
  error: string;
  min_required?: number;
}

export interface NewBidPayload {
  bid_id: string;
  item_id: string;
  user_id: string;
  username: string;
  amount: number;
  timestamp: string;
  new_end_time?: string;
}
