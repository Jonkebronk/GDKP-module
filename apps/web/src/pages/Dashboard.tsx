import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { ITEM_QUALITY_COLORS, type ItemQuality } from '@gdkp/shared';
import { Wallet, ChevronDown, ChevronUp, ShoppingBag, Coins, Swords, Users, LogIn, Check, Smartphone, Download } from 'lucide-react';
import { GoldDisplay } from '../components/GoldDisplay';
import { useState } from 'react';
import { useAuthStore } from '../stores/authStore';

interface ActiveRaid {
  id: string;
  name: string;
  instances: string[];
  status: string;
  pot_total: number;
  participant_count: number;
  participants: Array<{ user_id: string }>;
}

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

const getRaidBackground = (instances: string | string[]) => {
  const instanceList = Array.isArray(instances) ? instances : [instances];
  return raidBackgrounds[instanceList[0]] || '';
};

const formatInstances = (instances: string | string[]) => {
  const instanceList = Array.isArray(instances) ? instances : [instances];
  return instanceList.join(' + ');
};

interface ItemWon {
  id: string;
  name: string;
  icon_url: string | null;
  quality: number;
  final_bid: number;
  completed_at: string | null;
}

interface RaidWithItems {
  raid_id: string;
  raid_name: string;
  instances: string[];
  ended_at: string | null;
  items: ItemWon[];
  total_spent: number;
}

interface ItemsWonData {
  raids: RaidWithItems[];
  total_spent: number;
  total_items: number;
}

interface RaidPayout {
  raid_id: string;
  raid_name: string;
  instances: string[];
  ended_at: string | null;
  pot_total: number;
  payout_amount: number;
  role: string;
  paid_at: string | null;
}

interface PayoutsData {
  raids: RaidPayout[];
  total_payout: number;
  total_raids: number;
}

