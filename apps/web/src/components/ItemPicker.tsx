import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import {
  TBC_RAID_INSTANCES,
  ITEM_SLOTS,
  ITEM_QUALITY_COLORS,
  getWowheadItemUrl,
  type TbcRaidItem,
} from '@gdkp/shared';
import {
  Search,
  X,
  Plus,
  Filter,
  ChevronDown,
  CheckCircle,
  Loader2,
} from 'lucide-react';

declare global {
  interface Window {
    $WowheadPower?: {
      refreshLinks: () => void;
    };
  }
}

interface ItemPickerProps {
  raidId: string;
  raidInstance?: string;
  isOpen: boolean;
  onClose: () => void;
  onItemAdded?: () => void;
}

export function ItemPicker({ raidId, raidInstance, isOpen, onClose, onItemAdded }: ItemPickerProps) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedInstance, setSelectedInstance] = useState(raidInstance || '');
  const [selectedSlot, setSelectedSlot] = useState('');
  const [selectedQuality, setSelectedQuality] = useState('');
  const [addedItems, setAddedItems] = useState<Set<number>>(new Set());

  // Reset filters when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedInstance(raidInstance || '');
      setAddedItems(new Set());
    }
  }, [isOpen, raidInstance]);

  // Fetch items from the TBC items database
  const { data: itemsData, isLoading } = useQuery({
    queryKey: ['tbc-items', selectedInstance, selectedSlot, selectedQuality, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedInstance) params.append('instance', selectedInstance);
      if (selectedSlot) params.append('slot', selectedSlot);
      if (selectedQuality) params.append('quality', selectedQuality);
      if (searchQuery) params.append('search', searchQuery);
      params.append('limit', '50');

      const res = await api.get(`/items?${params.toString()}`);
      return res.data;
    },
    enabled: isOpen,
  });

  // Refresh WoWhead tooltips when items change
  useEffect(() => {
    if (itemsData?.items?.length > 0) {
      setTimeout(() => {
        window.$WowheadPower?.refreshLinks();
      }, 100);
    }
  }, [itemsData]);

  // Add item to raid mutation
  const addItemMutation = useMutation({
    mutationFn: async (item: TbcRaidItem) => {
      const res = await api.post(`/raids/${raidId}/items`, {
        name: item.name,
        wowhead_id: item.wowhead_id,
        icon_url: `https://wow.zamimg.com/images/wow/icons/large/${item.icon}.jpg`,
        starting_bid: 0,
        min_increment: 10,
        auction_duration: 60,
      });
      return res.data;
    },
    onSuccess: (_, item) => {
      setAddedItems(prev => new Set(prev).add(item.wowhead_id));
      queryClient.invalidateQueries({ queryKey: ['raid', raidId] });
      onItemAdded?.();
    },
  });

  if (!isOpen) return null;

  const items = itemsData?.items || [];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black/70" onClick={onClose} />

        {/* Modal */}
        <div className="relative bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-700">
            <h2 className="text-xl font-bold text-white">Add Items to Raid</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Filters */}
          <div className="p-4 border-b border-gray-700 space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search items by name..."
                className="w-full bg-gray-700 border border-gray-600 rounded-lg pl-10 pr-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gold-500"
              />
            </div>

            {/* Filter dropdowns */}
            <div className="flex flex-wrap gap-3">
              {/* Raid Instance */}
              <div className="relative">
                <select
                  value={selectedInstance}
                  onChange={(e) => setSelectedInstance(e.target.value)}
                  className="appearance-none bg-gray-700 border border-gray-600 rounded-lg pl-3 pr-8 py-2 text-white focus:outline-none focus:ring-2 focus:ring-gold-500"
                >
                  <option value="">All Raids</option>
                  {TBC_RAID_INSTANCES.map((instance) => (
                    <option key={instance.id} value={instance.id}>
                      {instance.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              </div>

              {/* Slot */}
              <div className="relative">
                <select
                  value={selectedSlot}
                  onChange={(e) => setSelectedSlot(e.target.value)}
                  className="appearance-none bg-gray-700 border border-gray-600 rounded-lg pl-3 pr-8 py-2 text-white focus:outline-none focus:ring-2 focus:ring-gold-500"
                >
                  <option value="">All Slots</option>
                  {ITEM_SLOTS.map((slot) => (
                    <option key={slot} value={slot}>
                      {slot}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              </div>

              {/* Quality */}
              <div className="relative">
                <select
                  value={selectedQuality}
                  onChange={(e) => setSelectedQuality(e.target.value)}
                  className="appearance-none bg-gray-700 border border-gray-600 rounded-lg pl-3 pr-8 py-2 text-white focus:outline-none focus:ring-2 focus:ring-gold-500"
                >
                  <option value="">All Qualities</option>
                  <option value="5">Legendary</option>
                  <option value="4">Epic</option>
                  <option value="3">Rare</option>
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              </div>

              {addedItems.size > 0 && (
                <div className="flex items-center text-green-400 text-sm ml-auto">
                  <CheckCircle className="h-4 w-4 mr-1" />
                  {addedItems.size} item{addedItems.size !== 1 ? 's' : ''} added
                </div>
              )}
            </div>
          </div>

          {/* Items Grid */}
          <div className="flex-1 overflow-y-auto p-4">
            {isLoading ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="h-8 w-8 text-gold-500 animate-spin" />
              </div>
            ) : items.length === 0 ? (
              <div className="text-center text-gray-400 py-12">
                <Filter className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No items found matching your filters</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {items.map((item: TbcRaidItem) => {
                  const isAdded = addedItems.has(item.wowhead_id);
                  const qualityColor = ITEM_QUALITY_COLORS[item.quality as keyof typeof ITEM_QUALITY_COLORS] || '#ffffff';

                  return (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                        isAdded
                          ? 'bg-green-500/10 border-green-500/30'
                          : 'bg-gray-700 border-gray-600 hover:border-gray-500'
                      }`}
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        <img
                          src={`https://wow.zamimg.com/images/wow/icons/medium/${item.icon}.jpg`}
                          alt={item.name}
                          className="w-10 h-10 rounded border border-gray-600"
                        />
                        <div className="min-w-0">
                          <a
                            href={getWowheadItemUrl(item.wowhead_id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-wowhead={`item=${item.wowhead_id}&domain=tbc`}
                            className="font-medium hover:underline truncate block"
                            style={{ color: qualityColor }}
                          >
                            {item.name}
                          </a>
                          <p className="text-xs text-gray-400 truncate">
                            {item.boss_name || item.raid_instance}
                            {item.slot && ` • ${item.slot}`}
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => addItemMutation.mutate(item)}
                        disabled={isAdded || addItemMutation.isPending}
                        className={`flex-shrink-0 ml-2 p-2 rounded-lg transition-colors ${
                          isAdded
                            ? 'bg-green-500/20 text-green-400 cursor-default'
                            : 'bg-gold-600 hover:bg-gold-700 text-white'
                        }`}
                      >
                        {isAdded ? (
                          <CheckCircle className="h-5 w-5" />
                        ) : addItemMutation.isPending ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <Plus className="h-5 w-5" />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-gray-700 flex justify-end">
            <button
              onClick={onClose}
              className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-2 rounded-lg transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
