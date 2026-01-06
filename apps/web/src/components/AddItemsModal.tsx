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
  Upload,
  Database,
} from 'lucide-react';

declare global {
  interface Window {
    $WowheadPower?: {
      refreshLinks: () => void;
    };
  }
}

interface AddItemsModalProps {
  raidId: string;
  raidInstance?: string;
  isOpen: boolean;
  onClose: () => void;
  onItemAdded?: () => void;
}

type Tab = 'import' | 'manual';
type ImportFormat = 'gargul' | 'rclootcouncil';

export function AddItemsModal({ raidId, raidInstance, isOpen, onClose, onItemAdded }: AddItemsModalProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('import');

  // Import tab state
  const [importFormat, setImportFormat] = useState<ImportFormat>('gargul');
  const [exportString, setExportString] = useState('');
  const [importResult, setImportResult] = useState<{
    success: boolean;
    imported_count: number;
    message?: string;
  } | null>(null);

  // Manual tab state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedInstance, setSelectedInstance] = useState(raidInstance || '');
  const [selectedSlot, setSelectedSlot] = useState('');
  const [selectedQuality, setSelectedQuality] = useState('');
  const [addedItems, setAddedItems] = useState<Set<number>>(new Set());

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedInstance(raidInstance || '');
      setAddedItems(new Set());
      setExportString('');
      setImportResult(null);
    }
  }, [isOpen, raidInstance]);

  // Fetch items for manual tab
  const { data: itemsData, isLoading } = useQuery({
    queryKey: ['tbc-items', selectedInstance, selectedSlot, selectedQuality, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedInstance) params.append('raid_instance', selectedInstance);
      if (selectedSlot) params.append('slot', selectedSlot);
      if (selectedQuality) params.append('quality', selectedQuality);
      if (searchQuery) params.append('search', searchQuery);
      params.append('limit', '50');

      const res = await api.get(`/items?${params.toString()}`);
      return res.data;
    },
    enabled: isOpen && activeTab === 'manual',
  });

  // Refresh WoWhead tooltips when items change
  useEffect(() => {
    if (itemsData?.items?.length > 0) {
      setTimeout(() => {
        window.$WowheadPower?.refreshLinks();
      }, 100);
    }
  }, [itemsData]);

  // Import mutation
  const importMutation = useMutation({
    mutationFn: async () => {
      const endpoint = importFormat === 'gargul' ? '/items/import/gargul' : '/items/import/rclootcouncil';
      const payload = importFormat === 'gargul'
        ? { data: exportString, raid_id: raidId }
        : { csv: exportString, raid_id: raidId };

      const res = await api.post(endpoint, payload);
      return res.data;
    },
    onSuccess: (data) => {
      setImportResult({
        success: data.success !== false,
        imported_count: data.imported_count || 0,
        message: data.errors?.[0] || (data.imported_count > 0
          ? `Successfully imported ${data.imported_count} items!`
          : 'No items were imported'),
      });
      if (data.imported_count > 0) {
        queryClient.invalidateQueries({ queryKey: ['raid', raidId] });
        onItemAdded?.();
      }
    },
    onError: (error: Error) => {
      setImportResult({
        success: false,
        imported_count: 0,
        message: error.message || 'Import failed',
      });
    },
  });

  // Add item mutation for manual tab
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
            <h2 className="text-xl font-bold text-white">Add Items</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-700">
            <button
              onClick={() => setActiveTab('import')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 font-medium transition-colors ${
                activeTab === 'import'
                  ? 'modal-tab-active'
                  : 'modal-tab-inactive'
              }`}
            >
              <Upload className="h-4 w-4" />
              Import from Addon
            </button>
            <button
              onClick={() => setActiveTab('manual')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 font-medium transition-colors ${
                activeTab === 'manual'
                  ? 'modal-tab-active'
                  : 'modal-tab-inactive'
              }`}
            >
              <Database className="h-4 w-4" />
              Manual Add
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'import' ? (
              <ImportTab
                importFormat={importFormat}
                setImportFormat={setImportFormat}
                exportString={exportString}
                setExportString={setExportString}
                importResult={importResult}
                isImporting={importMutation.isPending}
                onImport={() => importMutation.mutate()}
              />
            ) : (
              <ManualTab
                items={items}
                isLoading={isLoading}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                selectedInstance={selectedInstance}
                setSelectedInstance={setSelectedInstance}
                selectedSlot={selectedSlot}
                setSelectedSlot={setSelectedSlot}
                selectedQuality={selectedQuality}
                setSelectedQuality={setSelectedQuality}
                addedItems={addedItems}
                onAddItem={(item) => addItemMutation.mutate(item)}
                isAdding={addItemMutation.isPending}
              />
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

// Import Tab Component
interface ImportTabProps {
  importFormat: ImportFormat;
  setImportFormat: (format: ImportFormat) => void;
  exportString: string;
  setExportString: (s: string) => void;
  importResult: { success: boolean; imported_count: number; message?: string } | null;
  isImporting: boolean;
  onImport: () => void;
}

function ImportTab({
  importFormat,
  setImportFormat,
  exportString,
  setExportString,
  importResult,
  isImporting,
  onImport,
}: ImportTabProps) {
  return (
    <div className="p-6 space-y-6">
      {/* Format Selection */}
      <div>
        <label className="block text-sm text-gray-400 mb-2">Import Format</label>
        <div className="flex gap-2">
          <button
            onClick={() => setImportFormat('gargul')}
            className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
              importFormat === 'gargul'
                ? 'bg-amber-500 text-black'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Gargul
          </button>
          <button
            onClick={() => setImportFormat('rclootcouncil')}
            className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
              importFormat === 'rclootcouncil'
                ? 'bg-amber-500 text-black'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            RCLootCouncil
          </button>
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-gray-900/50 rounded-lg p-4">
        <h3 className="font-semibold text-white mb-3">
          How to export from {importFormat === 'gargul' ? 'Gargul' : 'RCLootCouncil'}:
        </h3>
        {importFormat === 'gargul' ? (
          <ol className="list-decimal list-inside space-y-1 text-gray-300 text-sm">
            <li>Type <code className="bg-gray-800 px-1 rounded">/gdkp</code> in game</li>
            <li>Go to Export → Share</li>
            <li>Copy the entire export string</li>
            <li>Paste it below</li>
          </ol>
        ) : (
          <ol className="list-decimal list-inside space-y-1 text-gray-300 text-sm">
            <li>Open RCLootCouncil in game</li>
            <li>Go to History → Export</li>
            <li>Select CSV format and copy</li>
            <li>Paste it below</li>
          </ol>
        )}
      </div>

      {/* Export String Input */}
      <div>
        <label className="block text-sm text-gray-400 mb-2">
          {importFormat === 'gargul' ? 'Gargul Export String' : 'RCLootCouncil CSV'}
        </label>
        <textarea
          value={exportString}
          onChange={(e) => setExportString(e.target.value)}
          placeholder={importFormat === 'gargul'
            ? 'Paste Gargul export string here...'
            : 'Paste RCLootCouncil CSV here...'}
          className="w-full h-40 bg-gray-900 border border-gray-700 rounded-lg p-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none font-mono text-sm"
        />
      </div>

      {/* Import Result */}
      {importResult && (
        <div className={`p-4 rounded-lg ${
          importResult.success ? 'bg-green-500/20 border border-green-500/30' : 'bg-red-500/20 border border-red-500/30'
        }`}>
          <p className={importResult.success ? 'text-green-400' : 'text-red-400'}>
            {importResult.message}
          </p>
        </div>
      )}

      {/* Import Button */}
      <button
        onClick={onImport}
        disabled={!exportString.trim() || isImporting}
        className="w-full py-3 bg-amber-500 hover:bg-amber-600 disabled:bg-gray-700 disabled:text-gray-500 text-black font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
      >
        {isImporting ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Upload className="h-5 w-5" />
        )}
        Import Loot History
      </button>
    </div>
  );
}

