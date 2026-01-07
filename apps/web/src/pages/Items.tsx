import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useAuthStore } from '../stores/authStore';
import {
  TBC_RAID_INSTANCES,
  ITEM_SLOTS,
  ITEM_QUALITY_COLORS,
  ITEM_QUALITY_NAMES,
  getWowheadItemUrl,
  getItemQualityClass,
  type TbcRaidItem,
  type ItemQuality,
} from '@gdkp/shared';
import {
  Search,
  Filter,
  Upload,
  ChevronDown,
  Package,
  X,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Trash2,
  Plus,
  Pencil,
} from 'lucide-react';

export function Items() {
  const [selectedInstance, setSelectedInstance] = useState<string>('');
  const [selectedSlot, setSelectedSlot] = useState<string>('');
  const [selectedQuality, setSelectedQuality] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<TbcRaidItem | null>(null);
  const [page, setPage] = useState(1);

  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN';

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [selectedInstance, selectedSlot, selectedQuality]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['items', selectedInstance, selectedSlot, selectedQuality, debouncedSearch, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedInstance) params.set('raid_instance', selectedInstance);
      if (selectedSlot) params.set('slot', selectedSlot);
      if (selectedQuality) params.set('quality', selectedQuality);
      if (debouncedSearch) params.set('search', debouncedSearch);
      params.set('page', page.toString());
      params.set('limit', '50');

      const res = await api.get(`/items?${params}`);
      return res.data;
    },
  });

  // Clear all items mutation (admin only)
  const clearMutation = useMutation({
    mutationFn: async () => {
      const res = await api.delete('/admin/tbc-items');
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      setShowClearConfirm(false);
    },
  });

  // Refresh WoWhead tooltips when items change
  useEffect(() => {
    if (data?.items && window.$WowheadPower) {
      window.$WowheadPower.refreshLinks();
    }
  }, [data?.items]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center space-x-3">
          <Package className="h-8 w-8 text-gold-500 hidden sm:block" />
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white">TBC Raid Items</h1>
            <p className="text-gray-400 text-sm hidden sm:block">Browse loot with WoWhead tooltips</p>
          </div>
        </div>
        {isAdmin && (
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowClearConfirm(true)}
              className="flex items-center space-x-2 bg-red-600 hover:bg-red-700 text-white font-medium px-3 py-2 rounded-lg transition-colors"
              title="Clear All"
            >
              <Trash2 className="h-5 w-5" />
              <span className="hidden sm:inline">Clear</span>
            </button>
            <button
              onClick={() => setShowAddItemModal(true)}
              className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 text-white font-medium px-3 py-2 rounded-lg transition-colors"
              title="Add Item"
            >
              <Plus className="h-5 w-5" />
              <span className="hidden sm:inline">Add</span>
            </button>
            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center space-x-2 bg-gold-600 hover:bg-gold-700 text-white font-medium px-3 py-2 rounded-lg transition-colors"
              title="Import Loot"
            >
              <Upload className="h-5 w-5" />
              <span className="hidden sm:inline">Import</span>
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-gray-800 rounded-lg p-3 sm:p-4">
        <div className="flex items-center space-x-2 mb-3">
          <Filter className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400" />
          <span className="text-gray-400 font-medium text-sm sm:text-base">Filters</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
          {/* Search */}
          <div className="relative col-span-2 md:col-span-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="w-full bg-gray-700 border border-gray-600 rounded-lg pl-9 sm:pl-10 pr-3 py-2 text-sm sm:text-base text-white focus:outline-none focus:ring-2 focus:ring-gold-500"
            />
          </div>

          {/* Instance filter */}
          <div className="relative">
            <select
              value={selectedInstance}
              onChange={(e) => setSelectedInstance(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 sm:px-4 py-2 text-sm sm:text-base text-white focus:outline-none focus:ring-2 focus:ring-gold-500 appearance-none"
            >
              <option value="">All Raids</option>
              {TBC_RAID_INSTANCES.map((inst) => (
                <option key={inst.id} value={inst.name}>
                  {inst.name}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 sm:right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-gray-400 pointer-events-none" />
          </div>

          {/* Slot filter */}
          <div className="relative">
            <select
              value={selectedSlot}
              onChange={(e) => setSelectedSlot(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 sm:px-4 py-2 text-sm sm:text-base text-white focus:outline-none focus:ring-2 focus:ring-gold-500 appearance-none"
            >
              <option value="">All Slots</option>
              {ITEM_SLOTS.map((slot) => (
                <option key={slot} value={slot}>
                  {slot}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 sm:right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-gray-400 pointer-events-none" />
          </div>

          {/* Quality filter */}
          <div className="relative">
            <select
              value={selectedQuality}
              onChange={(e) => setSelectedQuality(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 sm:px-4 py-2 text-sm sm:text-base text-white focus:outline-none focus:ring-2 focus:ring-gold-500 appearance-none"
            >
              <option value="">Quality</option>
              <option value="3">Rare</option>
              <option value="4">Epic</option>
              <option value="5">Legendary</option>
            </select>
            <ChevronDown className="absolute right-2 sm:right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {/* Active filters */}
        {(selectedInstance || selectedSlot || selectedQuality || debouncedSearch) && (
          <div className="flex items-center flex-wrap gap-2 mt-4">
            <span className="text-gray-500 text-sm">Active:</span>
            {selectedInstance && (
              <FilterTag label={selectedInstance} onRemove={() => setSelectedInstance('')} />
            )}
            {selectedSlot && (
              <FilterTag label={selectedSlot} onRemove={() => setSelectedSlot('')} />
            )}
            {selectedQuality && (
              <FilterTag
                label={ITEM_QUALITY_NAMES[parseInt(selectedQuality) as ItemQuality]}
                onRemove={() => setSelectedQuality('')}
              />
            )}
            {debouncedSearch && (
              <FilterTag label={`"${debouncedSearch}"`} onRemove={() => setSearchQuery('')} />
            )}
            <button
              onClick={() => {
                setSelectedInstance('');
                setSelectedSlot('');
                setSelectedQuality('');
                setSearchQuery('');
              }}
              className="text-gray-500 hover:text-white text-sm"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Results count */}
      {data && (
        <div className="flex items-center justify-between">
          <p className="text-gray-400">
            Showing {data.items.length} of {data.total} items
          </p>
          <button
            onClick={() => refetch()}
            className="text-gray-400 hover:text-white flex items-center space-x-1"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Refresh</span>
          </button>
        </div>
      )}

      {/* Item list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-8 w-8 text-gold-500 animate-spin" />
        </div>
      ) : data?.items?.length > 0 ? (
        <>
          <div className="bg-gray-800 rounded-lg overflow-x-auto">
            <table className="w-full min-w-[300px]">
              <thead>
                <tr className="bg-gray-900 border-b border-gray-700">
                  <th className="text-left px-3 sm:px-4 py-2 sm:py-3 text-gray-400 font-medium text-xs sm:text-sm">Name</th>
                  <th className="text-left px-3 sm:px-4 py-2 sm:py-3 text-gray-400 font-medium text-xs sm:text-sm hidden sm:table-cell">Slot</th>
                  <th className="text-left px-3 sm:px-4 py-2 sm:py-3 text-gray-400 font-medium text-xs sm:text-sm hidden md:table-cell">Source</th>
                  <th className="text-left px-3 sm:px-4 py-2 sm:py-3 text-gray-400 font-medium text-xs sm:text-sm hidden lg:table-cell">Instance</th>
                  <th className="w-8 sm:w-10 px-1 sm:px-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {data.items.map((item: TbcRaidItem & { drop_count?: number }) => (
                  <ItemRow key={item.id} item={item} onEdit={() => setEditingItem(item)} />
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data.total_pages > 1 && (
            <div className="flex items-center justify-center space-x-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 bg-gray-800 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-700"
              >
                Previous
              </button>
              <span className="text-gray-400">
                Page {page} of {data.total_pages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(data.total_pages, p + 1))}
                disabled={page === data.total_pages}
                className="px-4 py-2 bg-gray-800 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-700"
              >
                Next
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-12 bg-gray-800 rounded-lg">
          <Package className="h-12 w-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">No items found</p>
          <p className="text-gray-500 text-sm mt-1">Try adjusting your filters</p>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && <ImportModal onClose={() => setShowImportModal(false)} />}

      {/* Add Item Modal */}
      {showAddItemModal && (
        <AddItemModal
          onClose={() => setShowAddItemModal(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['items'] });
          }}
        />
      )}

      {/* Edit Item Modal */}
      {editingItem && (
        <EditItemModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['items'] });
            setEditingItem(null);
          }}
        />
      )}

      {/* Clear Confirmation Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg max-w-md w-full p-6">
            <div className="flex items-center space-x-3 mb-4">
              <div className="p-3 bg-red-500/20 rounded-full">
                <Trash2 className="h-6 w-6 text-red-500" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Clear All Items</h2>
                <p className="text-gray-400 text-sm">This action cannot be undone</p>
              </div>
            </div>

            <p className="text-gray-300 mb-6">
              Are you sure you want to delete all <strong>{data?.total || 0}</strong> items from the database?
              You'll need to re-import items afterwards.
            </p>

            <div className="flex space-x-3">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => clearMutation.mutate()}
                disabled={clearMutation.isPending}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-red-800 text-white font-medium py-2 rounded-lg transition-colors flex items-center justify-center space-x-2"
              >
                {clearMutation.isPending ? (
                  <>
                    <RefreshCw className="h-5 w-5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="h-5 w-5" />
                    <span>Delete All</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterTag({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="flex items-center space-x-1 bg-gray-700 text-gray-300 px-2 py-1 rounded text-sm">
      <span>{label}</span>
      <button onClick={onRemove} className="hover:text-white">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function ItemRow({ item, onEdit }: { item: TbcRaidItem & { drop_count?: number }; onEdit: () => void }) {
  const qualityColor = ITEM_QUALITY_COLORS[item.quality as ItemQuality];

  return (
    <tr className="hover:bg-gray-700/50 transition-colors group">
      {/* Name with WoWhead icon */}
      <td className="px-3 sm:px-4 py-2">
        <a
          href={getWowheadItemUrl(item.wowhead_id)}
          data-wowhead={`item=${item.wowhead_id}&domain=tbc`}
          data-wh-icon-size="medium"
          target="_blank"
          rel="noopener noreferrer"
          className={`font-medium hover:underline wowhead-icon-spacing text-sm sm:text-base ${getItemQualityClass(item.quality as ItemQuality)}`}
          style={{ color: qualityColor }}
        >
          {item.name}
        </a>
        {/* Show slot on mobile under name */}
        <span className="block sm:hidden text-gray-500 text-xs mt-0.5">
          {item.slot || 'Misc'}
        </span>
      </td>

      {/* Slot */}
      <td className="px-3 sm:px-4 py-2 text-gray-400 text-xs sm:text-sm hidden sm:table-cell">
        {item.slot || '-'}
      </td>

      {/* Source (boss) */}
      <td className="px-3 sm:px-4 py-2 text-gray-400 text-xs sm:text-sm hidden md:table-cell truncate max-w-[200px]">
        {item.boss_name || '-'}
      </td>

      {/* Instance */}
      <td className="px-3 sm:px-4 py-2 text-gray-500 text-xs sm:text-sm hidden lg:table-cell">
        {item.raid_instance || '-'}
      </td>

      {/* Edit button */}
      <td className="px-1 sm:px-2 py-2">
        <button
          onClick={onEdit}
          className="sm:opacity-0 sm:group-hover:opacity-100 p-1 sm:p-1.5 bg-gray-700 hover:bg-gray-600 rounded text-gray-400 hover:text-white transition-all"
          title="Edit item"
        >
          <Pencil className="h-3 w-3 sm:h-4 sm:w-4" />
        </button>
      </td>
    </tr>
  );
}

function ImportModal({ onClose }: { onClose: () => void }) {
  const [importType, setImportType] = useState<'gargul' | 'rclootcouncil'>('gargul');
  const [importData, setImportData] = useState('');
  const [result, setResult] = useState<{
    success: boolean;
    imported_count: number;
    matched_count: number;
    unmatched_items: string[];
    errors: string[];
  } | null>(null);

  const importMutation = useMutation({
    mutationFn: async () => {
      const endpoint =
        importType === 'gargul' ? '/items/import/gargul' : '/items/import/rclootcouncil';
      const payload = importType === 'gargul' ? { data: importData } : { csv: importData };

      const res = await api.post(endpoint, payload);
      return res.data;
    },
    onSuccess: (data) => {
      setResult(data);
    },
    onError: (error: any) => {
      setResult({
        success: false,
        imported_count: 0,
        matched_count: 0,
        unmatched_items: [],
        errors: [error.response?.data?.message || 'Import failed'],
      });
    },
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Import Loot History</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="h-6 w-6" />
          </button>
        </div>

        {!result ? (
          <div className="space-y-4">
            {/* Import type selector */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">Import Format</label>
              <div className="flex space-x-2">
                <button
                  onClick={() => setImportType('gargul')}
                  className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                    importType === 'gargul'
                      ? 'bg-gold-600 text-white'
                      : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                  }`}
                >
                  Gargul
                </button>
                <button
                  onClick={() => setImportType('rclootcouncil')}
                  className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                    importType === 'rclootcouncil'
                      ? 'bg-gold-600 text-white'
                      : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                  }`}
                >
                  RCLootCouncil
                </button>
              </div>
            </div>

            {/* Instructions */}
            <div className="bg-gray-700/50 rounded-lg p-4 text-sm">
              {importType === 'gargul' ? (
                <>
                  <p className="text-gray-300 font-medium mb-2">How to export from Gargul:</p>
                  <ol className="text-gray-400 space-y-1 list-decimal list-inside">
                    <li>
                      Type <code className="bg-gray-800 px-1 rounded">/gdkp</code> in game
                    </li>
                    <li>Go to Export &rarr; Share</li>
                    <li>Copy the entire export string</li>
                    <li>Paste it below</li>
                  </ol>
                </>
              ) : (
                <>
                  <p className="text-gray-300 font-medium mb-2">
                    How to export from RCLootCouncil:
                  </p>
                  <ol className="text-gray-400 space-y-1 list-decimal list-inside">
                    <li>
                      Type <code className="bg-gray-800 px-1 rounded">/rc history</code> in game
                    </li>
                    <li>Click Export and choose CSV format</li>
                    <li>Copy the entire CSV content</li>
                    <li>Paste it below</li>
                  </ol>
                </>
              )}
            </div>

            {/* Import data textarea */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                {importType === 'gargul' ? 'Gargul Export String' : 'RCLootCouncil CSV'}
              </label>
              <textarea
                value={importData}
                onChange={(e) => setImportData(e.target.value)}
                placeholder={
                  importType === 'gargul'
                    ? 'Paste Gargul export string here...'
                    : 'Paste CSV content here...'
                }
                rows={10}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
              />
            </div>

            {/* Import button */}
            <button
              onClick={() => importMutation.mutate()}
              disabled={!importData.trim() || importMutation.isPending}
              className="w-full bg-gold-600 hover:bg-gold-700 disabled:bg-gray-600 text-white font-medium py-2 rounded-lg transition-colors flex items-center justify-center space-x-2"
            >
              {importMutation.isPending ? (
                <>
                  <RefreshCw className="h-5 w-5 animate-spin" />
                  <span>Importing...</span>
                </>
              ) : (
                <>
                  <Upload className="h-5 w-5" />
                  <span>Import Loot History</span>
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Result status */}
            <div
              className={`flex items-center space-x-3 p-4 rounded-lg ${
                result.success && result.imported_count > 0
                  ? 'bg-green-500/20 text-green-400'
                  : result.errors.length > 0
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-yellow-500/20 text-yellow-400'
              }`}
            >
              {result.success && result.imported_count > 0 ? (
                <CheckCircle className="h-6 w-6 flex-shrink-0" />
              ) : (
                <AlertCircle className="h-6 w-6 flex-shrink-0" />
              )}
              <div>
                <p className="font-medium">
                  {result.success && result.imported_count > 0
                    ? 'Import Successful!'
                    : result.errors.length > 0
                      ? 'Import Failed'
                      : 'Partial Import'}
                </p>
                <p className="text-sm opacity-80">
                  {result.imported_count} items imported, {result.matched_count} matched to
                  database
                </p>
              </div>
            </div>

            {/* Unmatched items */}
            {result.unmatched_items.length > 0 && (
              <div className="bg-gray-700/50 rounded-lg p-4">
                <p className="text-gray-300 font-medium mb-2">
                  Unmatched Items ({result.unmatched_items.length}):
                </p>
                <div className="text-gray-400 text-sm max-h-32 overflow-y-auto">
                  {result.unmatched_items.slice(0, 10).map((item, i) => (
                    <p key={i}>{item}</p>
                  ))}
                  {result.unmatched_items.length > 10 && (
                    <p className="text-gray-500">
                      ...and {result.unmatched_items.length - 10} more
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Errors */}
            {result.errors.length > 0 && (
              <div className="bg-red-500/10 rounded-lg p-4">
                <p className="text-red-400 font-medium mb-2">Errors:</p>
                <div className="text-red-300 text-sm">
                  {result.errors.map((error, i) => (
                    <p key={i}>{error}</p>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex space-x-2">
              <button
                onClick={() => {
                  setResult(null);
                  setImportData('');
                }}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 rounded-lg transition-colors"
              >
                Import More
              </button>
              <button
                onClick={onClose}
                className="flex-1 bg-gold-600 hover:bg-gold-700 text-white font-medium py-2 rounded-lg transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AddItemModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [wowheadId, setWowheadId] = useState('');
  const [itemData, setItemData] = useState<{
    id: number;
    name: string;
    icon: string;
    quality: number;
    source: string;
  } | null>(null);
  const [raidInstance, setRaidInstance] = useState('');
  const [bossName, setBossName] = useState('');
  const [slot, setSlot] = useState('');
  const [lookupError, setLookupError] = useState('');

  // Lookup item from WoWhead
  const lookupMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.get(`/items/wowhead/${id}`);
      return res.data;
    },
    onSuccess: (data) => {
      if (data.error) {
        setLookupError(data.error);
        setItemData(null);
      } else {
        setItemData(data);
        setLookupError('');
      }
    },
    onError: () => {
      setLookupError('Failed to lookup item');
      setItemData(null);
    },
  });

  // Add item to database
  const addMutation = useMutation({
    mutationFn: async () => {
      if (!itemData) return;
      const res = await api.post('/items', {
        wowhead_id: itemData.id,
        name: itemData.name,
        icon: itemData.icon,
        quality: itemData.quality,
        raid_instance: raidInstance || undefined,
        boss_name: bossName || undefined,
        slot: slot || undefined,
      });
      return res.data;
    },
    onSuccess: (data) => {
      if (data.success) {
        onSuccess();
        // Reset for next item
        setWowheadId('');
        setItemData(null);
        setRaidInstance('');
        setBossName('');
        setSlot('');
      }
    },
  });

  const handleLookup = () => {
    const input = wowheadId.trim();
    if (!input) return;

    // Extract item ID from various formats:
    // - Just ID: "21903"
    // - With item=: "item=21903"
    // - Full URL path: "/tbc/item=21903/pattern-name" or "bc/item=21903/..."
    // - Full URL: "https://www.wowhead.com/tbc/item=21903/pattern-name"
    let itemId = input;

    // Try to extract from item=XXXXX pattern
    const match = input.match(/item[=:](\d+)/i);
    if (match) {
      itemId = match[1];
    } else {
      // If no match, try to extract just digits if that's all there is
      const digitsOnly = input.replace(/\D/g, '');
      if (digitsOnly && digitsOnly.length >= 4) {
        itemId = digitsOnly;
      }
    }

    lookupMutation.mutate(itemId);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg max-w-lg w-full p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Add Item</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="space-y-4">
          {/* WoWhead ID Input */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">WoWhead Item ID</label>
            <div className="flex space-x-2">
              <input
                type="text"
                value={wowheadId}
                onChange={(e) => setWowheadId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
                placeholder="e.g. 32837"
                className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-gold-500"
              />
              <button
                onClick={handleLookup}
                disabled={!wowheadId.trim() || lookupMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-medium px-4 py-2 rounded-lg transition-colors"
              >
                {lookupMutation.isPending ? (
                  <RefreshCw className="h-5 w-5 animate-spin" />
                ) : (
                  'Lookup'
                )}
              </button>
            </div>
            <p className="text-gray-500 text-xs mt-1">
              Paste item ID or full WoWhead URL (e.g. 32837 or wowhead.com/tbc/item=32837/...)
            </p>
          </div>

          {lookupError && (
            <div className="flex items-center space-x-2 text-red-400 text-sm">
              <AlertCircle className="h-4 w-4" />
              <span>{lookupError}</span>
            </div>
          )}

          {/* Item Preview */}
          {itemData && (
            <div className="bg-gray-700/50 rounded-lg p-4">
              <div className="flex items-center space-x-3 mb-4">
                <img
                  src={`https://wow.zamimg.com/images/wow/icons/medium/${itemData.icon}.jpg`}
                  alt={itemData.name}
                  className="w-10 h-10 rounded"
                  style={{
                    borderWidth: 2,
                    borderStyle: 'solid',
                    borderColor: ITEM_QUALITY_COLORS[itemData.quality as ItemQuality],
                  }}
                />
                <div>
                  <p
                    className="font-medium"
                    style={{ color: ITEM_QUALITY_COLORS[itemData.quality as ItemQuality] }}
                  >
                    {itemData.name}
                  </p>
                  <p className="text-gray-500 text-xs">
                    ID: {itemData.id} • {itemData.source === 'database' ? 'Already in database' : 'From WoWhead'}
                  </p>
                </div>
              </div>

              {itemData.source !== 'database' && (
                <div className="space-y-3">
                  {/* Raid Instance */}
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Raid Instance (optional)</label>
                    <select
                      value={raidInstance}
                      onChange={(e) => setRaidInstance(e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-gold-500"
                    >
                      <option value="">Select raid...</option>
                      {TBC_RAID_INSTANCES.map((inst) => (
                        <option key={inst.id} value={inst.name}>
                          {inst.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Boss Name */}
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Boss Name (optional)</label>
                    <input
                      type="text"
                      value={bossName}
                      onChange={(e) => setBossName(e.target.value)}
                      placeholder="e.g. Illidan Stormrage"
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-gold-500"
                    />
                  </div>

                  {/* Slot */}
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Item Slot (optional)</label>
                    <select
                      value={slot}
                      onChange={(e) => setSlot(e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-gold-500"
                    >
                      <option value="">Select slot...</option>
                      {ITEM_SLOTS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={() => addMutation.mutate()}
                    disabled={addMutation.isPending}
                    className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white font-medium py-2 rounded-lg transition-colors flex items-center justify-center space-x-2"
                  >
                    {addMutation.isPending ? (
                      <>
                        <RefreshCw className="h-5 w-5 animate-spin" />
                        <span>Adding...</span>
                      </>
                    ) : (
                      <>
                        <Plus className="h-5 w-5" />
                        <span>Add to Database</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {itemData.source === 'database' && (
                <p className="text-yellow-500 text-sm">This item is already in the database.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EditItemModal({
  item,
  onClose,
  onSuccess,
}: {
  item: TbcRaidItem;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [raidInstance, setRaidInstance] = useState(item.raid_instance || '');
  const [bossName, setBossName] = useState(item.boss_name || '');
  const [slot, setSlot] = useState(item.slot || '');
  const [quality, setQuality] = useState(item.quality.toString());

  const qualityColor = ITEM_QUALITY_COLORS[item.quality as ItemQuality];

  const updateMutation = useMutation({
    mutationFn: async () => {
      const res = await api.put(`/items/${item.id}`, {
        name,
        slot: slot || undefined,
        quality: parseInt(quality),
        raid_instance: raidInstance || undefined,
        boss_name: bossName || undefined,
      });
      return res.data;
    },
    onSuccess: (data) => {
      if (data.success) {
        onSuccess();
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await api.delete(`/items/${item.id}`);
      return res.data;
    },
    onSuccess: (data) => {
      if (data.success) {
        onSuccess();
      }
    },
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg max-w-lg w-full p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Edit Item</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Item Preview */}
          <div className="flex items-center space-x-3 bg-gray-700/50 rounded-lg p-3">
            <img
              src={`https://wow.zamimg.com/images/wow/icons/medium/${item.icon || 'inv_misc_questionmark'}.jpg`}
              alt={item.name}
              className="w-10 h-10 rounded"
              style={{
                borderWidth: 2,
                borderStyle: 'solid',
                borderColor: qualityColor,
              }}
            />
            <div>
              <p className="font-medium" style={{ color: qualityColor }}>
                {item.name}
              </p>
              <p className="text-gray-500 text-xs">WoWhead ID: {item.wowhead_id}</p>
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Item Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-gold-500"
            />
          </div>

          {/* Quality */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Quality</label>
            <select
              value={quality}
              onChange={(e) => setQuality(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-gold-500"
            >
              <option value="2">Uncommon</option>
              <option value="3">Rare</option>
              <option value="4">Epic</option>
              <option value="5">Legendary</option>
            </select>
          </div>

          {/* Raid Instance */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Raid Instance</label>
            <select
              value={raidInstance}
              onChange={(e) => setRaidInstance(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-gold-500"
            >
              <option value="">Select raid...</option>
              {TBC_RAID_INSTANCES.map((inst) => (
                <option key={inst.id} value={inst.name}>
                  {inst.name}
                </option>
              ))}
            </select>
          </div>

          {/* Boss Name */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Boss Name</label>
            <input
              type="text"
              value={bossName}
              onChange={(e) => setBossName(e.target.value)}
              placeholder="e.g. Illidan Stormrage"
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-gold-500"
            />
          </div>

          {/* Item Slot */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Item Slot</label>
            <select
              value={slot}
              onChange={(e) => setSlot(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-gold-500"
            >
              <option value="">Select slot...</option>
              {ITEM_SLOTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div className="flex space-x-3 pt-2">
            <button
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending || updateMutation.isPending}
              className="flex items-center justify-center space-x-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {deleteMutation.isPending ? (
                <RefreshCw className="h-5 w-5 animate-spin" />
              ) : (
                <Trash2 className="h-5 w-5" />
              )}
            </button>
            <button
              onClick={() => updateMutation.mutate()}
              disabled={updateMutation.isPending || deleteMutation.isPending || !name.trim()}
              className="flex-1 bg-gold-600 hover:bg-gold-700 disabled:bg-gray-600 text-white font-medium py-2 rounded-lg transition-colors flex items-center justify-center space-x-2"
            >
              {updateMutation.isPending ? (
                <>
                  <RefreshCw className="h-5 w-5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <CheckCircle className="h-5 w-5" />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Type declaration for WoWhead tooltips
declare global {
  interface Window {
    $WowheadPower?: {
      refreshLinks: () => void;
    };
  }
}
