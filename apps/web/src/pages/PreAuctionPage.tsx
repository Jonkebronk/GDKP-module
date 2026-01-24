import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useState, useEffect, useMemo } from 'react';
import { api } from '../api/client';
import { useAuthStore } from '../stores/authStore';
import { usePreAuctionStore } from '../stores/preAuctionStore';
import { usePreAuctionSocket } from '../hooks/usePreAuctionSocket';
import { PreAuctionItemCard } from '../components/PreAuctionItemCard';
import { PreAuctionItemModal } from '../components/PreAuctionItemModal';
import type { PreAuctionFilters } from '@gdkp/shared';
import { formatGold, ITEM_SLOTS } from '@gdkp/shared';
import {
  Clock,
  Search,
  Filter,
  ChevronDown,
  ArrowLeft,
  Loader2,
  Trophy,
  Wallet,
  RefreshCw,
} from 'lucide-react';

// Countdown timer component
function CountdownTimer({ endsAt }: { endsAt: Date | null }) {
  const [remainingMs, setRemainingMs] = useState(0);

  useEffect(() => {
    if (!endsAt) return;

    const updateRemaining = () => {
      const remaining = new Date(endsAt).getTime() - Date.now();
      setRemainingMs(Math.max(0, remaining));
    };

    updateRemaining();
    const interval = setInterval(updateRemaining, 1000);

    return () => clearInterval(interval);
  }, [endsAt]);

  if (!endsAt || remainingMs <= 0) {
    return (
      <div className="text-gray-400">
        Pre-auction has ended
      </div>
    );
  }

  const hours = Math.floor(remainingMs / (1000 * 60 * 60));
  const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((remainingMs % (1000 * 60)) / 1000);

  const isEndingSoon = remainingMs <= 30 * 60 * 1000; // Last 30 minutes

  return (
    <div className={`flex items-center gap-2 ${isEndingSoon ? 'text-yellow-400' : 'text-white'}`}>
      <Clock className={`h-5 w-5 ${isEndingSoon ? 'animate-pulse' : ''}`} />
      <span className="font-mono text-lg">
        {hours.toString().padStart(2, '0')}:
        {minutes.toString().padStart(2, '0')}:
        {seconds.toString().padStart(2, '0')}
      </span>
    </div>
  );
}

