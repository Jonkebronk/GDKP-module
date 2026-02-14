import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, Filter, X, ShoppingCart } from 'lucide-react';
import type { TbcRaidItem } from '@gdkp/shared';
import { ITEM_QUALITY_NAMES } from '@gdkp/shared';

import { useWishlistStore } from '../stores/wishlistStore';
import { parseWishlistFromUrl, generateWishlistUrl } from '../utils/wishlistUrl';

import { RaidTabs } from '../components/wishlist/RaidTabs';
import { WishlistItemCard } from '../components/wishlist/WishlistItemCard';
import { CartDrawer } from '../components/wishlist/CartDrawer';
import { ShareModal } from '../components/wishlist/ShareModal';

// API base URL
const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

interface InstanceData {
  id: string;
  name: string;
  phase: number;
  size: string;
  item_count: number;
}

export function WishlistPage() {
  const [searchParams] = useSearchParams();
  const [showShareModal, setShowShareModal] = useState(false);
  const [showCartDrawer, setShowCartDrawer] = useState(false);
  const [searchInput, setSearchInput] = useState('');

  // Store
  const {
    selectedIds,
    selectedRaid,
    filters,
    setSelectedIds,
    setSelectedRaid,
    setFilters,
    toggleItem,
    removeItem,
    clearCart,
    cacheItems,
    isSelected,
  } = useWishlistStore();

  // Load items from URL on mount
  useEffect(() => {
    const urlIds = parseWishlistFromUrl(searchParams);
    if (urlIds.length > 0) {
      setSelectedIds(urlIds);
      // Open cart drawer when loading from URL
      setShowCartDrawer(true);
    }
  }, []);

  // Fetch instances with counts
  const { data: instancesData } = useQuery({
    queryKey: ['public-instances'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/public/items/instances`);
      if (!res.ok) throw new Error('Failed to fetch instances');
      return res.json() as Promise<{ instances: InstanceData[] }>;
    },
  });

  // Fetch bosses for selected raid
  const { data: bossesData } = useQuery({
    queryKey: ['public-bosses', selectedRaid],
    queryFn: async () => {
      const params = selectedRaid ? `?raid_instance=${encodeURIComponent(selectedRaid)}` : '';
      const res = await fetch(`${API_BASE}/public/items/bosses${params}`);
      if (!res.ok) throw new Error('Failed to fetch bosses');
      return res.json() as Promise<{ bosses: string[] }>;
    },
  });

  // Fetch items
  const { data: itemsData, isLoading: isLoadingItems } = useQuery({
    queryKey: ['public-items', selectedRaid, filters.slot, filters.quality, filters.boss, filters.search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedRaid) params.append('raid_instance', selectedRaid);
      if (filters.slot) params.append('slot', filters.slot);
      if (filters.quality !== undefined) params.append('quality', filters.quality.toString());
      if (filters.boss) params.append('boss_name', filters.boss);
      if (filters.search) params.append('search', filters.search);
      params.append('limit', '200');

      const res = await fetch(`${API_BASE}/public/items?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch items');
      return res.json() as Promise<{ items: TbcRaidItem[]; total: number }>;
    },
  });

  // Fetch selected items by ID (for cart view when loaded from URL)
  const { data: selectedItemsData } = useQuery({
    queryKey: ['public-items-batch', Array.from(selectedIds)],
    queryFn: async () => {
      const ids = Array.from(selectedIds);
      if (ids.length === 0) return { items: [] };

      const res = await fetch(`${API_BASE}/public/items/batch?ids=${ids.join(',')}`);
      if (!res.ok) throw new Error('Failed to fetch selected items');
      return res.json() as Promise<{ items: TbcRaidItem[] }>;
    },
    enabled: selectedIds.size > 0,
  });

  // Cache items when loaded
  useEffect(() => {
    if (itemsData?.items) {
      cacheItems(itemsData.items);
    }
  }, [itemsData, cacheItems]);

  useEffect(() => {
    if (selectedItemsData?.items) {
      cacheItems(selectedItemsData.items);
    }
  }, [selectedItemsData, cacheItems]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters({ search: searchInput || undefined });
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, setFilters]);

  // Item counts per raid
  const itemCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    if (instancesData?.instances) {
      for (const instance of instancesData.instances) {
        counts[instance.name] = instance.item_count;
      }
    }
    return counts;
  }, [instancesData]);

  // Items to display (always browse mode, cart is a drawer now)
  const displayItems = useMemo(() => {
    return itemsData?.items || [];
  }, [itemsData]);

  // Selected items for cart drawer
  const cartItems = useMemo(() => {
    return selectedItemsData?.items || [];
  }, [selectedItemsData]);

  // Group items by boss
  const groupedItems = useMemo(() => {
    const groups: Record<string, TbcRaidItem[]> = {};
    for (const item of displayItems) {
      const boss = item.boss_name || 'Unknown';
      if (!groups[boss]) {
        groups[boss] = [];
      }
      groups[boss].push(item);
    }
    // Sort bosses alphabetically
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [displayItems]);

  // Unique slots from current items (excluding Unknown)
  const availableSlots = useMemo(() => {
    const slots = new Set<string>();
    for (const item of itemsData?.items || []) {
      if (item.slot && (item.slot as string) !== 'Unknown') slots.add(item.slot);
    }
    return Array.from(slots).sort();
  }, [itemsData]);

  // Handle share
  const handleShare = () => {
    setShowShareModal(true);
  };

  const shareUrl = generateWishlistUrl(Array.from(selectedIds));

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <ShoppingCart className="h-6 w-6 text-amber-400" />
              <h1 className="text-xl font-bold text-white">TBC Raid Loot Browser</h1>
            </div>

            <div className="flex items-center gap-3">
              {selectedIds.size > 0 ? (
                <>
                  <span className="hidden md:block text-sm text-gray-400">
                    Click to view cart & share with your booster
                  </span>
                  <button
                    onClick={() => setShowCartDrawer(true)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-amber-500 text-black rounded-lg hover:bg-amber-400 transition-colors font-medium"
                  >
                    <ShoppingCart className="h-4 w-4" />
                    <span>{selectedIds.size}</span>
                    <span className="hidden sm:inline">items</span>
                  </button>
                </>
              ) : (
                <span className="text-sm text-gray-500">
                  Select items to build your wishlist
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Raid Tabs */}
      <div className="bg-gray-800/50 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <RaidTabs
            selectedRaid={selectedRaid}
            onSelectRaid={setSelectedRaid}
            itemCounts={itemCounts}
          />
        </div>
      </div>

      {/* Filters */}
      <div className="bg-gray-800/30 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search items..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:border-amber-500 focus:outline-none"
              />
              {searchInput && (
                <button
                  onClick={() => setSearchInput('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Slot filter */}
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-400" />
              <select
                value={filters.slot || ''}
                onChange={(e) => setFilters({ slot: e.target.value || undefined })}
                className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
              >
                <option value="">All Slots</option>
                {availableSlots.map((slot) => (
                  <option key={slot} value={slot}>
                    {slot}
                  </option>
                ))}
              </select>
            </div>

            {/* Quality filter */}
            <select
              value={filters.quality ?? ''}
              onChange={(e) =>
                setFilters({ quality: e.target.value ? parseInt(e.target.value) : undefined })
              }
              className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
            >
              <option value="">All Qualities</option>
              {[5, 4, 3, 2, 1, 0].map((q) => (
                <option key={q} value={q}>
                  {ITEM_QUALITY_NAMES[q as keyof typeof ITEM_QUALITY_NAMES]}
                </option>
              ))}
            </select>

            {/* Boss filter */}
            {bossesData?.bosses && bossesData.bosses.length > 0 && (
              <select
                value={filters.boss || ''}
                onChange={(e) => setFilters({ boss: e.target.value || undefined })}
                className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
              >
                <option value="">All Bosses</option>
                {bossesData.bosses.map((boss) => (
                  <option key={boss} value={boss}>
                    {boss}
                  </option>
                ))}
              </select>
            )}

            {/* Clear filters */}
            {(filters.slot || filters.quality !== undefined || filters.boss || filters.search) && (
              <button
                onClick={() => {
                  setFilters({ slot: undefined, quality: undefined, boss: undefined, search: undefined });
                  setSearchInput('');
                }}
                className="px-3 py-2 text-sm text-red-400 hover:text-red-300 transition-colors"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {isLoadingItems ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500"></div>
          </div>
        ) : displayItems.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400">
              No items found. Try adjusting your filters or select a different raid.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {groupedItems.map(([boss, items]) => (
              <div key={boss}>
                <h2 className="text-lg font-semibold text-white mb-3 pb-2 border-b border-gray-700">
                  {boss}
                  <span className="ml-2 text-sm text-gray-500 font-normal">
                    ({items.length} {items.length === 1 ? 'item' : 'items'})
                  </span>
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {items.map((item) => (
                    <WishlistItemCard
                      key={item.id}
                      item={item}
                      isSelected={isSelected(item.wowhead_id)}
                      onToggle={() => toggleItem(item.wowhead_id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Floating Cart Button (mobile) */}
      {selectedIds.size > 0 && (
        <button
          onClick={() => setShowCartDrawer(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-3 bg-amber-500 text-black rounded-full shadow-lg hover:bg-amber-400 transition-colors sm:hidden"
        >
          <ShoppingCart className="h-5 w-5" />
          <span className="font-semibold">{selectedIds.size}</span>
        </button>
      )}

      {/* Cart Drawer */}
      <CartDrawer
        isOpen={showCartDrawer}
        onClose={() => setShowCartDrawer(false)}
        items={cartItems}
        onRemoveItem={removeItem}
        onClear={() => {
          clearCart();
          setShowCartDrawer(false);
        }}
        onShare={handleShare}
      />

      {/* Share Modal */}
      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        url={shareUrl}
        itemCount={selectedIds.size}
      />
    </div>
  );
}
