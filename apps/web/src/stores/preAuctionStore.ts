import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { PreAuctionItem, PreAuctionStatus, PreAuctionFilters } from '@gdkp/shared';

interface PreAuctionState {
  // Pre-auction data
  items: PreAuctionItem[];
  raidId: string | null;
  endsAt: Date | null;
  totalCount: number;

  // Filters
  filters: PreAuctionFilters;
  availableFilters: {
    slots: string[];
    bosses: string[];
    qualities: number[];
  };

  // Selected item for modal
  selectedItem: PreAuctionItem | null;

  // Connection state
  isConnected: boolean;

  // Actions
  setItems: (items: PreAuctionItem[]) => void;
  setRaidId: (id: string | null) => void;
  setEndsAt: (date: Date | null) => void;
  setTotalCount: (count: number) => void;
  setFilters: (filters: Partial<PreAuctionFilters>) => void;
  setAvailableFilters: (filters: { slots: string[]; bosses: string[]; qualities: number[] }) => void;
  setSelectedItem: (item: PreAuctionItem | null) => void;
  setConnection: (connected: boolean) => void;
  updateItemBid: (itemId: string, currentBid: number, winnerId: string | null, winnerName?: string) => void;
  updateItemStatus: (itemId: string, status: PreAuctionStatus) => void;
  reset: () => void;
}

export const usePreAuctionStore = create<PreAuctionState>()(
  subscribeWithSelector((set) => ({
    items: [],
    raidId: null,
    endsAt: null,
    totalCount: 0,
    filters: {},
    availableFilters: {
      slots: [],
      bosses: [],
      qualities: [],
    },
    selectedItem: null,
    isConnected: false,

    setItems: (items) => set({ items }),

    setRaidId: (id) => set({ raidId: id }),

    setEndsAt: (date) => set({ endsAt: date }),

    setTotalCount: (count) => set({ totalCount: count }),

    setFilters: (newFilters) =>
      set((state) => ({
        filters: { ...state.filters, ...newFilters },
      })),

    setAvailableFilters: (filters) => set({ availableFilters: filters }),

    setSelectedItem: (item) => set({ selectedItem: item }),

    setConnection: (connected) => set({ isConnected: connected }),

    updateItemBid: (itemId, currentBid, winnerId, winnerName) =>
      set((state) => ({
        items: state.items.map((item) =>
          item.id === itemId
            ? {
                ...item,
                current_bid: currentBid,
                winner_id: winnerId,
                winner: winnerId && winnerName
                  ? {
                      id: winnerId,
                      discord_username: winnerName,
                      alias: null,
                      discord_avatar: null,
                    }
                  : item.winner,
              }
            : item
        ),
        // Also update selected item if it's the one that changed
        selectedItem:
          state.selectedItem?.id === itemId
            ? {
                ...state.selectedItem,
                current_bid: currentBid,
                winner_id: winnerId,
                winner: winnerId && winnerName
                  ? {
                      id: winnerId,
                      discord_username: winnerName,
                      alias: null,
                      discord_avatar: null,
                    }
                  : state.selectedItem.winner,
              }
            : state.selectedItem,
      })),

    updateItemStatus: (itemId, status) =>
      set((state) => ({
        items: state.items.map((item) =>
          item.id === itemId ? { ...item, status } : item
        ),
        selectedItem:
          state.selectedItem?.id === itemId
            ? { ...state.selectedItem, status }
            : state.selectedItem,
      })),

    reset: () =>
      set({
        items: [],
        raidId: null,
        endsAt: null,
        totalCount: 0,
        filters: {},
        selectedItem: null,
      }),
  }))
);
