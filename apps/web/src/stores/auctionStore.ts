import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Item, Bid } from '@gdkp/shared';

interface AuctionState {
  // Current auction state
  activeItem: Item | null;
  bids: Bid[];
  remainingMs: number;
  isEnding: boolean;

  // User's bid state
  myCurrentBid: number | null;
  isLeadingBidder: boolean;

  // Connection state
  isConnected: boolean;

  // Actions
  setActiveItem: (item: Item | null) => void;
  addBid: (bid: Bid, currentUserId: string) => void;
  updateRemainingTime: (ms: number) => void;
  extendAuction: (newEndsAt: string) => void;
  endAuction: () => void;
  setConnection: (connected: boolean) => void;
  reset: () => void;
}

export const useAuctionStore = create<AuctionState>()(
  subscribeWithSelector((set, get) => ({
    activeItem: null,
    bids: [],
    remainingMs: 0,
    isEnding: false,
    myCurrentBid: null,
    isLeadingBidder: false,
    isConnected: false,

    setActiveItem: (item) =>
      set({
        activeItem: item,
        bids: [],
        remainingMs: item ? new Date(item.ends_at!).getTime() - Date.now() : 0,
        isEnding: false,
        myCurrentBid: null,
        isLeadingBidder: false,
      }),

    addBid: (bid, currentUserId) =>
      set((state) => ({
        bids: [...state.bids, bid],
        activeItem: state.activeItem
          ? { ...state.activeItem, current_bid: bid.amount, winner_id: bid.user_id }
          : null,
        myCurrentBid: bid.user_id === currentUserId ? bid.amount : state.myCurrentBid,
        isLeadingBidder: bid.user_id === currentUserId,
      })),

    updateRemainingTime: (ms) =>
      set({
        remainingMs: ms,
        isEnding: ms <= 10000 && ms > 0,
      }),

    extendAuction: (newEndsAt) =>
      set((state) => ({
        activeItem: state.activeItem
          ? { ...state.activeItem, ends_at: new Date(newEndsAt) }
          : null,
        remainingMs: new Date(newEndsAt).getTime() - Date.now(),
        isEnding: false,
      })),

    endAuction: () =>
      set({
        activeItem: null,
        bids: [],
        remainingMs: 0,
        isEnding: false,
        myCurrentBid: null,
        isLeadingBidder: false,
      }),

    setConnection: (connected) => set({ isConnected: connected }),

    reset: () =>
      set({
        activeItem: null,
        bids: [],
        remainingMs: 0,
        isEnding: false,
        myCurrentBid: null,
        isLeadingBidder: false,
      }),
  }))
);
