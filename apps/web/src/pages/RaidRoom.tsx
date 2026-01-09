import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useState, useEffect, useRef, useMemo } from 'react';
import { api } from '../api/client';
import { useSocket } from '../hooks/useSocket';
import { useAuctionStore, type AuctionEvent } from '../stores/auctionStore';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { formatGold, QUICK_BID_INCREMENTS, ITEM_QUALITY_COLORS, getDisplayName, AUCTION_DEFAULTS } from '@gdkp/shared';
import { Users, Clock, Gavel, Plus, Trash2, Play, Rocket, UserPlus, Trophy, Package, X, Square, Coins, RotateCcw, Wallet, Scissors, GripVertical, StopCircle, SkipForward } from 'lucide-react';
import { PotDistribution } from '../components/PotDistribution';
import { AddItemsModal } from '../components/AddItemsModal';
import { SimpleUserDisplay } from '../components/UserDisplay';
import { AuctionSettings } from '../components/AuctionSettings';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Quality to CSS class mapping
const qualityBorderClass: Record<number, string> = {
  1: 'wow-border-common',
  2: 'wow-border-uncommon',
  3: 'wow-border-rare',
  4: 'wow-border-epic',
  5: 'wow-border-legendary',
};

// Raid background images
const raidBackgrounds: Record<string, string> = {
  'Karazhan': '/raids/karazhan.jpg',
  "Gruul's Lair": '/raids/gruul.jpg',
  "Magtheridon's Lair": '/raids/magtheridon.jpg',
  'Serpentshrine Cavern': '/raids/ssc.jpg',
  'Tempest Keep': '/raids/tempest-keep.jpg',
  'The Eye': '/raids/tempest-keep.jpg',
  'Mount Hyjal': '/raids/hyjal.jpg',
  'Black Temple': '/raids/black-temple.jpg',
  'Sunwell Plateau': '/raids/sunwell.jpg',
  "Zul'Aman": '/raids/zulaman.jpg',
};

const getRaidBackground = (instance: string) => raidBackgrounds[instance] || '';

