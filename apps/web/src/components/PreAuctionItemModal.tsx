import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { PreAuctionItemWithBids, PreAuctionBid } from '@gdkp/shared';
import { formatGold, ITEM_QUALITY_COLORS, getWowheadItemUrl, getDisplayName, QUICK_BID_INCREMENTS } from '@gdkp/shared';
import { X, Crown, Loader2, History, AlertTriangle } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';

// Quality to CSS class mapping
const qualityBorderClass: Record<number, string> = {
  1: 'wow-border-common',
  2: 'wow-border-uncommon',
  3: 'wow-border-rare',
  4: 'wow-border-epic',
  5: 'wow-border-legendary',
};

interface PreAuctionItemModalProps {
  raidId: string;
  itemId: string;
  isOpen: boolean;
  onClose: () => void;
  onPlaceBid: (itemId: string, amount: number) => void;
  remainingMs: number;
}

export function PreAuctionItemModal({
  raidId,
  itemId,
  isOpen,
  onClose,
  onPlaceBid,
  remainingMs,
}: PreAuctionItemModalProps) {
  const [bidAmount, setBidAmount] = useState('');
  const [bidError, setBidError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { user, lockedAmount } = useAuthStore();
  const balance = user?.gold_balance || 0;
  const availableBalance = balance - lockedAmount;

  // Fetch item with bid history
  const { data: item, isLoading, refetch } = useQuery({
    queryKey: ['pre-auction-item', raidId, itemId],
    queryFn: async () => {
      const res = await api.get(`/raids/${raidId}/pre-auction/${itemId}`);
      return res.data as PreAuctionItemWithBids;
    },
    enabled: isOpen && !!itemId,
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setBidAmount('');
      setBidError(null);
    }
  }, [isOpen, itemId]);

  // Listen for bid events to refresh
  useEffect(() => {
    const handleBidNew = (e: CustomEvent) => {
      if (e.detail.pre_auction_item_id === itemId) {
        refetch();
      }
    };

    const handleBidAccepted = () => {
      setIsSubmitting(false);
      setBidAmount('');
      setBidError(null);
      refetch();
    };

    const handleBidRejected = (e: CustomEvent) => {
      setIsSubmitting(false);
      const errorMessages: Record<string, string> = {
        'BID_INSUFFICIENT_BALANCE': 'Not enough gold! Deposit more to place bids.',
        'BID_TOO_LOW': `Bid too low! Minimum is ${e.detail.min_required}g`,
        'BID_ALREADY_WINNING': 'You are already the highest bidder!',
        'PRE_AUCTION_NOT_ACTIVE': 'This pre-auction is not active.',
        'PRE_AUCTION_ENDED': 'This pre-auction has ended.',
        'BID_INVALID_AMOUNT': 'Invalid bid amount.',
      };
      setBidError(errorMessages[e.detail.error] || `Bid failed: ${e.detail.error}`);
    };

    window.addEventListener('preauction:bid:new', handleBidNew as EventListener);
    window.addEventListener('preauction:bid:accepted', handleBidAccepted as EventListener);
    window.addEventListener('preauction:bid:rejected', handleBidRejected as EventListener);

    return () => {
      window.removeEventListener('preauction:bid:new', handleBidNew as EventListener);
      window.removeEventListener('preauction:bid:accepted', handleBidAccepted as EventListener);
      window.removeEventListener('preauction:bid:rejected', handleBidRejected as EventListener);
    };
  }, [itemId, refetch]);

  if (!isOpen) return null;

  const tbcItem = item?.tbc_item;
  const currentBid = item?.current_bid || 0;
  const minIncrement = item?.min_increment || 10;
  const minBid = currentBid > 0 ? currentBid + minIncrement : minIncrement;
  const quality = tbcItem?.quality || 4;
  const qualityColor = ITEM_QUALITY_COLORS[quality as keyof typeof ITEM_QUALITY_COLORS] || '#ffffff';
  const iconUrl = tbcItem ? `https://wow.zamimg.com/images/wow/icons/large/${tbcItem.icon}.jpg` : '';

  const isLeading = item?.winner_id === user?.id;
  const isEnded = item?.status !== 'ACTIVE' || remainingMs <= 0;

  const handlePlaceBid = () => {
    const amount = parseInt(bidAmount, 10);
    if (isNaN(amount) || amount < minBid) {
      setBidError(`Minimum bid is ${formatGold(minBid)}`);
      return;
    }
    if (amount > availableBalance) {
      setBidError('Insufficient balance');
      return;
    }
    setBidError(null);
    setIsSubmitting(true);
    onPlaceBid(itemId, amount);
  };

  const handleQuickBid = (increment: number) => {
    const amount = Math.max(minBid, currentBid + increment);
    if (amount > availableBalance) {
      setBidError('Insufficient balance');
      return;
    }
    setBidError(null);
    setIsSubmitting(true);
    onPlaceBid(itemId, amount);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black/70" onClick={onClose} />

        {/* Modal */}
        <div className="relative bg-gray-800 rounded-lg shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-700">
            <h2 className="text-xl font-bold text-white">Place Bid</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 text-amber-500 animate-spin" />
              </div>
            ) : item && tbcItem ? (
              <>
                {/* Item Display */}
                <div className="flex items-start gap-4">
                  <div className={`flex-shrink-0 ${qualityBorderClass[quality] || ''}`}>
                    <a
                      href={getWowheadItemUrl(tbcItem.wowhead_id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-wowhead={`item=${tbcItem.wowhead_id}&domain=tbc`}
                    >
                      <img
                        src={iconUrl}
                        alt={tbcItem.name}
                        className="w-16 h-16 rounded"
                      />
                    </a>
                  </div>
                  <div className="flex-1">
                    <a
                      href={getWowheadItemUrl(tbcItem.wowhead_id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-wowhead={`item=${tbcItem.wowhead_id}&domain=tbc`}
                      className="font-semibold text-lg hover:underline"
                      style={{ color: qualityColor }}
                    >
                      {tbcItem.name}
                    </a>
                    <p className="text-sm text-gray-400">
                      {tbcItem.boss_name || tbcItem.raid_instance}
                      {tbcItem.slot && ` • ${tbcItem.slot}`}
                    </p>
                    {tbcItem.item_level && (
                      <p className="text-sm text-gray-500">
                        Item Level {tbcItem.item_level}
                      </p>
                    )}
                  </div>
                </div>

                {/* Current Bid */}
                <div className="bg-gray-900 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-400">Current Bid</span>
                    <span className="text-2xl font-bold text-amber-400">
                      {currentBid > 0 ? formatGold(currentBid) : 'No bids'}
                    </span>
                  </div>
                  {item.winner && (
                    <div className="flex items-center gap-2 text-sm">
                      <Crown className="h-4 w-4 text-amber-400" />
                      <span className={isLeading ? 'text-green-400' : 'text-gray-400'}>
                        {isLeading ? 'You are leading!' : `Leading: ${getDisplayName(item.winner)}`}
                      </span>
                    </div>
                  )}
                </div>

                {/* Bid Input */}
                {!isEnded ? (
                  <div className="space-y-3">
                    {/* Quick Bid Buttons */}
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">
                        Quick Bid
                      </label>
                      <div className="grid grid-cols-4 gap-2">
                        {QUICK_BID_INCREMENTS.map((inc) => (
                          <button
                            key={inc}
                            onClick={() => handleQuickBid(inc)}
                            disabled={isSubmitting || isLeading}
                            className="py-2 px-3 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-colors"
                          >
                            +{formatGold(inc)}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Manual Bid Input */}
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">
                        Custom Bid (min: {formatGold(minBid)})
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          value={bidAmount}
                          onChange={(e) => setBidAmount(e.target.value)}
                          placeholder={minBid.toString()}
                          min={minBid}
                          disabled={isSubmitting || isLeading}
                          className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50"
                        />
                        <button
                          onClick={handlePlaceBid}
                          disabled={isSubmitting || isLeading || !bidAmount}
                          className="px-6 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-gray-700 disabled:text-gray-500 text-black font-semibold rounded-lg transition-colors flex items-center gap-2"
                        >
                          {isSubmitting ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          ) : (
                            'Bid'
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Error Message */}
                    {bidError && (
                      <div className="flex items-center gap-2 text-red-400 text-sm">
                        <AlertTriangle className="h-4 w-4" />
                        {bidError}
                      </div>
                    )}

                    {/* Balance Info */}
                    <div className="text-sm text-gray-500">
                      Available: {formatGold(availableBalance)}
                      {lockedAmount > 0 && ` (${formatGold(lockedAmount)} locked)`}
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-900 rounded-lg p-4 text-center text-gray-400">
                    {item.status === 'CLAIMED' ? (
                      <p>This item has been claimed by the winner.</p>
                    ) : item.status === 'ENDED' ? (
                      <p>Pre-auction has ended. Waiting for item to drop.</p>
                    ) : (
                      <p>Pre-auction has ended.</p>
                    )}
                  </div>
                )}

                {/* Bid History */}
                {item.bids && item.bids.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <History className="h-4 w-4 text-gray-400" />
                      <span className="text-sm text-gray-400">Bid History</span>
                    </div>
                    <div className="bg-gray-900 rounded-lg max-h-48 overflow-y-auto">
                      {item.bids.map((bid: PreAuctionBid) => (
                        <div
                          key={bid.id}
                          className={`flex items-center justify-between px-3 py-2 border-b border-gray-800 last:border-0 ${
                            bid.is_winning ? 'bg-amber-500/10' : ''
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {bid.is_winning && (
                              <Crown className="h-4 w-4 text-amber-400" />
                            )}
                            <span className={bid.is_winning ? 'text-white' : 'text-gray-400'}>
                              {bid.user ? getDisplayName(bid.user) : 'Unknown'}
                            </span>
                          </div>
                          <span className={bid.is_winning ? 'text-amber-400 font-medium' : 'text-gray-500'}>
                            {formatGold(bid.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center text-gray-400 py-12">
                Failed to load item details
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-gray-700 flex justify-end">
            <button
              onClick={onClose}
              className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-2 rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
