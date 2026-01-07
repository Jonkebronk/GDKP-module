import { useState } from 'react';
import { Settings, Clock } from 'lucide-react';
import { AUCTION_DEFAULTS } from '@gdkp/shared';

interface AuctionSettingsProps {
  duration: number;
  onDurationChange: (duration: number) => void;
}

const DURATION_PRESETS = [
  { label: '30s', value: 30 },
  { label: '45s', value: 45 },
  { label: '60s', value: 60 },
  { label: '90s', value: 90 },
  { label: '120s', value: 120 },
];

export function AuctionSettings({ duration, onDurationChange }: AuctionSettingsProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="wow-tooltip wow-border-common">
      {/* Header - clickable to expand/collapse */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full wow-tooltip-header flex items-center justify-between p-3 border-b border-gray-700 hover:bg-gray-800/50 transition-colors"
      >
        <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wide flex items-center space-x-2">
          <Settings className="h-4 w-4" />
          <span>Auction Settings</span>
        </h2>
        <div className="flex items-center space-x-2 text-gray-400">
          <Clock className="h-4 w-4" />
          <span className="text-white font-medium">{duration}s</span>
          <span className="text-xs">{isExpanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {/* Expandable content */}
      {isExpanded && (
        <div className="p-3 space-y-3">
          {/* Duration Setting */}
          <div>
            <label className="block text-xs text-gray-400 mb-2">Auction Duration</label>
            <div className="flex flex-wrap gap-2">
              {DURATION_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => onDurationChange(preset.value)}
                  className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                    duration === preset.value
                      ? 'bg-amber-500 text-black'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Duration Input */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Custom (seconds)</label>
            <div className="flex items-center space-x-2">
              <input
                type="number"
                value={duration}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || AUCTION_DEFAULTS.DURATION;
                  const clamped = Math.max(
                    AUCTION_DEFAULTS.MIN_DURATION,
                    Math.min(AUCTION_DEFAULTS.MAX_DURATION, val)
                  );
                  onDurationChange(clamped);
                }}
                min={AUCTION_DEFAULTS.MIN_DURATION}
                max={AUCTION_DEFAULTS.MAX_DURATION}
                className="w-24 bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <span className="text-gray-400 text-sm">
                ({AUCTION_DEFAULTS.MIN_DURATION}-{AUCTION_DEFAULTS.MAX_DURATION}s)
              </span>
            </div>
          </div>

          {/* Info text */}
          <p className="text-xs text-gray-500">
            Setting applies to the next auction you start. Anti-snipe extends time if bids come in the last 10 seconds.
          </p>
        </div>
      )}
    </div>
  );
}