export function RaidRoom() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { user, lockedAmount } = useAuthStore();
  const { activeItem, remainingMs, isEnding, isLeadingBidder, auctionEvents, addAuctionEvent } = useAuctionStore();
  const { participants: liveParticipants } = useChatStore();

  const [bidAmount, setBidAmount] = useState('');
  const [itemPickerOpen, setItemPickerOpen] = useState(false);
  const [bidError, setBidError] = useState<string | null>(null);
  const [auctionDuration, setAuctionDuration] = useState<number>(AUCTION_DEFAULTS.DURATION);
  const [auctionMinBid, setAuctionMinBid] = useState<number>(0);
  const [auctionIncrement, setAuctionIncrement] = useState<number>(10);
  const [manualAwardItem, setManualAwardItem] = useState<any>(null);
  const [manualAwardPrice, setManualAwardPrice] = useState('');
  const [manualAwardWinner, setManualAwardWinner] = useState('');
  const [autoPlayActive, setAutoPlayActive] = useState(false);
  const [selectedUnsoldItems, setSelectedUnsoldItems] = useState<string[]>([]);
  const auctionFeedRef = useRef<HTMLDivElement>(null);
  const autoPlayRef = useRef(autoPlayActive);

  // Keep autoPlay ref in sync
  useEffect(() => {
    autoPlayRef.current = autoPlayActive;
  }, [autoPlayActive]);

  // Listen for bid rejection events
  useEffect(() => {
    const handleBidRejected = (e: CustomEvent) => {
      setBidError(e.detail.message);
      setTimeout(() => setBidError(null), 5000);
    };
    const handleBidAccepted = () => {
      setBidError(null);
    };
    window.addEventListener('bid:rejected', handleBidRejected as EventListener);
    window.addEventListener('bid:accepted', handleBidAccepted as EventListener);
    return () => {
      window.removeEventListener('bid:rejected', handleBidRejected as EventListener);
      window.removeEventListener('bid:accepted', handleBidAccepted as EventListener);
    };
  }, []);

  // Listen for auction/raid events that require refetch
  useEffect(() => {
    const handleRefetch = () => {
      queryClient.invalidateQueries({ queryKey: ['raid', id] });
    };
    window.addEventListener('auction:started', handleRefetch);
    window.addEventListener('auction:ended', handleRefetch);
    window.addEventListener('auction:restarted', handleRefetch);
    window.addEventListener('auction:stopped', handleRefetch);
    window.addEventListener('auction:skipped', handleRefetch);
    window.addEventListener('raid:completed', handleRefetch);
    window.addEventListener('raid:cancelled', handleRefetch);
    return () => {
      window.removeEventListener('auction:started', handleRefetch);
      window.removeEventListener('auction:ended', handleRefetch);
      window.removeEventListener('auction:restarted', handleRefetch);
      window.removeEventListener('auction:stopped', handleRefetch);
      window.removeEventListener('auction:skipped', handleRefetch);
      window.removeEventListener('raid:completed', handleRefetch);
      window.removeEventListener('raid:cancelled', handleRefetch);
    };
  }, [id, queryClient]);

  const { data: raid, isLoading, refetch: refetchRaid } = useQuery({
    queryKey: ['raid', id],
    queryFn: async () => {
      const res = await api.get(`/raids/${id}`);
      return res.data;
    },
    enabled: !!id,
  });

  const isLeader = raid?.leader_id === user?.id;
  const isParticipant = raid?.participants?.some((p: any) => p.user_id === user?.id);

  // Only connect to socket if user is a participant
  const { placeBid, startAuction, stopAuction, skipAuction, isConnected } = useSocket(isParticipant ? id || null : null);

  // Join raid mutation
  const joinRaidMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/raids/${id}/join`);
    },
    onSuccess: () => {
      refetchRaid();
    },
  });

  // Auto-scroll auction feed
  useEffect(() => {
    if (auctionFeedRef.current) {
      auctionFeedRef.current.scrollTop = auctionFeedRef.current.scrollHeight;
    }
  }, [auctionEvents]);

  // Auto-play: start next auction when current ends
  useEffect(() => {
    const handleAutoPlay = async () => {
      console.log('Auto-play: auction ended, checking for next item...', autoPlayRef.current);
      if (!autoPlayRef.current) return;

      // Wait for data to refresh
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Refetch to get latest items
      const { data: freshRaid } = await refetchRaid();
      if (!freshRaid) {
        console.log('Auto-play: No raid data after refetch');
        return;
      }

      // Find next pending item
      const nextItem = freshRaid.items.find((i: any) => i.status === 'PENDING');
      console.log('Auto-play: Next pending item:', nextItem?.name || 'none');
      if (nextItem) {
        startAuction(nextItem.id, auctionDuration, auctionMinBid, auctionIncrement);
      } else {
        // No more items, disable auto-play
        console.log('Auto-play: No more items, stopping');
        setAutoPlayActive(false);
      }
    };

    window.addEventListener('auction:ended', handleAutoPlay);
    return () => {
      window.removeEventListener('auction:ended', handleAutoPlay);
    };
  }, [refetchRaid, startAuction, auctionDuration, auctionMinBid, auctionIncrement]);

  // Start raid mutation
  const startRaidMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/raids/${id}/start`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['raid', id] });
    },
  });

  // Delete item mutation with optimistic update
  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      await api.delete(`/raids/${id}/items/${itemId}`);
    },
    // Optimistic update - remove item from cache immediately
    onMutate: async (itemId: string) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['raid', id] });

      // Snapshot previous value
      const previousRaid = queryClient.getQueryData(['raid', id]);

      // Optimistically update cache
      queryClient.setQueryData(['raid', id], (old: any) => {
        if (!old?.items) return old;
        return {
          ...old,
          items: old.items.filter((item: any) => item.id !== itemId),
        };
      });

      return { previousRaid };
    },
    // Rollback on error
    onError: (_err, _itemId, context) => {
      if (context?.previousRaid) {
        queryClient.setQueryData(['raid', id], context.previousRaid);
      }
    },
    // Always refetch after mutation settles
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['raid', id] });
    },
  });

  // Manual award mutation
  const manualAwardMutation = useMutation({
    mutationFn: async ({ itemId, winnerId, price }: { itemId: string; winnerId: string; price: number }) => {
      await api.post(`/raids/${id}/items/${itemId}/award`, { winnerId, price });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['raid', id] });
      queryClient.invalidateQueries({ queryKey: ['raid', id, 'distribution-preview'] });
      setManualAwardItem(null);
      setManualAwardPrice('');
      setManualAwardWinner('');
    },
  });

  // Re-auction mutation
  const reauctionMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const res = await api.post(`/auctions/${itemId}/reauction`);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['raid', id] });
      queryClient.invalidateQueries({ queryKey: ['raid', id, 'distribution-preview'] });
      // Add event to auction feed
      addAuctionEvent({
        type: 'system',
        message: `🔄 Re-auction: ${data.item.name} (was ${formatGold(data.previous_amount)} to ${data.previous_winner})`,
      });
    },
  });

  // Create goodie bag mutation
  const goodieBagMutation = useMutation({
    mutationFn: async (itemIds: string[]) => {
      const res = await api.post(`/raids/${id}/goodie-bag`, { item_ids: itemIds });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['raid', id] });
      setSelectedUnsoldItems([]);
      addAuctionEvent({
        type: 'system',
        message: `🎁 Goodie Bag created with ${selectedUnsoldItems.length} items`,
      });
    },
  });

  // Break up goodie bag mutation
  const breakUpGoodieBagMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const res = await api.delete(`/raids/${id}/goodie-bag/${itemId}`);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['raid', id] });
      addAuctionEvent({
        type: 'system',
        message: `📦 Goodie Bag broken up into ${data.items?.length || 0} items`,
      });
    },
  });

  // Reorder items mutation
  const reorderItemsMutation = useMutation({
    mutationFn: async (itemIds: string[]) => {
      await api.patch(`/raids/${id}/items/reorder`, { item_ids: itemIds });
    },
    onError: () => {
      // Refetch to restore original order on error
      queryClient.invalidateQueries({ queryKey: ['raid', id] });
    },
  });

  // DnD-kit sensors for drag-and-drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle drag end for reordering items
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const pendingItems = raid?.items?.filter((i: any) => i.status === 'PENDING') || [];
      const oldIndex = pendingItems.findIndex((item: any) => item.id === active.id);
      const newIndex = pendingItems.findIndex((item: any) => item.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const reorderedItems = arrayMove(pendingItems, oldIndex, newIndex);
        const newItemIds = reorderedItems.map((item: any) => item.id);

        // Optimistically update UI
        queryClient.setQueryData(['raid', id], (old: any) => {
          if (!old?.items) return old;
          const nonPendingItems = old.items.filter((i: any) => i.status !== 'PENDING');
          // Rebuild with reordered pending items first
          return {
            ...old,
            items: [...reorderedItems, ...nonPendingItems],
          };
        });

        // Persist to backend
        reorderItemsMutation.mutate(newItemIds);
      }
    }
  };

  const toggleUnsoldItemSelection = (itemId: string) => {
    setSelectedUnsoldItems((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    );
  };

  // Calculate total spending per player from completed items
  // IMPORTANT: This must be before any early returns to follow React hook rules
  const playerSpending = useMemo(() => {
    if (!raid?.items) return [];

    const spending: Record<string, { user: any; total: number; items: number }> = {};

    raid.items
      .filter((item: any) => item.status === 'COMPLETED' && item.winner_id)
      .forEach((item: any) => {
        const id = item.winner_id;
        if (!spending[id]) {
          spending[id] = { user: item.winner, total: 0, items: 0 };
        }
        spending[id].total += Number(item.current_bid);
        spending[id].items += 1;
      });

    return Object.values(spending).sort((a, b) => b.total - a.total);
  }, [raid?.items]);

  const handleBid = (amount?: number) => {
    const bidValue = amount || parseInt(bidAmount);
    if (bidValue && activeItem) {
      placeBid(activeItem.id, bidValue);
      setBidAmount('');
    }
  };

  const handleStartAuction = (itemId: string) => {
    startAuction(itemId, auctionDuration, auctionMinBid, auctionIncrement);
  };

  const handleToggleAutoPlay = () => {
    if (autoPlayActive) {
      // Turn off
      setAutoPlayActive(false);
      return;
    }

    // Turn on auto-play
    setAutoPlayActive(true);

    // Check if there's an active auction in raid data
    const hasActiveAuction = raid?.items?.some((i: any) => i.status === 'ACTIVE');
    console.log('Auto-play toggled ON, hasActiveAuction:', hasActiveAuction, 'isConnected:', isConnected);

    // If no active auction, start the first pending item
    if (!hasActiveAuction) {
      const firstPending = raid?.items?.find((i: any) => i.status === 'PENDING');
      console.log('Auto-play: First pending item:', firstPending?.name, firstPending?.id);

      if (firstPending) {
        // Small delay to ensure socket is ready
        setTimeout(() => {
          console.log('Auto-play: Starting auction for', firstPending.name);
          startAuction(firstPending.id, auctionDuration, auctionMinBid, auctionIncrement);
        }, 100);
      } else {
        console.log('Auto-play: No pending items found');
        setAutoPlayActive(false);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500"></div>
      </div>
    );
  }

  if (!raid) {
    return <div className="text-center text-gray-400">Raid not found</div>;
  }

  const formatTime = (ms: number) => {
    const seconds = Math.ceil(ms / 1000);
    return `${seconds}s`;
  };

  const minBid = activeItem
    ? activeItem.current_bid + activeItem.min_increment
    : 0;

  // Check if anyone has bid (current_bid > starting_bid means someone bid)
  const hasBids = activeItem
    ? activeItem.current_bid > activeItem.starting_bid
    : false;

  // Get item quality for styling
  const getItemQuality = (item: any) => item.quality || 4; // Default to epic

  const isPending = raid.status === 'PENDING';

  return (
    <div className="space-y-6">
      {/* Join Raid Banner - Show when user is not a participant */}
      {!isParticipant && (raid.status === 'PENDING' || raid.status === 'ACTIVE') && (
        <div className="bg-green-500/20 border border-green-500/50 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <UserPlus className="h-6 w-6 text-green-500" />
            <div>
              <p className="text-green-400 font-medium">Join this raid</p>
              <p className="text-green-400/70 text-sm">Click to join and participate in auctions</p>
            </div>
          </div>
          <button
            onClick={() => joinRaidMutation.mutate()}
            disabled={joinRaidMutation.isPending}
            className="bg-green-500 hover:bg-green-600 disabled:bg-green-500/50 text-black font-semibold px-6 py-2 rounded-lg transition-colors flex items-center space-x-2"
          >
            {joinRaidMutation.isPending ? (
              <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-black"></div>
            ) : (
              <>
                <UserPlus className="h-5 w-5" />
                <span>Join Raid</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Start Raid Banner - Show when raid is PENDING */}
      {isPending && isLeader && (
        <div className="bg-amber-500/20 border border-amber-500/50 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Rocket className="h-6 w-6 text-amber-500" />
            <div>
              <p className="text-amber-400 font-medium">Raid not started yet</p>
              <p className="text-amber-400/70 text-sm">Start the raid to begin auctioning items</p>
            </div>
          </div>
          <button
            onClick={() => startRaidMutation.mutate()}
            disabled={startRaidMutation.isPending}
            className="bg-amber-500 hover:bg-amber-600 disabled:bg-amber-500/50 text-black font-semibold px-6 py-2 rounded-lg transition-colors flex items-center space-x-2"
          >
            {startRaidMutation.isPending ? (
              <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-black"></div>
            ) : (
              <>
                <Rocket className="h-5 w-5" />
                <span>Start Raid</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Header with raid-specific background image */}
      <div
        className="relative rounded-lg overflow-hidden border border-gray-700/50"
        style={{
          backgroundImage: getRaidBackground(raid.instance) ? `url(${getRaidBackground(raid.instance)})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        {/* Dark gradient overlay for readability */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-black/70" />

        {/* Content */}
        <div className="relative flex items-center justify-between p-4">
          <div>
            <h1 className="text-2xl font-bold text-white drop-shadow-lg">{raid.name}</h1>
            <p className="text-gray-300 drop-shadow-md">{raid.instance}</p>
          </div>
          <div className="flex items-center space-x-2">
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-gray-300 text-sm drop-shadow-md">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-[320px_1fr_1fr_280px] gap-6">
        {/* Left Sidebar - Items (hidden on mobile/tablet, shown on xl) */}
        <div className="hidden xl:block space-y-4 order-1">
          {/* Up For Auction */}
          <div className="wow-tooltip wow-border-epic">
            <div className="wow-tooltip-header flex items-center justify-between p-3 border-b border-gray-700">
              <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wide flex items-center space-x-2">
                <Package className="h-4 w-4" />
                <span>Up For Auction ({raid.items.filter((i: any) => i.status === 'PENDING' || i.status === 'ACTIVE').length})</span>
              </h2>
              {isLeader && (
                <div className="flex items-center space-x-1">
                  {raid.items.filter((i: any) => i.status === 'PENDING').length > 0 && (
                    <button
                      onClick={handleToggleAutoPlay}
                      className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all ${
                        autoPlayActive
                          ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse'
                          : 'bg-green-500 hover:bg-green-600 text-white'
                      }`}
                      title={autoPlayActive ? 'Stop Auto-Play' : 'Start Auto-Play'}
                    >
                      {autoPlayActive ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
                    </button>
                  )}
                  <button
                    onClick={() => setItemPickerOpen(true)}
                    className="flex items-center justify-center w-8 h-8 bg-amber-500 hover:bg-amber-600 text-black rounded transition-colors"
                    title="Add Items"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
            <div className="p-3 space-y-2 max-h-96 overflow-y-auto">
              {raid.items.filter((i: any) => i.status === 'PENDING' || i.status === 'ACTIVE').length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-4">No items pending</p>
              ) : (
                <>
                  {raid.items.filter((i: any) => i.status === 'ACTIVE').map((item: any) => (
                    <ItemCard key={item.id} item={item} isLeader={isLeader} onStart={() => {}} onDelete={() => {}} onManualAward={() => {}} isDeleting={false} />
                  ))}
                  {isLeader ? (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                      <SortableContext items={raid.items.filter((i: any) => i.status === 'PENDING').map((i: any) => i.id)} strategy={verticalListSortingStrategy}>
                        <div className="space-y-2">
                          {raid.items.filter((item: any) => item.status === 'PENDING').map((item: any) => (
                            <SortableItemCard
                              key={item.id}
                              item={item}
                              isLeader={isLeader}
                              onStart={() => handleStartAuction(item.id)}
                              onDelete={() => deleteItemMutation.mutate(item.id)}
                              onManualAward={() => setManualAwardItem(item)}
                              onBreakUp={item.is_bundle ? () => breakUpGoodieBagMutation.mutate(item.id) : undefined}
                              isDeleting={deleteItemMutation.isPending}
                              isBreakingUp={breakUpGoodieBagMutation.isPending}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  ) : (
                    <div className="space-y-2">
                      {raid.items.filter((item: any) => item.status === 'PENDING').map((item: any) => (
                        <ItemCard
                          key={item.id}
                          item={item}
                          isLeader={isLeader}
                          onStart={() => handleStartAuction(item.id)}
                          onDelete={() => deleteItemMutation.mutate(item.id)}
                          onManualAward={() => setManualAwardItem(item)}
                          onBreakUp={item.is_bundle ? () => breakUpGoodieBagMutation.mutate(item.id) : undefined}
                          isDeleting={deleteItemMutation.isPending}
                          isBreakingUp={breakUpGoodieBagMutation.isPending}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Unsold Items */}
          {raid.items.filter((i: any) => (i.status === 'COMPLETED' && !i.winner_id) || i.status === 'CANCELLED').length > 0 && (
            <div className="wow-tooltip wow-border-common">
              <div className="wow-tooltip-header flex items-center justify-between p-3 border-b border-gray-700">
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide flex items-center space-x-2">
                  <Package className="h-4 w-4" />
                  <span>Unsold ({raid.items.filter((i: any) => (i.status === 'COMPLETED' && !i.winner_id) || i.status === 'CANCELLED').length})</span>
                </h2>
              </div>
              <div className="p-3 space-y-2 max-h-64 overflow-y-auto">
                {raid.items
                  .filter((item: any) => (item.status === 'COMPLETED' && !item.winner_id) || item.status === 'CANCELLED')
                  .map((item: any) => (
                    <div key={item.id} className={`wow-item-card ${qualityBorderClass[item.quality || 4] || 'wow-border-epic'} p-2`}>
                      <div className="flex items-center space-x-2">
                        <div className={`p-0.5 rounded border ${qualityBorderClass[item.quality || 4] || 'wow-border-epic'}`}>
                          {item.icon_url ? (
                            <img src={item.icon_url} alt={item.name} className="w-8 h-8 rounded" />
                          ) : (
                            <div className="w-8 h-8 rounded bg-gray-700 flex items-center justify-center">
                              <span className="text-gray-500 text-xs">?</span>
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-xs truncate" style={{ color: ITEM_QUALITY_COLORS[(item.quality || 4) as keyof typeof ITEM_QUALITY_COLORS] }}>
                            {item.name}
                          </p>
                        </div>
                        {isLeader && (
                          <button
                            onClick={() => reauctionMutation.mutate(item.id)}
                            className="bg-orange-600/20 hover:bg-orange-600/40 text-orange-400 p-1 rounded transition-colors"
                            title="Re-auction"
                          >
                            <RotateCcw className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Main auction area */}
        <div className="lg:col-span-2 space-y-4 order-2">
          {/* Auction Settings - Only for leaders (at top) */}
          {isLeader && (
            <AuctionSettings
              duration={auctionDuration}
              onDurationChange={setAuctionDuration}
              minBid={auctionMinBid}
              onMinBidChange={setAuctionMinBid}
              increment={auctionIncrement}
              onIncrementChange={setAuctionIncrement}
            />
          )}

          {/* Active Auction - WoW Style */}
          {activeItem ? (
            <div className={`wow-tooltip ${qualityBorderClass[getItemQuality(activeItem)]} p-4 ${isEnding ? 'auction-ending' : ''}`}>
              {/* Header */}
              <div className="wow-tooltip-header flex items-center justify-between p-3 -m-4 mb-4 rounded-t">
                <h2 className="text-lg font-semibold text-white flex items-center space-x-2">
                  <Gavel className="h-5 w-5 text-amber-500" />
                  <span>Live Auction</span>
                </h2>
                <div className={`flex items-center space-x-2 ${isEnding ? 'auction-timer-ending' : 'text-gray-300'}`}>
                  <Clock className="h-5 w-5" />
                  <span className="text-2xl font-bold auction-timer">{formatTime(remainingMs)}</span>
                </div>
              </div>

              {/* Item Display */}
              <div className="flex items-start space-x-4 mb-6">
                <div className={`p-1 rounded border-2 ${qualityBorderClass[getItemQuality(activeItem)]}`}>
                  {activeItem.icon_url ? (
                    <img src={activeItem.icon_url} alt={activeItem.name} className="w-16 h-16 rounded" />
                  ) : (
                    <div className="w-16 h-16 rounded bg-gray-700 flex items-center justify-center">
                      <span className="text-2xl text-gray-500">?</span>
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold item-epic">{activeItem.name}</h3>
                  {/* Bundle contents display */}
                  {activeItem.is_bundle && activeItem.bundle_item_names && activeItem.bundle_item_names.length > 0 && (
                    <div className="mt-1 text-sm">
                      <p className="text-gray-500 text-xs mb-1">Contains:</p>
                      <ul className="list-disc list-inside text-purple-400 text-xs space-y-0.5">
                        {activeItem.bundle_item_names.map((name: string, i: number) => (
                          <li key={i}>{name}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <p className="text-3xl font-bold text-amber-400 mt-2">
                    {formatGold(hasBids ? activeItem.current_bid : minBid)}
                  </p>
                  <p className="text-gray-400 text-sm">
                    {hasBids
                      ? `Current bid: ${formatGold(activeItem.current_bid)} • Min: ${formatGold(minBid)}`
                      : `Min bid: ${formatGold(minBid)}`
                    }
                  </p>
                </div>
              </div>

              {isLeadingBidder && (
                <div className="bg-green-500/20 text-green-400 px-4 py-2 rounded-lg mb-4 text-center font-medium">
                  You are the highest bidder!
                </div>
              )}

              {/* Bid error message */}
              {bidError && (
                <div className="bg-red-500/20 text-red-400 px-4 py-2 rounded-lg mb-4 text-center font-medium border border-red-500/50">
                  {bidError}
                </div>
              )}

              {/* Available gold display */}
              <div className="flex items-center text-sm mb-3">
                <Wallet className="h-4 w-4 text-amber-500 mr-2" />
                <span className="text-white font-bold mr-1">Available Gold:</span>
                <span className="text-amber-400 font-semibold">{formatGold((user?.gold_balance || 0) - lockedAmount)}</span>
              </div>

              {/* Quick bid buttons */}
              <div className="flex flex-wrap gap-2 mb-4">
                <button
                  onClick={() => handleBid(minBid)}
                  className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg transition-colors border border-amber-500 font-medium"
                >
                  Min {formatGold(minBid, { abbreviated: true })}
                </button>
                {QUICK_BID_INCREMENTS.map((increment) => (
                  <button
                    key={increment}
                    onClick={() => handleBid(activeItem.current_bid + increment)}
                    className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors border border-gray-600"
                  >
                    +{formatGold(increment, { abbreviated: true })}
                  </button>
                ))}
              </div>

              {/* Custom bid */}
              <div className="flex space-x-2">
                <input
                  type="number"
                  value={bidAmount}
                  onChange={(e) => setBidAmount(e.target.value)}
                  placeholder={`Min ${minBid}g`}
                  className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <button
                  onClick={() => handleBid()}
                  disabled={!bidAmount || parseInt(bidAmount) < minBid}
                  className="bg-amber-500 hover:bg-amber-600 disabled:bg-gray-600 disabled:text-gray-400 text-black font-semibold px-6 py-2 rounded-lg transition-colors"
                >
                  Place Bid
                </button>
              </div>

              {/* Auction Controls - Leader Only */}
              {isLeader && (
                <div className="flex space-x-2 mt-4 pt-4 border-t border-gray-700">
                  <button
                    onClick={() => stopAuction(activeItem.id)}
                    className="flex-1 flex items-center justify-center space-x-2 bg-orange-600/20 hover:bg-orange-600/40 text-orange-400 py-2 rounded-lg transition-colors border border-orange-600/50"
                    title="Stop auction and return item to queue"
                  >
                    <StopCircle className="h-5 w-5" />
                    <span>Stop</span>
                  </button>
                  <button
                    onClick={() => skipAuction(activeItem.id)}
                    className="flex-1 flex items-center justify-center space-x-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 py-2 rounded-lg transition-colors border border-red-600/50"
                    title="Skip auction and mark item as unsold"
                  >
                    <SkipForward className="h-5 w-5" />
                    <span>Skip</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="wow-tooltip wow-border-common p-8 text-center">
              <Gavel className="h-12 w-12 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-500 text-sm">No active auction</p>
            </div>
          )}

          {/* Auction Feed - Gargul Style */}
          <div className="wow-tooltip wow-border-rare">
            <div className="wow-tooltip-header p-3 border-b border-gray-700">
              <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wide">Auction Feed</h2>
            </div>
            <div
              ref={auctionFeedRef}
              className="h-64 overflow-y-auto p-3 space-y-1 gargul-feed text-sm"
            >
              {auctionEvents.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-4">Auction events will appear here</p>
              ) : (
                auctionEvents.map((event) => (
                  <GargulMessage key={event.id} event={event} />
                ))
              )}
            </div>
          </div>

          {/* Items Up For Auction (hidden on xl where left sidebar shows) */}
          <div className="wow-tooltip wow-border-epic xl:hidden">
            <div className="wow-tooltip-header flex items-center justify-between p-3 border-b border-gray-700">
              <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wide flex items-center space-x-2">
                <Package className="h-4 w-4" />
                <span>Up For Auction ({raid.items.filter((i: any) => i.status === 'PENDING' || i.status === 'ACTIVE').length})</span>
              </h2>
              {isLeader && (
                <div className="flex items-center space-x-2">
                  {/* Auto-play button */}
                  {raid.items.filter((i: any) => i.status === 'PENDING').length > 0 && (
                    <button
                      onClick={handleToggleAutoPlay}
                      className={`flex items-center justify-center w-10 h-10 rounded-lg transition-all ${
                        autoPlayActive
                          ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse'
                          : 'bg-green-500 hover:bg-green-600 text-white'
                      }`}
                      title={autoPlayActive ? 'Stop Auto-Play' : 'Start Auto-Play'}
                    >
                      {autoPlayActive ? (
                        <Square className="h-5 w-5" />
                      ) : (
                        <Play className="h-5 w-5 ml-0.5" />
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => setItemPickerOpen(true)}
                    className="flex items-center space-x-1 bg-amber-500 hover:bg-amber-600 text-black text-sm font-medium px-3 py-1.5 rounded transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Add Items</span>
                  </button>
                </div>
              )}
            </div>

            <div className="p-3 space-y-2">
              {raid.items.filter((i: any) => i.status === 'PENDING' || i.status === 'ACTIVE').length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-4">No items pending auction</p>
              ) : (
                <>
                  {/* Active item (not draggable) */}
                  {raid.items.filter((i: any) => i.status === 'ACTIVE').map((item: any) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      isLeader={isLeader}
                      onStart={() => {}}
                      onDelete={() => {}}
                      onManualAward={() => {}}
                      isDeleting={false}
                    />
                  ))}

                  {/* Pending items (draggable for leader) */}
                  {isLeader ? (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext
                        items={raid.items.filter((i: any) => i.status === 'PENDING').map((i: any) => i.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-2">
                          {raid.items
                            .filter((item: any) => item.status === 'PENDING')
                            .map((item: any) => (
                              <SortableItemCard
                                key={item.id}
                                item={item}
                                isLeader={isLeader}
                                onStart={() => handleStartAuction(item.id)}
                                onDelete={() => deleteItemMutation.mutate(item.id)}
                                onManualAward={() => setManualAwardItem(item)}
                                onBreakUp={item.is_bundle ? () => breakUpGoodieBagMutation.mutate(item.id) : undefined}
                                isDeleting={deleteItemMutation.isPending}
                                isBreakingUp={breakUpGoodieBagMutation.isPending}
                              />
                            ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  ) : (
                    <div className="space-y-2">
                      {raid.items
                        .filter((item: any) => item.status === 'PENDING')
                        .map((item: any) => (
                          <ItemCard
                            key={item.id}
                            item={item}
                            isLeader={isLeader}
                            onStart={() => handleStartAuction(item.id)}
                            onDelete={() => deleteItemMutation.mutate(item.id)}
                            onManualAward={() => setManualAwardItem(item)}
                            onBreakUp={item.is_bundle ? () => breakUpGoodieBagMutation.mutate(item.id) : undefined}
                            isDeleting={deleteItemMutation.isPending}
                            isBreakingUp={breakUpGoodieBagMutation.isPending}
                          />
                        ))}
                    </div>
                  )}
                </>
              )}
            </div>

          </div>

          {/* Items Won */}
          {raid.items.filter((i: any) => i.status === 'COMPLETED' && i.winner_id).length > 0 && (
            <div className="wow-tooltip wow-border-common">
              <div className="wow-tooltip-header flex items-center justify-between p-3 border-b border-gray-700">
                <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wide flex items-center space-x-2">
                  <Trophy className="h-4 w-4" />
                  <span>Items Won ({raid.items.filter((i: any) => i.status === 'COMPLETED' && i.winner_id).length})</span>
                </h2>
              </div>

              <div className="p-3 space-y-2">
                {raid.items
                  .filter((item: any) => item.status === 'COMPLETED' && item.winner_id)
                  .map((item: any) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      isLeader={isLeader}
                      onStart={() => {}}
                      onDelete={() => {}}
                      onManualAward={() => {}}
                      onReauction={() => reauctionMutation.mutate(item.id)}
                      isDeleting={false}
                      isReauctioning={reauctionMutation.isPending}
                    />
                  ))}
              </div>
            </div>
          )}

          {/* Unsold Items (completed with no winner or cancelled) - hidden on xl where left sidebar shows */}
          {raid.items.filter((i: any) => (i.status === 'COMPLETED' && !i.winner_id) || i.status === 'CANCELLED').length > 0 && (
            <div className="wow-tooltip wow-border-common xl:hidden">
              <div className="wow-tooltip-header flex items-center justify-between p-3 border-b border-gray-700">
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide flex items-center space-x-2">
                  <Package className="h-4 w-4" />
                  <span>Unsold ({raid.items.filter((i: any) => (i.status === 'COMPLETED' && !i.winner_id) || i.status === 'CANCELLED').length})</span>
                </h2>
                {isLeader && selectedUnsoldItems.length >= 2 && (
                  <button
                    onClick={() => goodieBagMutation.mutate(selectedUnsoldItems)}
                    disabled={goodieBagMutation.isPending}
                    className="bg-amber-600 hover:bg-amber-700 text-white px-3 py-1 rounded text-sm font-medium transition-colors disabled:opacity-50 flex items-center space-x-1"
                  >
                    <Package className="h-4 w-4" />
                    <span>Create Goodie Bag ({selectedUnsoldItems.length})</span>
                  </button>
                )}
              </div>

              <div className="p-3 space-y-2">
                {raid.items
                  .filter((item: any) => (item.status === 'COMPLETED' && !item.winner_id) || item.status === 'CANCELLED')
                  .map((item: any) => (
                      <div
                        key={item.id}
                        className={`wow-item-card ${qualityBorderClass[item.quality || 4] || 'wow-border-epic'} p-2 ${selectedUnsoldItems.includes(item.id) ? 'ring-2 ring-amber-500' : ''}`}
                      >
                        <div className="flex items-center space-x-2">
                          {/* Checkbox for goodie bag selection (leader only) */}
                          {isLeader && (
                            <input
                              type="checkbox"
                              checked={selectedUnsoldItems.includes(item.id)}
                              onChange={() => toggleUnsoldItemSelection(item.id)}
                              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-amber-500 focus:ring-amber-500 focus:ring-offset-gray-800"
                            />
                          )}
                          <div className={`p-0.5 rounded border ${qualityBorderClass[item.quality || 4] || 'wow-border-epic'}`}>
                            {item.icon_url ? (
                              <img src={item.icon_url} alt={item.name} className="w-10 h-10 rounded" />
                            ) : (
                              <div className="w-10 h-10 rounded bg-gray-700 flex items-center justify-center">
                                <span className="text-gray-500">?</span>
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <a
                              href={item.wowhead_id ? `https://www.wowhead.com/tbc/item=${item.wowhead_id}` : '#'}
                              target="_blank"
                              rel="noopener noreferrer"
                              data-wowhead={item.wowhead_id ? `item=${item.wowhead_id}&domain=tbc` : undefined}
                              className="font-medium text-sm hover:underline truncate block"
                              style={{ color: ITEM_QUALITY_COLORS[(item.quality || 4) as keyof typeof ITEM_QUALITY_COLORS] }}
                            >
                              {item.name}
                            </a>
                            <p className="text-xs text-gray-500">No bids</p>
                          </div>
                          {/* Re-auction, Break Up, and Manual Award buttons */}
                          {isLeader && (
                            <div className="flex items-center space-x-1">
                              <button
                                onClick={() => reauctionMutation.mutate(item.id)}
                                disabled={reauctionMutation.isPending}
                                className="bg-orange-600/20 hover:bg-orange-600/40 text-orange-400 p-1.5 rounded transition-colors disabled:opacity-50"
                                title="Re-auction item"
                              >
                                <RotateCcw className="h-4 w-4" />
                              </button>
                              {item.is_bundle && (
                                <button
                                  onClick={() => breakUpGoodieBagMutation.mutate(item.id)}
                                  disabled={breakUpGoodieBagMutation.isPending}
                                  className="bg-amber-600/20 hover:bg-amber-600/40 text-amber-400 p-1.5 rounded transition-colors disabled:opacity-50"
                                  title="Break up Goodie Bag"
                                >
                                  <Scissors className="h-4 w-4" />
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  setManualAwardItem(item);
                                  setManualAwardPrice('');
                                  setManualAwardWinner('');
                                }}
                                className="bg-purple-600/20 hover:bg-purple-600/40 text-purple-400 p-1.5 rounded transition-colors"
                                title="Manually award item"
                              >
                                <Gavel className="h-4 w-4" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar */}
        <div className="space-y-4 order-3">
          {/* Pot Distribution */}
          <PotDistribution
            raidId={id!}
            isLeader={isLeader}
            raidStatus={raid.status}
            hasActiveAuction={raid.items.some((i: any) => i.status === 'ACTIVE')}
            onDistributed={() => {
              queryClient.invalidateQueries({ queryKey: ['raid', id] });
              // Stay on page - summary will show automatically
            }}
          />

          {/* Total Spend */}
          <div className="wow-tooltip wow-border-common">
            <div className="wow-tooltip-header p-3 border-b border-gray-700">
              <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wide flex items-center space-x-2">
                <Coins className="h-4 w-4" />
                <span>Total Spend</span>
              </h2>
            </div>
            <div className="h-48 overflow-y-auto p-3 space-y-2">
              {playerSpending.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-4">Player spending will appear here</p>
              ) : (
                playerSpending.map(({ user, total, items }) => (
                  <div key={user?.id || 'unknown'} className="flex items-center justify-between py-1">
                    <div className="flex items-center space-x-2">
                      <SimpleUserDisplay
                        user={{
                          discord_username: user?.discord_username || 'Unknown',
                          discord_avatar: user?.discord_avatar,
                          alias: user?.alias,
                        }}
                        showAvatar
                        avatarSize={20}
                        className="text-gray-300 text-sm"
                      />
                      <span className="text-gray-500 text-xs">({items} item{items !== 1 ? 's' : ''})</span>
                    </div>
                    <span className="text-amber-400 font-medium">{formatGold(total)}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Participants */}
          <div className="wow-tooltip wow-border-common">
            <div className="wow-tooltip-header p-3 border-b border-gray-700">
              <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wide flex items-center space-x-2">
                <Users className="h-4 w-4" />
                <span>Players ({liveParticipants.length > 0 ? liveParticipants.length : raid.participants.length})</span>
              </h2>
            </div>
            <div className="p-3 space-y-2 max-h-48 overflow-y-auto">
              {(liveParticipants.length > 0 ? liveParticipants : raid.participants.map((p: any) => ({
                user_id: p.user_id,
                username: p.user?.discord_username || 'Unknown',
                avatar: p.user?.discord_avatar || null,
                alias: p.user?.alias || null,
                role: p.role,
              }))).map((p: any) => (
                <div key={p.user_id} className="flex items-center space-x-2">
                  <SimpleUserDisplay
                    user={{
                      discord_username: p.username,
                      discord_avatar: p.avatar,
                      alias: p.alias,
                    }}
                    showAvatar
                    avatarSize={24}
                    className="text-gray-300 text-sm"
                  />
                  {p.role === 'LEADER' && (
                    <span className="text-xs text-amber-500 font-medium">Leader</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Add Items Modal */}
      <AddItemsModal
        raidId={id!}
        raidInstance={raid.instance}
        isOpen={itemPickerOpen}
        onClose={() => setItemPickerOpen(false)}
        onItemAdded={() => {
          queryClient.invalidateQueries({ queryKey: ['raid', id] });
        }}
      />

      {/* Manual Award Modal */}
      {manualAwardItem && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="wow-tooltip wow-border-epic max-w-md w-full">
            <div className="wow-tooltip-header flex items-center justify-between p-4 border-b border-gray-700">
              <h2 className="text-lg font-semibold text-amber-400 flex items-center space-x-2">
                <Gavel className="h-5 w-5" />
                <span>Manual Award</span>
              </h2>
              <button
                onClick={() => {
                  setManualAwardItem(null);
                  setManualAwardPrice('');
                  setManualAwardWinner('');
                }}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Item display */}
              <div className="flex items-center space-x-3 bg-gray-800/50 p-3 rounded-lg">
                {manualAwardItem.icon_url ? (
                  <img src={manualAwardItem.icon_url} alt={manualAwardItem.name} className="w-12 h-12 rounded border border-purple-500" />
                ) : (
                  <div className="w-12 h-12 rounded bg-gray-700 flex items-center justify-center border border-purple-500">
                    <span className="text-gray-500">?</span>
                  </div>
                )}
                <div>
                  <h3 className="font-medium text-purple-400">{manualAwardItem.name}</h3>
                  <p className="text-xs text-gray-400">Manually award this item to a participant</p>
                </div>
              </div>

              {/* Winner selection */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">Select Winner</label>
                <select
                  value={manualAwardWinner}
                  onChange={(e) => setManualAwardWinner(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">Choose a participant...</option>
                  {(liveParticipants.length > 0 ? liveParticipants : raid.participants.map((p: any) => ({
                    user_id: p.user_id,
                    username: p.user?.discord_username || 'Unknown',
                    alias: p.user?.alias || null,
                  }))).map((p: any) => (
                    <option key={p.user_id} value={p.user_id}>
                      {p.alias || p.username}
                    </option>
                  ))}
                </select>
              </div>

              {/* Price input */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">Set Price (gold)</label>
                <input
                  type="number"
                  value={manualAwardPrice}
                  onChange={(e) => setManualAwardPrice(e.target.value)}
                  placeholder="Enter price in gold..."
                  min="0"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {/* Action buttons */}
              <div className="flex space-x-3 pt-2">
                <button
                  onClick={() => {
                    setManualAwardItem(null);
                    setManualAwardPrice('');
                    setManualAwardWinner('');
                  }}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (manualAwardWinner && manualAwardPrice) {
                      manualAwardMutation.mutate({
                        itemId: manualAwardItem.id,
                        winnerId: manualAwardWinner,
                        price: parseInt(manualAwardPrice),
                      });
                    }
                  }}
                  disabled={!manualAwardWinner || !manualAwardPrice || manualAwardMutation.isPending}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:text-gray-400 text-white py-2 rounded-lg transition-colors font-medium"
                >
                  {manualAwardMutation.isPending ? 'Awarding...' : 'Award Item'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Gargul-style message component
function GargulMessage({ event }: { event: AuctionEvent }) {
  const formatMessage = () => {
    switch (event.type) {
      case 'auction_start':
        return (
          <>
            <span className="gargul-prefix">💎 Gargul: </span>
            <span>Bid on </span>
            <span className="gargul-item">[{event.itemName}]</span>
            <span>. {event.message.split('].')[1]}</span>
            {event.bundleItemNames && event.bundleItemNames.length > 0 && (
              <div className="mt-1 ml-4 text-xs text-gray-400">
                {event.bundleItemNames.map((name, i) => (
                  <div key={i} className="text-purple-400">- {name}</div>
                ))}
              </div>
            )}
          </>
        );
      case 'bid_placed':
        return (
          <>
            <span className="gargul-prefix">💎 Gargul: </span>
            <span className="gargul-player">{event.playerName}</span>
            <span> is the highest bidder - </span>
            <span className="gargul-gold">{event.amount}g</span>
          </>
        );
      case 'countdown':
        return (
          <>
            <span className="gargul-prefix">💎 Gargul: </span>
            <span className="gargul-countdown">{event.message}</span>
          </>
        );
      case 'stop_bids':
        return (
          <>
            <span className="gargul-prefix">💎 Gargul: </span>
            <span className="gargul-stop">{event.message}</span>
          </>
        );
      case 'awarded':
        if (event.playerName) {
          return (
            <>
              <span className="gargul-prefix">💎 Gargul: </span>
              <span className="gargul-item">[{event.itemName}]</span>
              <span> was awarded to </span>
              <span className="gargul-player">{event.playerName}</span>
              <span> for </span>
              <span className="gargul-gold">{event.amount}g</span>
              <span className="gargul-congrats">. Congrats!</span>
            </>
          );
        }
        return (
          <>
            <span className="gargul-prefix">💎 Gargul: </span>
            <span className="gargul-item">[{event.itemName}]</span>
            <span className="text-gray-400"> received no bids.</span>
          </>
        );
      case 'pot_updated':
        return (
          <>
            <span className="gargul-prefix">💎 Gargul: </span>
            <span>Pot was updated, it now holds </span>
            <span className="gargul-gold">{event.amount}g</span>
          </>
        );
      case 'auction_stopped':
        return (
          <>
            <span className="gargul-prefix">💎 Gargul: </span>
            <span>Auction stopped for </span>
            <span className="gargul-item">[{event.itemName}]</span>
            <span className="text-orange-400"> - item returned to queue</span>
          </>
        );
      case 'auction_skipped':
        return (
          <>
            <span className="gargul-prefix">💎 Gargul: </span>
            <span>Auction skipped for </span>
            <span className="gargul-item">[{event.itemName}]</span>
            <span className="text-red-400"> - item marked as unsold</span>
          </>
        );
      default:
        return <span>{event.message}</span>;
    }
  };

  return (
    <div className="gargul-msg text-gray-200">
      {formatMessage()}
    </div>
  );
}

// WoW-style item card component
interface ItemCardProps {
  item: any;
  isLeader: boolean;
  onStart: () => void;
  onDelete: () => void;
  onManualAward: () => void;
  onReauction?: () => void;
  onBreakUp?: () => void;
  isDeleting: boolean;
  isReauctioning?: boolean;
  isBreakingUp?: boolean;
}

function ItemCard({ item, isLeader, onStart, onDelete, onManualAward, onReauction, onBreakUp, isDeleting, isReauctioning, isBreakingUp }: ItemCardProps) {
  const quality = item.quality || 4;
  const qualityColor = ITEM_QUALITY_COLORS[quality as keyof typeof ITEM_QUALITY_COLORS] || '#a335ee';
  const borderClass = qualityBorderClass[quality] || 'wow-border-epic';

  const isActive = item.status === 'ACTIVE';
  const isCompleted = item.status === 'COMPLETED';
  const isPending = item.status === 'PENDING';

  return (
    <div
      className={`wow-item-card ${borderClass} p-2 ${
        isActive ? 'ring-2 ring-amber-500 ring-opacity-50' : ''
      } ${isCompleted ? 'opacity-50' : ''}`}
    >
      <div className="flex items-center space-x-2">
        {/* Icon */}
        <div className={`p-0.5 rounded border ${borderClass}`}>
          {item.icon_url ? (
            <img src={item.icon_url} alt={item.name} className="w-10 h-10 rounded" />
          ) : (
            <div className="w-10 h-10 rounded bg-gray-700 flex items-center justify-center">
              <span className="text-gray-500">?</span>
            </div>
          )}
        </div>

        {/* Item info */}
        <div className="flex-1 min-w-0">
          <a
            href={item.wowhead_id ? `https://www.wowhead.com/tbc/item=${item.wowhead_id}` : '#'}
            target="_blank"
            rel="noopener noreferrer"
            data-wowhead={item.wowhead_id ? `item=${item.wowhead_id}&domain=tbc` : undefined}
            className="font-medium text-sm hover:underline truncate block"
            style={{ color: qualityColor }}
          >
            {item.name}
          </a>
          {/* Bundle contents tooltip */}
          {item.is_bundle && item.bundle_item_names && item.bundle_item_names.length > 0 && (
            <p className="text-xs text-purple-400 truncate" title={item.bundle_item_names.join(', ')}>
              {item.bundle_item_names.length} items
            </p>
          )}
          {isCompleted && item.winner && (
            <p className="text-xs text-gray-400 truncate">
              {getDisplayName(item.winner)} - {formatGold(item.current_bid)}
            </p>
          )}
          {isActive && (
            <p className="text-xs text-amber-500 font-medium">LIVE</p>
          )}
        </div>

        {/* Actions */}
        {isPending && isLeader && (
          <div className="flex items-center space-x-1">
            <button
              onClick={onStart}
              className="bg-amber-500 hover:bg-amber-600 text-black p-1.5 rounded transition-colors"
              title="Start auction"
            >
              <Play className="h-4 w-4" />
            </button>
            {item.is_bundle && onBreakUp && (
              <button
                onClick={onBreakUp}
                disabled={isBreakingUp}
                className="bg-amber-600/20 hover:bg-amber-600/40 text-amber-400 p-1.5 rounded transition-colors disabled:opacity-50"
                title="Break up Goodie Bag"
              >
                <Scissors className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={onManualAward}
              className="bg-purple-600/20 hover:bg-purple-600/40 text-purple-400 p-1.5 rounded transition-colors"
              title="Manually award item"
            >
              <Gavel className="h-4 w-4" />
            </button>
            <button
              onClick={onDelete}
              disabled={isDeleting}
              className="bg-red-600/20 hover:bg-red-600/40 text-red-400 p-1.5 rounded transition-colors"
              title="Delete item"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
        {/* Re-auction button for completed items */}
        {isCompleted && isLeader && onReauction && (
          <button
            onClick={onReauction}
            disabled={isReauctioning}
            className="bg-orange-600/20 hover:bg-orange-600/40 text-orange-400 p-1.5 rounded transition-colors disabled:opacity-50"
            title="Re-auction item"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// Sortable wrapper for ItemCard (drag and drop)
function SortableItemCard(props: ItemCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const quality = props.item.quality || 4;
  const qualityColor = ITEM_QUALITY_COLORS[quality as keyof typeof ITEM_QUALITY_COLORS] || '#a335ee';
  const borderClass = qualityBorderClass[quality] || 'wow-border-epic';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`wow-item-card ${borderClass} p-2`}
    >
      <div className="flex items-center space-x-2">
        {/* Drag handle */}
        <button
          className="cursor-grab active:cursor-grabbing text-gray-500 hover:text-gray-300 p-1"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        {/* Icon */}
        <div className={`p-0.5 rounded border ${borderClass}`}>
          {props.item.icon_url ? (
            <img src={props.item.icon_url} alt={props.item.name} className="w-10 h-10 rounded" />
          ) : (
            <div className="w-10 h-10 rounded bg-gray-700 flex items-center justify-center">
              <span className="text-gray-500">?</span>
            </div>
          )}
        </div>

        {/* Item info */}
        <div className="flex-1 min-w-0">
          <a
            href={props.item.wowhead_id ? `https://www.wowhead.com/tbc/item=${props.item.wowhead_id}` : '#'}
            target="_blank"
            rel="noopener noreferrer"
            data-wowhead={props.item.wowhead_id ? `item=${props.item.wowhead_id}&domain=tbc` : undefined}
            className="font-medium text-sm hover:underline truncate block"
            style={{ color: qualityColor }}
          >
            {props.item.name}
          </a>
          {/* Bundle contents tooltip */}
          {props.item.is_bundle && props.item.bundle_item_names && props.item.bundle_item_names.length > 0 && (
            <p className="text-xs text-purple-400 truncate" title={props.item.bundle_item_names.join(', ')}>
              {props.item.bundle_item_names.length} items
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center space-x-1">
          <button
            onClick={props.onStart}
            className="bg-amber-500 hover:bg-amber-600 text-black p-1.5 rounded transition-colors"
            title="Start auction"
          >
            <Play className="h-4 w-4" />
          </button>
          {props.item.is_bundle && props.onBreakUp && (
            <button
              onClick={props.onBreakUp}
              disabled={props.isBreakingUp}
              className="bg-amber-600/20 hover:bg-amber-600/40 text-amber-400 p-1.5 rounded transition-colors disabled:opacity-50"
              title="Break up Goodie Bag"
            >
              <Scissors className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={props.onManualAward}
            className="bg-purple-600/20 hover:bg-purple-600/40 text-purple-400 p-1.5 rounded transition-colors"
            title="Manually award item"
          >
            <Gavel className="h-4 w-4" />
          </button>
          <button
            onClick={props.onDelete}
            disabled={props.isDeleting}
            className="bg-red-600/20 hover:bg-red-600/40 text-red-400 p-1.5 rounded transition-colors"
            title="Delete item"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
