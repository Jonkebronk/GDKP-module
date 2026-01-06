import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/client';
import { useSocket } from '../hooks/useSocket';
import { useAuctionStore } from '../stores/auctionStore';
import { useAuthStore } from '../stores/authStore';
import { formatGold, QUICK_BID_INCREMENTS } from '@gdkp/shared';
import { Users, Coins, Clock, Send, Gavel, Plus, Trash2, Link, Loader2 } from 'lucide-react';
import { PotDistribution } from '../components/PotDistribution';
import { ItemPicker } from '../components/ItemPicker';

export function RaidRoom() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const { placeBid, sendChat, startAuction, isConnected } = useSocket(id || null);
  const { activeItem, remainingMs, isEnding, isLeadingBidder, bids } = useAuctionStore();

  const [bidAmount, setBidAmount] = useState('');
  const [chatMessage, setChatMessage] = useState('');
  const [itemPickerOpen, setItemPickerOpen] = useState(false);
  const [wowheadInput, setWowheadInput] = useState('');
  const [wowheadLoading, setWowheadLoading] = useState(false);
  const [wowheadError, setWowheadError] = useState('');

  const { data: raid, isLoading } = useQuery({
    queryKey: ['raid', id],
    queryFn: async () => {
      const res = await api.get(`/raids/${id}`);
      return res.data;
    },
    enabled: !!id,
  });

  const isLeader = raid?.leader_id === user?.id;

  // Delete item mutation
  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      await api.delete(`/raids/${id}/items/${itemId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['raid', id] });
    },
  });

  // Add item from WoWhead ID
  const handleAddFromWowhead = async () => {
    // Extract ID from input (could be URL or just ID)
    const match = wowheadInput.match(/item[=/](\d+)/i) || wowheadInput.match(/^(\d+)$/);
    if (!match) {
      setWowheadError('Enter a valid WoWhead item ID or URL');
      return;
    }

    const wowheadId = parseInt(match[1]);
    setWowheadLoading(true);
    setWowheadError('');

    try {
      // Fetch item data from WoWhead
      const lookupRes = await api.get(`/items/wowhead/${wowheadId}`);
      const itemData = lookupRes.data;

      if (itemData.error) {
        setWowheadError(itemData.error);
        return;
      }

      // Add to raid
      await api.post(`/raids/${id}/items`, {
        name: itemData.name,
        wowhead_id: itemData.id,
        icon_url: `https://wow.zamimg.com/images/wow/icons/large/${itemData.icon}.jpg`,
        starting_bid: 0,
        min_increment: 10,
        auction_duration: 60,
      });

      queryClient.invalidateQueries({ queryKey: ['raid', id] });
      setWowheadInput('');
    } catch (err: any) {
      setWowheadError(err.response?.data?.message || 'Failed to add item');
    } finally {
      setWowheadLoading(false);
    }
  };

  const handleBid = (amount?: number) => {
    const bidValue = amount || parseInt(bidAmount);
    if (bidValue && activeItem) {
      placeBid(activeItem.id, bidValue);
      setBidAmount('');
    }
  };

  const handleStartAuction = (itemId: string) => {
    startAuction(itemId);
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
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-gold-500"></div>
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

  return (
    <div className="space-y-6">
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
            <Coins className="h-5 w-5 text-gold-500" />
            <span className="text-gold-500 font-bold">{formatGold(raid.pot_total)}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main auction area */}
        <div className="lg:col-span-2 space-y-6">
          {/* Active Auction */}
          {activeItem ? (
            <div className={`bg-gray-800 rounded-lg p-6 ${isEnding ? 'auction-ending border-2 border-red-500' : ''}`}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white flex items-center space-x-2">
                  <Gavel className="h-5 w-5 text-gold-500" />
                  <span>Live Auction</span>
                </h2>
                <div className={`flex items-center space-x-2 ${isEnding ? 'text-red-500 animate-pulse' : 'text-gray-400'}`}>
                  <Clock className="h-5 w-5" />
                  <span className="text-2xl font-bold">{formatTime(remainingMs)}</span>
                </div>
              </div>

              <div className="flex items-start space-x-4 mb-6">
                {activeItem.icon_url && (
                  <img src={activeItem.icon_url} alt={activeItem.name} className="w-16 h-16 rounded" />
                )}
                <div>
                  <h3 className="text-xl font-bold text-epic">{activeItem.name}</h3>
                  <p className="text-3xl font-bold text-gold-500 mt-2">
                    {formatGold(activeItem.current_bid)}
                  </p>
                  <p className="text-gray-400 text-sm">
                    Min bid: {formatGold(minBid)}
                  </p>
                </div>
              </div>

              {isLeadingBidder && (
                <div className="bg-green-500/20 text-green-400 px-4 py-2 rounded-lg mb-4 text-center">
                  You are the highest bidder!
                </div>
              )}

              {/* Quick bid buttons */}
              <div className="flex flex-wrap gap-2 mb-4">
                {QUICK_BID_INCREMENTS.map((increment) => (
                  <button
                    key={increment}
                    onClick={() => handleBid(activeItem.current_bid + increment)}
                    className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors"
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
                  placeholder={`Min ${minBid}`}
                  className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-gold-500"
                />
                <button
                  onClick={() => handleBid()}
                  disabled={!bidAmount || parseInt(bidAmount) < minBid}
                  className="bg-gold-600 hover:bg-gold-700 disabled:bg-gray-600 text-white font-medium px-6 py-2 rounded-lg transition-colors"
                >
                  Bid
                </button>
              </div>

              {/* Recent bids */}
              {bids.length > 0 && (
                <div className="mt-4 max-h-32 overflow-y-auto">
                  {bids.slice(-5).reverse().map((bid) => (
                    <div key={bid.id} className="flex items-center justify-between py-1 text-sm">
                      <span className="text-gray-400">{bid.user.discord_username}</span>
                      <span className="text-gold-500">{formatGold(bid.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-gray-800 rounded-lg p-6 text-center">
              <Gavel className="h-12 w-12 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400">No active auction</p>
            </div>
          )}

          {/* Items queue */}
          <div className="bg-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Items</h2>
              {isLeader && (
                <button
                  onClick={() => setItemPickerOpen(true)}
                  className="flex items-center space-x-1 bg-gold-600 hover:bg-gold-700 text-white text-sm px-3 py-1.5 rounded-lg transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add Items</span>
                </button>
              )}
            </div>

            {/* Manual WoWhead ID input (Leader only) */}
            {isLeader && (
              <div className="mb-4 p-3 bg-gray-700/50 rounded-lg">
                <div className="flex items-center space-x-2 mb-2">
                  <Link className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-400">Add by WoWhead ID or URL</span>
                </div>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={wowheadInput}
                    onChange={(e) => setWowheadInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddFromWowhead()}
                    placeholder="e.g., 28795 or wowhead.com/tbc/item=28795"
                    className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-gold-500"
                  />
                  <button
                    onClick={handleAddFromWowhead}
                    disabled={wowheadLoading || !wowheadInput.trim()}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white text-sm px-3 py-1.5 rounded transition-colors flex items-center space-x-1"
                  >
                    {wowheadLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    <span>Add</span>
                  </button>
                </div>
                {wowheadError && (
                  <p className="text-red-400 text-xs mt-1">{wowheadError}</p>
                )}
              </div>
            )}

            <div className="space-y-2">
              {raid.items.map((item: any) => (
                <div
                  key={item.id}
                  className={`flex items-center justify-between p-3 rounded-lg ${
                    item.status === 'ACTIVE'
                      ? 'bg-gold-500/20 border border-gold-500'
                      : item.status === 'COMPLETED'
                      ? 'bg-gray-700 opacity-50'
                      : 'bg-gray-700'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    {item.icon_url ? (
                      <img src={item.icon_url} alt={item.name} className="w-8 h-8 rounded border border-gray-600" />
                    ) : (
                      <div className="w-8 h-8 rounded border border-gray-600 bg-gray-600 flex items-center justify-center">
                        <span className="text-xs text-gray-400">?</span>
                      </div>
                    )}
                    <a
                      href={item.wowhead_id ? `https://www.wowhead.com/tbc/item=${item.wowhead_id}` : '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-wowhead={item.wowhead_id ? `item=${item.wowhead_id}&domain=tbc` : undefined}
                      className={`font-medium hover:underline ${item.status === 'COMPLETED' ? 'text-gray-500' : 'text-epic'}`}
                    >
                      {item.name}
                    </a>
                  </div>
                  <div className="flex items-center space-x-2">
                    {item.status === 'COMPLETED' && item.winner && (
                      <span className="text-gray-400 text-sm">
                        {item.winner.discord_username} - {formatGold(item.current_bid)}
                      </span>
                    )}
                    {item.status === 'PENDING' && isLeader && (
                      <>
                        <button
                          onClick={() => handleStartAuction(item.id)}
                          className="bg-gold-600 hover:bg-gold-700 text-white text-sm px-3 py-1 rounded transition-colors"
                        >
                          Start
                        </button>
                        <button
                          onClick={() => deleteItemMutation.mutate(item.id)}
                          disabled={deleteItemMutation.isPending}
                          className="bg-red-600/20 hover:bg-red-600/40 text-red-400 p-1 rounded transition-colors"
                          title="Delete item"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                    {item.status === 'ACTIVE' && (
                      <span className="text-gold-500 text-sm font-medium">LIVE</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
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
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
              <Users className="h-5 w-5" />
              <span>Participants ({raid.participants.length})</span>
            </h2>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {raid.participants.map((p: any) => (
                <div key={p.id} className="flex items-center space-x-2">
                  {p.user.discord_avatar ? (
                    <img src={p.user.discord_avatar} alt="" className="w-6 h-6 rounded-full" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-gray-600" />
                  )}
                  <span className="text-gray-300 text-sm">{p.user.discord_username}</span>
                  {p.role === 'LEADER' && (
                    <span className="text-xs text-gold-500">Leader</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Chat */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Chat</h2>
            <div className="h-64 overflow-y-auto mb-4 space-y-2">
              <p className="text-gray-500 text-sm text-center">Chat messages will appear here</p>
            </div>
            <div className="flex space-x-2">
              <input
                type="text"
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                placeholder="Type a message..."
                className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
              />
              <button
                onClick={handleSendChat}
                className="bg-gray-700 hover:bg-gray-600 text-white p-2 rounded-lg transition-colors"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Item Picker Modal */}
      <ItemPicker
        raidId={id!}
        raidInstance={raid.instance}
        isOpen={itemPickerOpen}
        onClose={() => setItemPickerOpen(false)}
        onItemAdded={() => {
          queryClient.invalidateQueries({ queryKey: ['raid', id] });
        }}
      />
    </div>
  );
}
