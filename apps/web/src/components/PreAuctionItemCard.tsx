import { useMemo } from 'react';
import type { PreAuctionItem } from '@gdkp/shared';
import { formatGold, ITEM_QUALITY_COLORS, getWowheadItemUrl, getDisplayName } from '@gdkp/shared';
import { Flame, Clock, Crown, AlertCircle } from 'lucide-react';

// Quality to CSS class mapping
const qualityBorderClass: Record<number, string> = {
  1: 'wow-border-common',
  2: 'wow-border-uncommon',
  3: 'wow-border-rare',
  4: 'wow-border-epic',
  5: 'wow-border-legendary',
};

interface PreAuctionItemCardProps {
  item: PreAuctionItem;
  currentUserId: string;
  onClick: () => void;
  remainingMs: number;
}

export function PreAuctionItemCard({
  item,
  currentUserId,
  onClick,
  remainingMs,
}: PreAuctionItemCardProps) {
  const tbcItem = item.tbc_item;
  if (!tbcItem) return null;

  const quality = tbcItem.quality;
  const qualityColor = ITEM_QUALITY_COLORS[quality as keyof typeof ITEM_QUALITY_COLORS] || '#ffffff';
  const iconUrl = `https://wow.zamimg.com/images/wow/icons/large/${tbcItem.icon}.jpg`;

  // Determine badges
  const isLeading = item.winner_id === currentUserId;
  const isOutbid = !isLeading && item.winner_id !== null;
  const hasNoBids = item.current_bid === 0;
  const isHot = !hasNoBids && item.current_bid >= 500; // Consider "hot" if bid is >= 500g
  const isEndingSoon = remainingMs > 0 && remainingMs <= 30 * 60 * 1000; // Last 30 minutes
  const isEnded = item.status !== 'ACTIVE';

  // Badge styles
  const badges = useMemo(() => {
    const result: Array<{ icon: React.ReactNode; label: string; className: string }> = [];

    if (isEnded) {
      result.push({
        icon: <Clock className="h-3 w-3" />,
        label: 'Ended',
        className: 'bg-gray-600 text-gray-200',
      });
    } else {
      if (isLeading) {
        result.push({
          icon: <Crown className="h-3 w-3" />,
          label: 'Leading',
          className: 'bg-green-500 text-black',
        });
      } else if (isOutbid) {
        result.push({
          icon: <AlertCircle className="h-3 w-3" />,
          label: 'Outbid',
          className: 'bg-red-500 text-white',
        });
      }

      if (isHot) {
        result.push({
          icon: <Flame className="h-3 w-3" />,
          label: 'Hot!',
          className: 'bg-orange-500 text-white',
        });
      }

      if (isEndingSoon) {
        result.push({
          icon: <Clock className="h-3 w-3" />,
          label: 'Ending Soon',
          className: 'bg-yellow-500 text-black',
        });
      }
    }

    return result;
  }, [isEnded, isLeading, isOutbid, isHot, isEndingSoon]);

  const winnerDisplay = item.winner
    ? getDisplayName(item.winner)
    : null;

  return (
    <div
      onClick={onClick}
      className={`bg-gray-800 rounded-lg border transition-all cursor-pointer hover:border-amber-500/50 hover:shadow-lg hover:shadow-amber-500/10 ${
        isLeading ? 'border-green-500/50' : isOutbid ? 'border-red-500/50' : 'border-gray-700'
      } ${isEnded ? 'opacity-75' : ''}`}
    >
      {/* Item Header */}
      <div className="p-3">
        <div className="flex items-start gap-3">
          {/* Item Icon */}
          <div className={`flex-shrink-0 relative ${qualityBorderClass[quality] || ''}`}>
            <a
              href={getWowheadItemUrl(tbcItem.wowhead_id)}
              target="_blank"
              rel="noopener noreferrer"
              data-wowhead={`item=${tbcItem.wowhead_id}&domain=tbc`}
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={iconUrl}
                alt={tbcItem.name}
                className="w-12 h-12 rounded"
              />
            </a>
          </div>

          {/* Item Info */}
          <div className="flex-1 min-w-0">
            <a
              href={getWowheadItemUrl(tbcItem.wowhead_id)}
              target="_blank"
              rel="noopener noreferrer"
              data-wowhead={`item=${tbcItem.wowhead_id}&domain=tbc`}
              onClick={(e) => e.stopPropagation()}
              className="font-medium text-sm hover:underline truncate block"
              style={{ color: qualityColor }}
            >
              {tbcItem.name}
            </a>
            <p className="text-xs text-gray-400 truncate">
              {tbcItem.boss_name || tbcItem.raid_instance}
              {tbcItem.slot && ` • ${tbcItem.slot}`}
            </p>

            {/* Badges */}
            {badges.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {badges.map((badge, i) => (
                  <span
                    key={i}
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${badge.className}`}
                  >
                    {badge.icon}
                    {badge.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bid Info */}
      <div className="px-3 pb-3 pt-0">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">
            {hasNoBids ? 'No bids' : 'Current:'}
          </span>
          {!hasNoBids && (
            <span className="text-amber-400 font-semibold">
              {formatGold(item.current_bid)}
            </span>
          )}
        </div>
        {winnerDisplay && (
          <div className="text-xs text-gray-500 truncate mt-0.5">
            by {winnerDisplay}
          </div>
        )}
      </div>
    </div>
  );
}