export function Dashboard() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [expandedSpent, setExpandedSpent] = useState<string | null>(null);
  const [expandedPayout, setExpandedPayout] = useState<string | null>(null);
  const [showInstallGuide, setShowInstallGuide] = useState(false);

  const { data: activeRaids } = useQuery<ActiveRaid[]>({
    queryKey: ['raids', 'active'],
    queryFn: async () => {
      const res = await api.get('/raids?status=ACTIVE,PENDING');
      return res.data;
    },
  });

  const joinRaidMutation = useMutation({
    mutationFn: async (raidId: string) => {
      await api.post(`/raids/${raidId}/join`);
      return raidId;
    },
    onSuccess: (raidId) => {
      queryClient.invalidateQueries({ queryKey: ['raids'] });
      navigate(`/raids/${raidId}`);
    },
  });

  const { data: itemsWon } = useQuery<ItemsWonData>({
    queryKey: ['user', 'items-won'],
    queryFn: async () => {
      const res = await api.get('/users/me/items-won');
      return res.data;
    },
  });

  const { data: payouts } = useQuery<PayoutsData>({
    queryKey: ['user', 'payouts'],
    queryFn: async () => {
      const res = await api.get('/users/me/payouts');
      return res.data;
    },
  });

  const toggleSpentRaid = (raidId: string) => {
    setExpandedSpent((prev) => (prev === raidId ? null : raidId));
  };

  const togglePayoutRaid = (raidId: string) => {
    setExpandedPayout((prev) => (prev === raidId ? null : raidId));
  };

  const isInRaid = (raid: ActiveRaid) => {
    return raid.participants?.some((p) => p.user_id === user?.id);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Dashboard</h1>

      {/* Balance + Gold Report + Active Raids row */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Balance card */}
        <div className="bg-gray-800 rounded-lg p-6 flex-shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-amber-400 text-sm font-semibold">Balance</p>
              <div className="text-2xl font-bold text-gold-500">
                <GoldDisplay amount={user?.gold_balance || 0} iconSize={20} />
              </div>
            </div>
            <Wallet className="h-10 w-10 text-gold-500/50" />
          </div>
        </div>

        {/* Active Raids - Compact Card with Background */}
        {activeRaids && activeRaids.length > 0 && activeRaids.slice(0, 1).map((raid) => {
          const inRaid = isInRaid(raid);
          return (
            <div
              key={raid.id}
              className="rounded-lg overflow-hidden flex-shrink-0 relative"
              style={{
                backgroundImage: getRaidBackground(raid.instances) ? `url(${getRaidBackground(raid.instances)})` : undefined,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            >
              {/* Dark overlay */}
              <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/60 to-black/70" />

              {/* Content */}
              <div className="relative p-5">
                <div className="flex items-center justify-between gap-6">
                  <div className="flex items-center space-x-3">
                    <Swords className="h-10 w-10 text-purple-400/70" />
                    <div>
                      <p className="text-white font-semibold drop-shadow-lg">{raid.name}</p>
                      <p className="text-gray-300 text-sm flex items-center space-x-2 drop-shadow-md">
                        <span>{formatInstances(raid.instances)}</span>
                        <span>•</span>
                        <Users className="h-3 w-3" />
                        <span>{raid.participant_count}</span>
                      </p>
                    </div>
                  </div>
                  {inRaid ? (
                    <Link
                      to={`/raids/${raid.id}`}
                      className="flex items-center space-x-1 bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <Check className="h-4 w-4" />
                      <span>Joined</span>
                    </Link>
                  ) : (
                    <button
                      onClick={() => joinRaidMutation.mutate(raid.id)}
                      disabled={joinRaidMutation.isPending}
                      className="flex items-center space-x-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <LogIn className="h-4 w-4" />
                      <span>{joinRaidMutation.isPending ? '...' : 'Join'}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Two column layout for history sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gold Spent History */}
        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <div className="bg-gray-900 px-4 py-3 border-b border-gray-700 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <ShoppingBag className="h-5 w-5 text-red-400" />
              <h2 className="text-lg font-semibold text-white">Gold Spent</h2>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400">Total</p>
              <GoldDisplay
                amount={itemsWon?.total_spent || 0}
                className="text-red-400 font-semibold"
                iconSize={14}
              />
            </div>
          </div>

          <div className="divide-y divide-gray-700 max-h-96 overflow-y-auto">
            {itemsWon?.raids && itemsWon.raids.length > 0 ? (
              itemsWon.raids.map((raid) => (
                <div key={raid.raid_id}>
                  <button
                    onClick={() => toggleSpentRaid(raid.raid_id)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-700/50 transition-colors"
                  >
                    <div className="flex items-center space-x-3">
                      {expandedSpent === raid.raid_id ? (
                        <ChevronUp className="h-4 w-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-gray-400" />
                      )}
                      <div className="text-left">
                        <p className="text-white font-medium">{raid.raid_name}</p>
                        <p className="text-gray-500 text-xs">
                          {formatInstances(raid.instances)} • {raid.items.length} item{raid.items.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                    <GoldDisplay
                      amount={raid.total_spent}
                      className="text-red-400 font-medium"
                      iconSize={12}
                    />
                  </button>

                  {expandedSpent === raid.raid_id && (
                    <div className="bg-gray-900/50 px-4 py-2 space-y-2">
                      {raid.items.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between py-1"
                        >
                          <div className="flex items-center space-x-2">
                            {item.icon_url ? (
                              <img
                                src={item.icon_url}
                                alt=""
                                className={`w-6 h-6 rounded border ${qualityBorderClass[item.quality]}`}
                              />
                            ) : (
                              <div
                                className={`w-6 h-6 rounded bg-gray-700 border ${qualityBorderClass[item.quality]}`}
                              />
                            )}
                            <span
                              className="text-sm"
                              style={{ color: ITEM_QUALITY_COLORS[item.quality as ItemQuality] || '#a335ee' }}
                            >
                              {item.name}
                            </span>
                          </div>
                          <GoldDisplay
                            amount={item.final_bid}
                            className="text-gray-400 text-sm"
                            iconSize={10}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="px-4 py-8 text-center text-gray-500">
                No items won yet
              </div>
            )}
          </div>
        </div>

        {/* Cut Payout History */}
        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <div className="bg-gray-900 px-4 py-3 border-b border-gray-700 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Coins className="h-5 w-5 text-green-400" />
              <h2 className="text-lg font-semibold text-white">Cut Payouts</h2>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400">Total</p>
              <GoldDisplay
                amount={payouts?.total_payout || 0}
                className="text-green-400 font-semibold"
                iconSize={14}
              />
            </div>
          </div>

          <div className="divide-y divide-gray-700 max-h-96 overflow-y-auto">
            {payouts?.raids && payouts.raids.length > 0 ? (
              payouts.raids.map((raid) => (
                <div key={raid.raid_id}>
                  <button
                    onClick={() => togglePayoutRaid(raid.raid_id)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-700/50 transition-colors"
                  >
                    <div className="flex items-center space-x-3">
                      {expandedPayout === raid.raid_id ? (
                        <ChevronUp className="h-4 w-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-gray-400" />
                      )}
                      <div className="text-left">
                        <p className="text-white font-medium">{raid.raid_name}</p>
                        <p className="text-gray-500 text-xs">
                          {formatInstances(raid.instances)} • {raid.role}
                        </p>
                      </div>
                    </div>
                    <GoldDisplay
                      amount={raid.payout_amount}
                      className="text-green-400 font-medium"
                      iconSize={12}
                    />
                  </button>

                  {expandedPayout === raid.raid_id && (
                    <div className="bg-gray-900/50 px-4 py-2">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <p className="text-gray-500">Pot Total</p>
                          <GoldDisplay
                            amount={raid.pot_total}
                            className="text-amber-400"
                            iconSize={10}
                          />
                        </div>
                        <div>
                          <p className="text-gray-500">Your Cut</p>
                          <GoldDisplay
                            amount={raid.payout_amount}
                            className="text-green-400"
                            iconSize={10}
                          />
                        </div>
                        <div>
                          <p className="text-gray-500">Role</p>
                          <p className="text-white">{raid.role}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Paid</p>
                          <p className="text-white">
                            {raid.paid_at
                              ? new Date(raid.paid_at).toLocaleDateString('sv-SE')
                              : '-'}
                          </p>
                        </div>
                      </div>
                      <Link
                        to={`/raids/${raid.raid_id}`}
                        className="block mt-2 text-xs text-gold-500 hover:text-gold-400"
                      >
                        View raid details →
                      </Link>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="px-4 py-8 text-center text-gray-500">
                No payouts received yet
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Install App Guide */}
      <div className="bg-gray-800 rounded-lg overflow-hidden">
        <button
          onClick={() => setShowInstallGuide(!showInstallGuide)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-700/50 transition-colors"
        >
          <div className="flex items-center space-x-3">
            <Smartphone className="h-5 w-5 text-amber-400" />
            <span className="text-white font-medium">Install as App</span>
          </div>
          {showInstallGuide ? (
            <ChevronUp className="h-5 w-5 text-gray-400" />
          ) : (
            <ChevronDown className="h-5 w-5 text-gray-400" />
          )}
        </button>

        {showInstallGuide && (
          <div className="px-4 pb-4 space-y-4">
            {/* iPhone */}
            <div className="bg-gray-900/50 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-3">
                <div className="w-6 h-6 bg-gray-700 rounded flex items-center justify-center text-xs">
                  <span>iOS</span>
                </div>
                <h3 className="text-white font-medium">iPhone / iPad</h3>
              </div>
              <ol className="text-gray-400 text-sm space-y-2 list-decimal list-inside">
                <li>Open this site in <span className="text-white">Safari</span></li>
                <li>Tap the <span className="text-white">Share button</span> (square with arrow)</li>
                <li>Scroll down and tap <span className="text-white">"Add to Home Screen"</span></li>
                <li>Tap <span className="text-white">"Add"</span> in the top right</li>
              </ol>
            </div>

            {/* Android */}
            <div className="bg-gray-900/50 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-3">
                <Download className="w-5 h-5 text-green-400" />
                <h3 className="text-white font-medium">Android</h3>
              </div>
              <ol className="text-gray-400 text-sm space-y-2 list-decimal list-inside">
                <li>Open this site in <span className="text-white">Chrome</span></li>
                <li>Tap the <span className="text-white">three dots menu</span> (top right)</li>
                <li>Tap <span className="text-white">"Install app"</span> or <span className="text-white">"Add to Home screen"</span></li>
                <li>Tap <span className="text-white">"Install"</span> to confirm</li>
              </ol>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
