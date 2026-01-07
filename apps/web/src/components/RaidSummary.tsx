import { formatGold, ITEM_QUALITY_COLORS, type ItemQuality } from '@gdkp/shared';
import { Crown, Trophy, Coins } from 'lucide-react';

// Quality border classes
const qualityBorderClass: Record<number, string> = {
  0: 'border-gray-500',
  1: 'border-gray-300',
  2: 'border-green-500',
  3: 'border-blue-500',
  4: 'border-purple-500',
  5: 'border-orange-500',
};

// Raid background images
const raidBackgrounds: Record<string, string> = {
  'Karazhan': '/raids/karazhan.jpg',
  "Gruul's Lair": '/raids/gruul.jpg',
  "Magtheridon's Lair": '/raids/magtheridon.jpg',
  'Serpentshrine Cavern': '/raids/ssc.jpg',
  'Tempest Keep': '/raids/tempest-keep.jpg',
  'The Eye': '/raids/tempest-keep.jpg',
  'Mount Hyjal': '/raids/hyjal.jpg',
  'Black Temple': '/raids/black-temple.jpg',
  'Sunwell Plateau': '/raids/sunwell.jpg',
  "Zul'Aman": '/raids/zulaman.jpg',
};

const getRaidBackground = (instance: string) => raidBackgrounds[instance] || '';

interface ItemWon {
  id: string;
  name: string;
  icon_url: string | null;
  winner_name: string;
  final_bid: number;
  quality?: number;
}

interface ParticipantPayout {
  user_id: string;
  display_name: string;
  role: string;
  payout_amount: number;
  share_percentage: number;
}

interface RaidSummaryData {
  raid_id: string;
  raid_name: string;
  instance: string;
  leader_name: string;
  pot_total: number;
  leader_cut_percent: number;
  leader_cut_amount: number;
  distributed_amount: number;
  participant_count: number;
  participants: ParticipantPayout[];
  items: ItemWon[];
  completed_at: string;
}

interface RaidSummaryProps {
  data: RaidSummaryData;
  onClose?: () => void;
}

export function RaidSummary({ data, onClose }: RaidSummaryProps) {
  const raidBg = getRaidBackground(data.instance);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-gray-900 border border-amber-500/50 rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header with raid background */}
        <div
          className="relative overflow-hidden border-b border-amber-500/30"
          style={{
            backgroundImage: raidBg ? `url(${raidBg})` : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          {/* Dark gradient overlay for readability */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-black/70" />
          {/* Content */}
          <div className="relative p-4">
            <h2 className="text-xl font-bold text-amber-400 drop-shadow-lg">{data.raid_name}</h2>
            <p className="text-gray-300 text-sm drop-shadow-md">{data.instance} • {new Date(data.completed_at).toLocaleDateString('sv-SE')}</p>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* Pot Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-gray-800 rounded-lg p-3 text-center">
              <Coins className="h-5 w-5 text-amber-500 mx-auto mb-1" />
              <p className="text-xs text-gray-400">Total Pot</p>
              <p className="text-lg font-bold text-amber-400">{formatGold(data.pot_total)}</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-3 text-center">
              <Crown className="h-5 w-5 text-amber-500 mx-auto mb-1" />
              <p className="text-xs text-gray-400">Management Cut ({data.leader_cut_percent}%)</p>
              <p className="text-lg font-bold text-amber-400">{formatGold(data.leader_cut_amount)}</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-3 text-center">
              <Trophy className="h-5 w-5 text-green-500 mx-auto mb-1" />
              <p className="text-xs text-gray-400">Distributed</p>
              <p className="text-lg font-bold text-green-400">{formatGold(data.distributed_amount)}</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-3 text-center">
              <p className="text-2xl mb-1">👥</p>
              <p className="text-xs text-gray-400">Players</p>
              <p className="text-lg font-bold text-white">{data.participant_count}</p>
            </div>
          </div>

          {/* Payouts Table */}
          <div className="bg-gray-800 rounded-lg overflow-hidden">
            <div className="bg-gray-900 px-4 py-2 border-b border-gray-700">
              <h3 className="text-sm font-semibold text-amber-400 uppercase tracking-wide">Payouts</h3>
            </div>
            <div className="divide-y divide-gray-700">
              {data.participants.map((p) => (
                <div key={p.user_id} className="flex items-center justify-between px-4 py-2 hover:bg-gray-700/50">
                  <div className="flex items-center space-x-2">
                    {p.role === 'LEADER' && <Crown className="h-4 w-4 text-amber-500" />}
                    <span className="text-white">{p.display_name}</span>
                    <span className="text-gray-500 text-xs">({p.share_percentage.toFixed(1)}%)</span>
                  </div>
                  <span className="text-amber-400 font-medium">{formatGold(p.payout_amount)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Items Sold */}
          {data.items.length > 0 && (
            <div className="bg-gray-800 rounded-lg overflow-hidden">
              <div className="bg-gray-900 px-4 py-2 border-b border-gray-700">
                <h3 className="text-sm font-semibold text-amber-400 uppercase tracking-wide">Items Sold ({data.items.length})</h3>
              </div>
              <div className="divide-y divide-gray-700 max-h-60 overflow-y-auto">
                {data.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between px-4 py-2 hover:bg-gray-700/50">
                    <div className="flex items-center space-x-3">
                      {item.icon_url ? (
                        <img src={item.icon_url} alt="" className={`w-8 h-8 rounded border ${qualityBorderClass[item.quality ?? 4]}`} />
                      ) : (
                        <div className={`w-8 h-8 rounded bg-gray-700 border ${qualityBorderClass[item.quality ?? 4]}`} />
                      )}
                      <div>
                        <p
                          className="font-medium text-sm"
                          style={{ color: ITEM_QUALITY_COLORS[(item.quality ?? 4) as ItemQuality] }}
                        >
                          {item.name}
                        </p>
                        <p className="text-gray-500 text-xs">→ {item.winner_name}</p>
                      </div>
                    </div>
                    <span className="text-amber-400 font-medium">{formatGold(item.final_bid)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-700 p-4 flex justify-end">
          {onClose && (
            <button
              onClick={onClose}
              className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-2 rounded-lg transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