export function PreAuctionPage() {
  const { id: raidId } = useParams<{ id: string }>();
  const { user, lockedAmount } = useAuthStore();
  const {
    items,
    setItems,
    endsAt,
    setEndsAt,
    setRaidId,
    filters,
    setFilters,
    availableFilters,
    setAvailableFilters,
    selectedItem,
    setSelectedItem,
    reset,
  } = usePreAuctionStore();

  const [searchQuery, setSearchQuery] = useState('');

  // Socket connection for real-time updates
  const { placeBid } = usePreAuctionSocket(raidId || null);

  // Calculate remaining time
  const [remainingMs, setRemainingMs] = useState(0);
  useEffect(() => {
    if (!endsAt) return;

    const updateRemaining = () => {
      const remaining = new Date(endsAt).getTime() - Date.now();
      setRemainingMs(Math.max(0, remaining));
    };

    updateRemaining();
    const interval = setInterval(updateRemaining, 1000);

    return () => clearInterval(interval);
  }, [endsAt]);

  // Fetch pre-auction items
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['pre-auction', raidId, filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.slot) params.append('slot', filters.slot);
      if (filters.quality !== undefined) params.append('quality', filters.quality.toString());
      if (filters.boss) params.append('boss', filters.boss);
      if (filters.search) params.append('search', filters.search);
      if (filters.status) params.append('status', filters.status);

      const res = await api.get(`/raids/${raidId}/pre-auction?${params.toString()}`);
      return res.data;
    },
    enabled: !!raidId,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch filter options
  const { data: filterOptions } = useQuery({
    queryKey: ['pre-auction-filters', raidId],
    queryFn: async () => {
      const res = await api.get(`/raids/${raidId}/pre-auction/filters`);
      return res.data;
    },
    enabled: !!raidId,
  });

  // Update store when data changes
  useEffect(() => {
    if (data) {
      setItems(data.items);
      setRaidId(raidId || null);
      if (data.raid?.preauction_ends_at) {
        setEndsAt(new Date(data.raid.preauction_ends_at));
      }
    }
  }, [data, raidId, setItems, setRaidId, setEndsAt]);

  // Update available filters
  useEffect(() => {
    if (filterOptions) {
      setAvailableFilters(filterOptions);
    }
  }, [filterOptions, setAvailableFilters]);

  // Clean up on unmount
  useEffect(() => {
    return () => reset();
  }, [reset]);

  // Listen for bid events to trigger refetch
  useEffect(() => {
    const handleBidNew = () => refetch();
    const handlePreAuctionEnded = () => refetch();

    window.addEventListener('preauction:bid:new', handleBidNew as EventListener);
    window.addEventListener('preauction:ended', handlePreAuctionEnded as EventListener);

    return () => {
      window.removeEventListener('preauction:bid:new', handleBidNew as EventListener);
      window.removeEventListener('preauction:ended', handlePreAuctionEnded as EventListener);
    };
  }, [refetch]);

  // Filter items locally by search query
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const query = searchQuery.toLowerCase();
    return items.filter((item) =>
      item.tbc_item?.name.toLowerCase().includes(query) ||
      item.tbc_item?.boss_name?.toLowerCase().includes(query)
    );
  }, [items, searchQuery]);

  // Calculate stats
  const stats = useMemo(() => {
    const leading = items.filter((item) => item.winner_id === user?.id).length;
    const totalBids = items.filter((item) => item.current_bid > 0).length;
    const myTotalBid = items
      .filter((item) => item.winner_id === user?.id)
      .reduce((sum, item) => sum + item.current_bid, 0);

    return { leading, totalBids, myTotalBid };
  }, [items, user]);

  const balance = user?.gold_balance || 0;
  const availableBalance = balance - lockedAmount;

  const handlePlaceBid = (itemId: string, amount: number) => {
    placeBid(itemId, amount);
  };

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                to="/pre-auctions"
                className="text-gray-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div>
                <h1 className="text-xl font-bold text-white">
                  {data?.raid?.name || 'Pre-Auction'}
                </h1>
                <p className="text-sm text-gray-400">
                  {data?.raid?.instances?.join(' + ') || ''}
                </p>
              </div>
            </div>

            {/* Countdown Timer */}
            <div className="flex items-center gap-6">
              <CountdownTimer endsAt={endsAt} />
              <button
                onClick={() => refetch()}
                className="p-2 text-gray-400 hover:text-white transition-colors"
                title="Refresh"
              >
                <RefreshCw className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar - Filters */}
          <aside className="lg:w-72 flex-shrink-0">
            <div className="bg-gray-800 rounded-lg p-4 sticky top-24 space-y-4">
              {/* Stats */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400 flex items-center gap-2">
                    <Trophy className="h-4 w-4" />
                    Leading
                  </span>
                  <span className="text-green-400 font-medium">{stats.leading}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400 flex items-center gap-2">
                    <Wallet className="h-4 w-4" />
                    Available
                  </span>
                  <span className="text-amber-400 font-medium">
                    {formatGold(availableBalance)}
                  </span>
                </div>
                {stats.myTotalBid > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Locked in bids</span>
                    <span className="text-yellow-400 font-medium">
                      {formatGold(stats.myTotalBid)}
                    </span>
                  </div>
                )}
              </div>

              <hr className="border-gray-700" />

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search items..."
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* Slot Filter */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">Slot</label>
                <div className="relative">
                  <select
                    value={filters.slot || ''}
                    onChange={(e) => setFilters({ slot: e.target.value || undefined })}
                    className="w-full appearance-none bg-gray-700 border border-gray-600 rounded-lg pl-3 pr-8 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="">All Slots</option>
                    {(availableFilters.slots.length > 0 ? availableFilters.slots : ITEM_SLOTS).map((slot) => (
                      <option key={slot} value={slot}>
                        {slot}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Quality Filter */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">Quality</label>
                <div className="relative">
                  <select
                    value={filters.quality?.toString() || ''}
                    onChange={(e) =>
                      setFilters({ quality: e.target.value ? parseInt(e.target.value, 10) : undefined })
                    }
                    className="w-full appearance-none bg-gray-700 border border-gray-600 rounded-lg pl-3 pr-8 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="">All Qualities</option>
                    <option value="5">Legendary</option>
                    <option value="4">Epic</option>
                    <option value="3">Rare</option>
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Boss Filter */}
              {availableFilters.bosses.length > 0 && (
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Boss</label>
                  <div className="relative">
                    <select
                      value={filters.boss || ''}
                      onChange={(e) => setFilters({ boss: e.target.value || undefined })}
                      className="w-full appearance-none bg-gray-700 border border-gray-600 rounded-lg pl-3 pr-8 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                      <option value="">All Bosses</option>
                      {availableFilters.bosses.map((boss) => (
                        <option key={boss} value={boss}>
                          {boss}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
              )}

              {/* Status Filter */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">Status</label>
                <div className="relative">
                  <select
                    value={filters.status || ''}
                    onChange={(e) => setFilters({ status: (e.target.value || undefined) as PreAuctionFilters['status'] })}
                    className="w-full appearance-none bg-gray-700 border border-gray-600 rounded-lg pl-3 pr-8 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="">All</option>
                    <option value="ACTIVE">Active</option>
                    <option value="ENDED">Ended</option>
                    <option value="CLAIMED">Claimed</option>
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Clear Filters */}
              {(filters.slot || filters.quality || filters.boss || filters.status) && (
                <button
                  onClick={() => setFilters({ slot: undefined, quality: undefined, boss: undefined, status: undefined })}
                  className="w-full py-2 text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Clear Filters
                </button>
              )}
            </div>
          </aside>

          {/* Main Content - Item Grid */}
          <main className="flex-1">
            {isLoading ? (
              <div className="flex items-center justify-center py-24">
                <Loader2 className="h-8 w-8 text-amber-500 animate-spin" />
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="text-center py-24">
                <Filter className="h-12 w-12 mx-auto mb-4 text-gray-600" />
                <p className="text-gray-400">No items found matching your filters</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-gray-400 text-sm">
                    {filteredItems.length} items
                  </span>
                  <span className="text-gray-400 text-sm">
                    {stats.totalBids} with bids
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredItems.map((item) => (
                    <PreAuctionItemCard
                      key={item.id}
                      item={item}
                      currentUserId={user?.id || ''}
                      onClick={() => setSelectedItem(item)}
                      remainingMs={remainingMs}
                    />
                  ))}
                </div>
              </>
            )}
          </main>
        </div>
      </div>

      {/* Bid Modal */}
      {selectedItem && (
        <PreAuctionItemModal
          raidId={raidId || ''}
          itemId={selectedItem.id}
          isOpen={!!selectedItem}
          onClose={() => setSelectedItem(null)}
          onPlaceBid={handlePlaceBid}
          remainingMs={remainingMs}
        />
      )}
    </div>
  );
}
