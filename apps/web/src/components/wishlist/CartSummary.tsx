import { ShoppingCart, Share2, Trash2, Eye, EyeOff } from 'lucide-react';

interface CartSummaryProps {
  selectedCount: number;
  viewMode: 'browse' | 'cart';
  onToggleView: () => void;
  onShare: () => void;
  onClear: () => void;
}

export function CartSummary({
  selectedCount,
  viewMode,
  onToggleView,
  onShare,
  onClear,
}: CartSummaryProps) {
  if (selectedCount === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur border-t border-gray-700 z-50">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          {/* Item count */}
          <div className="flex items-center gap-2 text-amber-400">
            <ShoppingCart className="h-5 w-5" />
            <span className="font-medium">
              {selectedCount} {selectedCount === 1 ? 'item' : 'items'} selected
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {/* Toggle view */}
            <button
              onClick={onToggleView}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                viewMode === 'cart'
                  ? 'bg-amber-500 text-black'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {viewMode === 'cart' ? (
                <>
                  <EyeOff className="h-4 w-4" />
                  <span className="hidden sm:inline">Show All</span>
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4" />
                  <span className="hidden sm:inline">View Cart</span>
                </>
              )}
            </button>

            {/* Share button */}
            <button
              onClick={onShare}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-500 transition-colors"
            >
              <Share2 className="h-4 w-4" />
              <span className="hidden sm:inline">Share</span>
            </button>

            {/* Clear button */}
            <button
              onClick={onClear}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-600/20 text-red-400 text-sm font-medium hover:bg-red-600/30 transition-colors"
              title="Clear all selected items"
            >
              <Trash2 className="h-4 w-4" />
              <span className="hidden sm:inline">Clear</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
