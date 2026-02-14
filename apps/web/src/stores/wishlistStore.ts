import { create } from 'zustand';
import { persist, subscribeWithSelector } from 'zustand/middleware';
import type { TbcRaidItem } from '@gdkp/shared';

interface WishlistFilters {
  slot?: string;
  quality?: number;
  boss?: string;
  search?: string;
}

interface WishlistState {
  // Selected items (wowhead_ids)
  selectedIds: Set<number>;

  // Current raid filter
  selectedRaid: string | null;

  // Filters
  filters: WishlistFilters;

  // View mode: 'browse' shows all items, 'cart' shows only selected
  viewMode: 'browse' | 'cart';

  // Loaded items cache (from API)
  itemsCache: Map<number, TbcRaidItem>;

  // Actions
  addItem: (wowheadId: number) => void;
  removeItem: (wowheadId: number) => void;
  toggleItem: (wowheadId: number) => void;
  clearCart: () => void;
  setSelectedIds: (ids: number[]) => void;
  setSelectedRaid: (raid: string | null) => void;
  setFilters: (filters: Partial<WishlistFilters>) => void;
  setViewMode: (mode: 'browse' | 'cart') => void;
  cacheItems: (items: TbcRaidItem[]) => void;
  getSelectedItems: () => TbcRaidItem[];
  isSelected: (wowheadId: number) => boolean;
}

// Custom storage to handle Set serialization
const wishlistStorage = {
  getItem: (name: string) => {
    const str = localStorage.getItem(name);
    if (!str) return null;

    try {
      const data = JSON.parse(str);
      // Convert array back to Set
      if (data.state?.selectedIds) {
        data.state.selectedIds = new Set(data.state.selectedIds);
      }
      // Convert array back to Map
      if (data.state?.itemsCache) {
        data.state.itemsCache = new Map(data.state.itemsCache);
      }
      return data;
    } catch {
      return null;
    }
  },
  setItem: (name: string, value: { state: WishlistState }) => {
    const data = {
      ...value,
      state: {
        ...value.state,
        // Convert Set to array for storage
        selectedIds: Array.from(value.state.selectedIds),
        // Convert Map to array for storage
        itemsCache: Array.from(value.state.itemsCache.entries()),
      },
    };
    localStorage.setItem(name, JSON.stringify(data));
  },
  removeItem: (name: string) => {
    localStorage.removeItem(name);
  },
};

export const useWishlistStore = create<WishlistState>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        selectedIds: new Set<number>(),
        selectedRaid: null,
        filters: {},
        viewMode: 'browse',
        itemsCache: new Map<number, TbcRaidItem>(),

        addItem: (wowheadId) =>
          set((state) => ({
            selectedIds: new Set([...state.selectedIds, wowheadId]),
          })),

        removeItem: (wowheadId) =>
          set((state) => {
            const newSet = new Set(state.selectedIds);
            newSet.delete(wowheadId);
            return { selectedIds: newSet };
          }),

        toggleItem: (wowheadId) => {
          const { selectedIds } = get();
          if (selectedIds.has(wowheadId)) {
            get().removeItem(wowheadId);
          } else {
            get().addItem(wowheadId);
          }
        },

        clearCart: () =>
          set({
            selectedIds: new Set<number>(),
            viewMode: 'browse',
          }),

        setSelectedIds: (ids) =>
          set({
            selectedIds: new Set(ids),
          }),

        setSelectedRaid: (raid) =>
          set({
            selectedRaid: raid,
            // Reset boss filter when changing raids
            filters: { ...get().filters, boss: undefined },
          }),

        setFilters: (newFilters) =>
          set((state) => ({
            filters: { ...state.filters, ...newFilters },
          })),

        setViewMode: (mode) => set({ viewMode: mode }),

        cacheItems: (items) =>
          set((state) => {
            const newCache = new Map(state.itemsCache);
            for (const item of items) {
              newCache.set(item.wowhead_id, item);
            }
            return { itemsCache: newCache };
          }),

        getSelectedItems: () => {
          const { selectedIds, itemsCache } = get();
          const items: TbcRaidItem[] = [];
          for (const id of selectedIds) {
            const item = itemsCache.get(id);
            if (item) {
              items.push(item);
            }
          }
          return items.sort((a, b) => a.name.localeCompare(b.name));
        },

        isSelected: (wowheadId) => {
          return get().selectedIds.has(wowheadId);
        },
      }),
      {
        name: 'gdkp-wishlist',
        storage: wishlistStorage,
        partialize: (state) =>
          ({
            selectedIds: state.selectedIds,
            itemsCache: state.itemsCache,
            selectedRaid: state.selectedRaid,
          }) as WishlistState,
      }
    )
  )
);
