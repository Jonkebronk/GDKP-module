import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { ITEM_QUALITY_COLORS, type ItemQuality } from '@gdkp/shared';
import { Wallet, ChevronDown, ChevronUp, ShoppingBag, Coins } from 'lucide-react';
import { GoldDisplay } from '../components/GoldDisplay';
import { useState } from 'react';

// Quality border classes
const qualityBorderClass: Record<number, string> = {
  0: 'border-gray-500',
  1: 'border-gray-300',
  2: 'border-green-500',
  3: 'border-blue-500',
  4: 'border-purple-500',
  5: 'border-orange-500',
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
  instance: string;
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
  instance: string;
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
  const [expandedSpentRaids, setExpandedSpentRaids] = useState<Set<string>>(new Set());
  const [expandedPayoutRaids, setExpandedPayoutRaids] = useState<Set<string>>(new Set());

  const { data: walletData } = useQuery({
    queryKey: ['wallet', 'balance'],
    queryFn: async () => {
      const res = await api.get('/wallet/balance');
      return res.data;
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
    setExpandedSpentRaids((prev) => {
      const next = new Set(prev);
      if (next.has(raidId)) {
        next.delete(raidId);
      } else {
        next.add(raidId);
      }
      return next;
    });
  };

  const togglePayoutRaid = (raidId: string) => {
    setExpandedPayoutRaids((prev) => {
      const next = new Set(prev);
      if (next.has(raidId)) {
        next.delete(raidId);
      } else {
        next.add(raidId);
      }
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Dashboard</h1>

      {/* Balance card */}
      <div className="bg-gray-800 rounded-lg p-6 max-w-xs">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-gray-400 text-sm">Balance</p>
            <div className="text-2xl font-bold text-gold-500">
              {walletData ? (
                <GoldDisplay amount={walletData.balance} iconSize={20} />
              ) : (
                '...'
              )}
            </div>
          </div>
          <Wallet className="h-10 w-10 text-gold-500/50" />
        </div>
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
                      {expandedSpentRaids.has(raid.raid_id) ? (
                        <ChevronUp className="h-4 w-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-gray-400" />
                      )}
                      <div className="text-left">
                        <p className="text-white font-medium">{raid.raid_name}</p>
                        <p className="text-gray-500 text-xs">
                          {raid.instance} • {raid.items.length} item{raid.items.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                    <GoldDisplay
                      amount={raid.total_spent}
                      className="text-red-400 font-medium"
                      iconSize={12}
                    />
                  </button>

                  {expandedSpentRaids.has(raid.raid_id) && (
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
                              className={`text-sm ${ITEM_QUALITY_COLORS[item.quality as ItemQuality]}`}
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
                      {expandedPayoutRaids.has(raid.raid_id) ? (
                        <ChevronUp className="h-4 w-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-gray-400" />
                      )}
                      <div className="text-left">
                        <p className="text-white font-medium">{raid.raid_name}</p>
                        <p className="text-gray-500 text-xs">
                          {raid.instance} • {raid.role}
                        </p>
                      </div>
                    </div>
                    <GoldDisplay
                      amount={raid.payout_amount}
                      className="text-green-400 font-medium"
                      iconSize={12}
                    />
                  </button>

                  {expandedPayoutRaids.has(raid.raid_id) && (
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
    </div>
  );
}