// Manual Tab Component
interface ManualTabProps {
  items: TbcRaidItem[];
  isLoading: boolean;
  searchQuery: string;
  setSearchQuery: (s: string) => void;
  selectedInstance: string;
  setSelectedInstance: (s: string) => void;
  selectedSlot: string;
  setSelectedSlot: (s: string) => void;
  selectedQuality: string;
  setSelectedQuality: (s: string) => void;
  addedItems: Set<number>;
  onAddItem: (item: TbcRaidItem) => void;
  isAdding: boolean;
}

function ManualTab({
  items,
  isLoading,
  searchQuery,
  setSearchQuery,
  selectedInstance,
  setSelectedInstance,
  selectedSlot,
  setSelectedSlot,
  selectedQuality,
  setSelectedQuality,
  addedItems,
  onAddItem,
  isAdding,
}: ManualTabProps) {
  return (
    <div className="flex flex-col h-full">
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
            className="w-full bg-gray-700 border border-gray-600 rounded-lg pl-10 pr-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>

        {/* Filter dropdowns */}
        <div className="flex flex-wrap gap-3">
          {/* Raid Instance */}
          <div className="relative">
            <select
              value={selectedInstance}
              onChange={(e) => setSelectedInstance(e.target.value)}
              className="appearance-none bg-gray-700 border border-gray-600 rounded-lg pl-3 pr-8 py-2 text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="">All Raids</option>
              {TBC_RAID_INSTANCES.map((instance) => (
                <option key={instance.id} value={instance.name}>
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
              className="appearance-none bg-gray-700 border border-gray-600 rounded-lg pl-3 pr-8 py-2 text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
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
              className="appearance-none bg-gray-700 border border-gray-600 rounded-lg pl-3 pr-8 py-2 text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
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
            <Loader2 className="h-8 w-8 text-amber-500 animate-spin" />
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
                    onClick={() => onAddItem(item)}
                    disabled={isAdded || isAdding}
                    className={`flex-shrink-0 ml-2 p-2 rounded-lg transition-colors ${
                      isAdded
                        ? 'bg-green-500/20 text-green-400 cursor-default'
                        : 'bg-amber-500 hover:bg-amber-600 text-black'
                    }`}
                  >
                    {isAdded ? (
                      <CheckCircle className="h-5 w-5" />
                    ) : isAdding ? (
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
    </div>
  );
}

// Re-export for backwards compatibility
export { AddItemsModal as ItemPicker };
