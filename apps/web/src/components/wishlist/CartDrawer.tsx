import { useMemo } from 'react';
import { X, Trash2, Share2, ShoppingCart, ExternalLink } from 'lucide-react';
import type { TbcRaidItem } from '@gdkp/shared';
import { ITEM_QUALITY_COLORS, getWowheadItemUrl, TBC_RAID_INSTANCES } from '@gdkp/shared';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: TbcRaidItem[];
  onRemoveItem: (wowheadId: number) => void;
  onClear: () => void;
  onShare: () => void;
}

export function CartDrawer({
  isOpen,
  onClose,
  items,
  onRemoveItem,
  onClear,
  onShare,
}: CartDrawerProps) {
  // Group items by raid instance
  const groupedItems = useMemo(() => {
    const groups: Record<string, TbcRaidItem[]> = {};
    for (const item of items) {
      const raid = item.raid_instance || 'Unknown';
      if (!groups[raid]) {
        groups[raid] = [];
      }
      groups[raid].push(item);
    }

    // Sort by TBC raid order
    const raidOrder = TBC_RAID_INSTANCES.map((r) => r.name);
    return Object.entries(groups).sort(([a], [b]) => {
      const aIndex = raidOrder.indexOf(a);
      const bIndex = raidOrder.indexOf(b);
      if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
  }, [items]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/60 z-50 transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={`fixed right-0 top-0 h-full w-full max-w-md bg-gray-900 border-l border-gray-700 z-50 transform transition-transform duration-300 ease-out flex flex-col ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-800">
          <div className="flex items-center gap-3">
            <ShoppingCart className="h-5 w-5 text-amber-400" />
            <h2 className="text-lg font-semibold text-white">Your Wishlist</h2>
            <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-sm rounded-full">
              {items.length}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
              <ShoppingCart className="h-16 w-16 text-gray-600 mb-4" />
              <p className="text-gray-400 text-lg mb-2">Your wishlist is empty</p>
              <p className="text-gray-500 text-sm mb-4">
                Browse items and click the + button to add them here
              </p>
              <p className="text-gray-600 text-xs">
                Once you've selected items, share your list with your booster!
              </p>
            </div>
          ) : (
            <div className="p-4 space-y-6">
              {groupedItems.map(([raid, raidItems]) => (
                <div key={raid}>
                  <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <span>{raid}</span>
                    <span className="text-xs text-gray-500">({raidItems.length})</span>
                  </h3>
                  <div className="space-y-2">
                    {raidItems.map((item) => (
                      <CartItem
                        key={item.id}
                        item={item}
                        onRemove={() => onRemoveItem(item.wowhead_id)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="p-4 border-t border-gray-700 bg-gray-800 space-y-3">
            {/* Info text */}
            <p className="text-xs text-gray-500 text-center">
              Share this list with your booster so they know what you want!
            </p>

            {/* Summary */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Total items</span>
              <span className="text-white font-medium">{items.length}</span>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={onClear}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-red-600/20 text-red-400 text-sm font-medium hover:bg-red-600/30 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <button
                onClick={onShare}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-500 transition-colors"
              >
                <Share2 className="h-4 w-4" />
                Share with Booster
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// Individual cart item component
function CartItem({ item, onRemove }: { item: TbcRaidItem; onRemove: () => void }) {
  const quality = item.quality;
  const qualityColor = ITEM_QUALITY_COLORS[quality as keyof typeof ITEM_QUALITY_COLORS] || '#ffffff';
  const iconUrl = `https://wow.zamimg.com/images/wow/icons/medium/${item.icon}.jpg`;

  return (
    <div className="flex items-center gap-3 p-2 bg-gray-800/50 rounded-lg group hover:bg-gray-800 transition-colors">
      {/* Icon */}
      <a
        href={getWowheadItemUrl(item.wowhead_id)}
        target="_blank"
        rel="noopener noreferrer"
        data-wowhead={`item=${item.wowhead_id}&domain=tbc`}
        className="flex-shrink-0"
      >
        <img
          src={iconUrl}
          alt={item.name}
          className="w-10 h-10 rounded border border-gray-600"
        />
      </a>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <a
          href={getWowheadItemUrl(item.wowhead_id)}
          target="_blank"
          rel="noopener noreferrer"
          data-wowhead={`item=${item.wowhead_id}&domain=tbc`}
          className="text-sm font-medium hover:underline block truncate"
          style={{ color: qualityColor }}
        >
          {item.name}
        </a>
        <p className="text-xs text-gray-500 truncate">
          {item.boss_name && (item.boss_name as string) !== 'Unknown'
            ? item.boss_name
            : item.slot && (item.slot as string) !== 'Unknown'
            ? item.slot
            : ''}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <a
          href={getWowheadItemUrl(item.wowhead_id)}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
          title="View on WoWhead"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
        <button
          onClick={onRemove}
          className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-500/20 rounded transition-colors"
          title="Remove from wishlist"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
