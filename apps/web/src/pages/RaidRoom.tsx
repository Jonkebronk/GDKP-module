import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useState, useEffect, useRef } from 'react';
import { api } from '../api/client';
import { useSocket } from '../hooks/useSocket';
import { useAuctionStore, type AuctionEvent } from '../stores/auctionStore';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { formatGold, QUICK_BID_INCREMENTS, ITEM_QUALITY_COLORS, getDisplayName, AUCTION_DEFAULTS } from '@gdkp/shared';
import { Users, Coins, Clock, Send, Gavel, Plus, Trash2, Play, Rocket, Trophy, Package, X } from 'lucide-react';
import { PotDistribution } from '../components/PotDistribution';
import { AddItemsModal } from '../components/AddItemsModal';
import { SimpleUserDisplay } from '../components/UserDisplay';
import { AuctionSettings } from '../components/AuctionSettings';

// Quality to CSS class mapping
const qualityBorderClass: Record<number, string> = {
  1: 'wow-border-common',
  2: 'wow-border-uncommon',
  3: 'wow-border-rare',
  4: 'wow-border-epic',
  5: 'wow-border-legendary',
};

export function RaidRoom() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const { placeBid, sendChat, startAuction, isConnected } = useSocket(id || null);
  const { activeItem, remainingMs, isEnding, isLeadingBidder, auctionEvents } = useAuctionStore();
  const { messages: chatMessages, participants: liveParticipants } = useChatStore();

  const [bidAmount, setBidAmount] = useState('');
  const [chatMessage, setChatMessage] = useState('');
  const [itemPickerOpen, setItemPickerOpen] = useState(false);
  const [bidError, setBidError] = useState<string | null>(null);
  const [auctionDuration, setAuctionDuration] = useState<number>(AUCTION_DEFAULTS.DURATION);
  const [manualAwardItem, setManualAwardItem] = useState<any>(null);
  const [manualAwardPrice, setManualAwardPrice] = useState('');
  const [manualAwardWinner, setManualAwardWinner] = useState('');
  const auctionFeedRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);

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

  const { data: raid, isLoading } = useQuery({
    queryKey: ['raid', id],
    queryFn: async () => {
      const res = await api.get(`/raids/${id}`);
      return res.data;
    },
    enabled: !!id,
  });

  const isLeader = raid?.leader_id === user?.id;

  // Auto-scroll auction feed
  useEffect(() => {
    if (auctionFeedRef.current) {
      auctionFeedRef.current.scrollTop = auctionFeedRef.current.scrollHeight;
    }
  }, [auctionEvents]);

  // Auto-scroll chat
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // Start raid mutation
  const startRaidMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/raids/${id}/start`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['raid', id] });
    },
  });

  // Delete item mutation
  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      await api.delete(`/raids/${id}/items/${itemId}`);
    },
    onSuccess: () => {
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
      setManualAwardItem(null);
      setManualAwardPrice('');
      setManualAwardWinner('');
    },
  });

  const handleBid = (amount?: number) => {
    const bidValue = amount || parseInt(bidAmount);
    if (bidValue && activeItem) {
      placeBid(activeItem.id, bidValue);
      setBidAmount('');
    }
  };

  const handleStartAuction = (itemId: string) => {
    startAuction(itemId, auctionDuration);
  };

  const handleSendChat = () => {
    if (chatMessage.trim()) {
      sendChat(chatMessage);
      setChatMessage('');
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

  // Get item quality for styling
  const getItemQuality = (item: any) => item.quality || 4; // Default to epic

  const isPending = raid.status === 'PENDING';

  return (
    <div className="space-y-6">
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

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{raid.name}</h1>
          <p className="text-gray-400">{raid.instance}</p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-gray-400 text-sm">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <div className="flex items-center space-x-2 bg-gray-800 px-4 py-2 rounded-lg">
            <Coins className="h-5 w-5 text-amber-500" />
            <span className="text-amber-500 font-bold">{formatGold(raid.pot_total)}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main auction area */}
        <div className="lg:col-span-2 space-y-4">
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
                  <p className="text-3xl font-bold text-amber-400 mt-2">
                    {formatGold(activeItem.current_bid)}
                  </p>
                  <p className="text-gray-400 text-sm">
                    Min bid: {formatGold(minBid)}
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

              {/* Quick bid buttons */}
              <div className="flex flex-wrap gap-2 mb-4">
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
            </div>
          ) : (
            <div className="wow-tooltip wow-border-common p-8 text-center">
              <Gavel className="h-12 w-12 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400">No active auction</p>
            </div>
          )}

          {/* Auction Feed - Gargul Style */}
          <div className="wow-tooltip wow-border-rare">
            <div className="wow-tooltip-header p-3 border-b border-gray-700">
              <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wide">Auction Feed</h2>
            </div>
            <div
              ref={auctionFeedRef}
              className="h-40 overflow-y-auto p-3 space-y-1 gargul-feed text-sm"
            >
              {auctionEvents.length === 0 ? (
                <p className="text-gray-500 text-center py-4">Auction events will appear here</p>
              ) : (
                auctionEvents.map((event) => (
                  <GargulMessage key={event.id} event={event} />
                ))
              )}
            </div>
          </div>

          {/* Auction Settings - Only for leaders */}
          {isLeader && (
            <AuctionSettings
              duration={auctionDuration}
              onDurationChange={setAuctionDuration}
            />
          )}

          {/* Items Up For Auction */}
          <div className="wow-tooltip wow-border-epic">
            <div className="wow-tooltip-header flex items-center justify-between p-3 border-b border-gray-700">
              <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wide flex items-center space-x-2">
                <Package className="h-4 w-4" />
                <span>Up For Auction ({raid.items.filter((i: any) => i.status === 'PENDING' || i.status === 'ACTIVE').length})</span>
              </h2>
              {isLeader && (
                <button
                  onClick={() => setItemPickerOpen(true)}
                  className="flex items-center space-x-1 bg-amber-500 hover:bg-amber-600 text-black text-sm font-medium px-3 py-1.5 rounded transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add Items</span>
                </button>
              )}
            </div>

            <div className="p-3 space-y-2 max-h-60 overflow-y-auto">
              {raid.items.filter((i: any) => i.status === 'PENDING' || i.status === 'ACTIVE').length === 0 ? (
                <p className="text-gray-500 text-center py-4">No items pending auction</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {raid.items
                    .filter((item: any) => item.status === 'PENDING' || item.status === 'ACTIVE')
                    .map((item: any) => (
                      <ItemCard
                        key={item.id}
                        item={item}
                        isLeader={isLeader}
                        onStart={() => handleStartAuction(item.id)}
                        onDelete={() => deleteItemMutation.mutate(item.id)}
                        onManualAward={() => setManualAwardItem(item)}
                        isDeleting={deleteItemMutation.isPending}
                      />
                    ))}
                </div>
              )}
            </div>

            {/* Manual award hint for leaders */}
            {isLeader && raid.items.filter((i: any) => i.status === 'PENDING').length > 0 && (
              <div className="px-3 pb-2">
                <p className="text-xs text-gray-500 italic">
                  💡 Click the gavel icon to manually award an item without bidding
                </p>
              </div>
            )}
          </div>

          {/* Items Won */}
          {raid.items.filter((i: any) => i.status === 'COMPLETED').length > 0 && (
            <div className="wow-tooltip wow-border-common">
              <div className="wow-tooltip-header flex items-center justify-between p-3 border-b border-gray-700">
                <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wide flex items-center space-x-2">
                  <Trophy className="h-4 w-4" />
                  <span>Items Won ({raid.items.filter((i: any) => i.status === 'COMPLETED').length})</span>
                </h2>
              </div>

              <div className="p-3 space-y-2 max-h-48 overflow-y-auto">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {raid.items
                    .filter((item: any) => item.status === 'COMPLETED')
                    .map((item: any) => (
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
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Pot Distribution (Leader only) */}
          {isLeader && (
            <PotDistribution
              raidId={id!}
              isLeader={isLeader}
              raidStatus={raid.status}
              onDistributed={() => {
                queryClient.invalidateQueries({ queryKey: ['raid', id] });
                navigate('/raids');
              }}
            />
          )}

          {/* Participants */}
          <div className="wow-tooltip wow-border-common">
            <div className="wow-tooltip-header p-3 border-b border-gray-700">
              <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wide flex items-center space-x-2">
                <Users className="h-4 w-4" />
                <span>Participants ({liveParticipants.length > 0 ? liveParticipants.length : raid.participants.length})</span>
              </h2>
            </div>
            <div className="p-3 space-y-2 max-h-48 overflow-y-auto">
              {(liveParticipants.length > 0 ? liveParticipants : raid.participants.map((p: any) => ({
                user_id: p.user_id,
                username: p.user?.discord_username || 'Unknown',
                avatar: p.user?.discord_avatar || null,
                role: p.role,
              }))).map((p: any) => (
                <div key={p.user_id} className="flex items-center space-x-2">
                  <SimpleUserDisplay
                    user={{ discord_username: p.username, discord_avatar: p.avatar }}
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

          {/* Chat */}
          <div className="wow-tooltip wow-border-common">
            <div className="wow-tooltip-header p-3 border-b border-gray-700">
              <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wide">Chat</h2>
            </div>
            <div ref={chatRef} className="h-48 overflow-y-auto p-3 space-y-2">
              {chatMessages.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-4">Chat messages will appear here</p>
              ) : (
                chatMessages.map((msg) => (
                  <div key={msg.id} className="text-sm">
                    {msg.is_system ? (
                      <span className="text-gray-400 italic">{msg.message}</span>
                    ) : (
                      <>
                        <span className="text-amber-400 font-medium">{msg.username}: </span>
                        <span className="text-gray-300">{msg.message}</span>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
            <div className="p-3 border-t border-gray-700">
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                  placeholder="Type a message..."
                  className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <button
                  onClick={handleSendChat}
                  className="bg-gray-700 hover:bg-gray-600 text-white p-2 rounded transition-colors"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
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
                  }))).map((p: any) => (
                    <option key={p.user_id} value={p.user_id}>
                      {p.username}
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
  isDeleting: boolean;
}

function ItemCard({ item, isLeader, onStart, onDelete, onManualAward, isDeleting }: ItemCardProps) {
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
      </div>
    </div>
  );
}
