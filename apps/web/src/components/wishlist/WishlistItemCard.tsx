import type { TbcRaidItem } from '@gdkp/shared';
import { ITEM_QUALITY_COLORS, getWowheadItemUrl } from '@gdkp/shared';
import { Check, Plus } from 'lucide-react';

// Quality to CSS class mapping
const qualityBorderClass: Record<number, string> = {
  1: 'wow-border-common',
  2: 'wow-border-uncommon',
  3: 'wow-border-rare',
  4: 'wow-border-epic',
  5: 'wow-border-legendary',
};

interface WishlistItemCardProps {
  item: TbcRaidItem;
  isSelected: boolean;
  onToggle: () => void;
}

export function WishlistItemCard({ item, isSelected, onToggle }: WishlistItemCardProps) {
  const quality = item.quality;
  const qualityColor = ITEM_QUALITY_COLORS[quality as keyof typeof ITEM_QUALITY_COLORS] || '#ffffff';
  const iconUrl = `https://wow.zamimg.com/images/wow/icons/large/${item.icon}.jpg`;

  return (
    <div
      className={`bg-gray-800 rounded-lg border transition-all ${
        isSelected
          ? 'border-green-500/70 ring-1 ring-green-500/30'
          : 'border-gray-700 hover:border-gray-600'
      }`}
    >
      {/* Item Header */}
      <div className="p-3">
        <div className="flex items-start gap-3">
          {/* Item Icon */}
          <div className={`flex-shrink-0 relative ${qualityBorderClass[quality] || ''}`}>
            <a
              href={getWowheadItemUrl(item.wowhead_id)}
              target="_blank"
              rel="noopener noreferrer"
              data-wowhead={`item=${item.wowhead_id}&domain=tbc`}
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={iconUrl}
                alt={item.name}
                className="w-10 h-10 rounded"
              />
            </a>
          </div>

          {/* Item Info */}
          <div className="flex-1 min-w-0">
            <a
              href={getWowheadItemUrl(item.wowhead_id)}
              target="_blank"
              rel="noopener noreferrer"
              data-wowhead={`item=${item.wowhead_id}&domain=tbc`}
              onClick={(e) => e.stopPropagation()}
              className="font-medium text-sm hover:underline truncate block"
              style={{ color: qualityColor }}
            >
              {item.name}
            </a>
            <p className="text-xs text-gray-400 truncate">
              {item.boss_name || item.raid_instance}
              {item.slot && ` • ${item.slot}`}
            </p>
          </div>

          {/* Toggle Button */}
          <button
            onClick={onToggle}
            className={`flex-shrink-0 p-2 rounded-lg transition-colors ${
              isSelected
                ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                : 'bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-white'
            }`}
            title={isSelected ? 'Remove from wishlist' : 'Add to wishlist'}
          >
            {isSelected ? (
              <Check className="h-5 w-5" />
            ) : (
              <Plus className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
