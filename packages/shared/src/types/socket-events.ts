import type {
  AuctionStartedPayload,
  AuctionEndedPayload,
  BidAcceptedPayload,
  BidRejectedPayload,
  NewBidPayload,
} from './auction';
import type { RaidParticipant, Raid } from './raid';
import type { Item, Bid } from './auction';

// Client -> Server Events
export interface ClientToServerEvents {
  'join:raid': (data: { raid_id: string }) => void;
  'leave:raid': (data: { raid_id: string }) => void;

  'auction:start': (data: {
    item_id: string;
    duration?: number;
    min_bid?: number;
    increment?: number;
  }) => void;

  'bid:place': (data: { item_id: string; amount: number }) => void;

  'chat:send': (data: { raid_id: string; message: string }) => void;
}

// Server -> Client Events
export interface ServerToClientEvents {
  // Connection
  connected: (data: { user_id: string; socket_id: string }) => void;
  error: (data: { code: string; message: string; details?: unknown }) => void;

  // Raid
  'raid:state': (data: RaidState) => void;
  'raid:updated': (data: Partial<Raid> & { items_changed?: boolean; raid_id?: string }) => void;
  'user:joined': (data: { user_id: string; username: string; avatar: string | null; alias?: string | null }) => void;
  'user:left': (data: { user_id: string; username: string }) => void;

  // Auction
  'auction:started': (data: AuctionStartedPayload) => void;
  'auction:tick': (data: { item_id: string; remaining_ms: number }) => void;
  'auction:extended': (data: { item_id: string; new_ends_at: string }) => void;
  'auction:ending': (data: { item_id: string; remaining_ms: number }) => void;
  'auction:ended': (data: AuctionEndedPayload) => void;
  'auction:restarted': (data: {
    item_id: string;
    item_name: string;
    previous_winner: string;
    previous_amount: number;
    new_pot_total: number;
  }) => void;

  // Bidding
  'bid:accepted': (data: BidAcceptedPayload) => void;
  'bid:rejected': (data: BidRejectedPayload) => void;
  'bid:new': (data: NewBidPayload) => void;

  // Chat
  'chat:message': (data: ChatMessage) => void;
  'chat:sent': (data: { message_id: string; timestamp: string }) => void;

  // Wallet (private channel)
  'wallet:updated': (data: { balance: number; locked_amount: number }) => void;

  // Pot distribution
  'raid:payout': (data: PayoutResult) => void;
  'pot:payout': (data: {
    raid_id: string;
    raid_name: string;
    amount: number;
    pot_total: number;
  }) => void;
  'raid:completed': (data: {
    raid_id: string;
    pot_total: number;
    distributed_amount: number;
    participant_count: number;
  }) => void;
  'raid:cancelled': (data: {
    raid_id: string;
    reason: string;
    refunded_amount: number;
  }) => void;

  // Session / Waiting room
  'session:approved': (data: { message: string }) => void;
  'session:kicked': (data: { message: string }) => void;
  'waiting-room:updated': (data: Record<string, never>) => void;
  'gold-report:updated': () => void;

  // Dashboard updates
  'raids:updated': () => void;

  // Participant events
  'participant:left': (data: { user_id: string; username: string }) => void;
}

// Inter-Server Events (for Redis adapter scaling)
export interface InterServerEvents {
  ping: () => void;
}

// Socket data attached to each connection
export interface SocketData {
  user_id: string;
  username: string; // Display name (alias or discord_username)
  discord_username: string; // Real Discord username (for admin)
  alias: string | null;
  avatar: string | null;
  role: 'USER' | 'ADMIN';
  current_raid_id?: string;
}

// Additional types for socket payloads
export interface RaidState {
  raid: Raid;
  participants: RaidParticipant[];
  items: Item[];
  active_auction: Item | null;
  recent_bids: Bid[];
  chat_history: ChatMessage[];
}

export interface ChatMessage {
  id: string;
  raid_id: string;
  user_id: string;
  username: string;
  avatar: string | null;
  message: string;
  timestamp: string;
  is_system: boolean;
}

export interface PayoutResult {
  raid_id: string;
  pot_total: number;
  shares: Array<{
    user_id: string;
    username: string;
    amount: number;
  }>;
}
