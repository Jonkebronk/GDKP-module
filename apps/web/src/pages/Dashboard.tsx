import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { formatGold } from '@gdkp/shared';
import { Wallet, Swords, TrendingUp, Clock } from 'lucide-react';

export function Dashboard() {
  const { data: walletData } = useQuery({
    queryKey: ['wallet', 'balance'],
    queryFn: async () => {
      const res = await api.get('/wallet/balance');
      return res.data;
    },
  });

  const { data: recentRaids } = useQuery({
    queryKey: ['raids', 'recent'],
    queryFn: async () => {
      const res = await api.get('/raids?limit=5');
      return res.data;
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Dashboard</h1>

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Balance */}
        <div className="bg-gray-800 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Balance</p>
              <p className="text-2xl font-bold text-gold-500">
                {walletData ? formatGold(walletData.balance) : '...'}
              </p>
            </div>
            <Wallet className="h-10 w-10 text-gold-500/50" />
          </div>
        </div>

        {/* Available */}
        <div className="bg-gray-800 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Available</p>
              <p className="text-2xl font-bold text-green-500">
                {walletData ? formatGold(walletData.available_balance) : '...'}
              </p>
            </div>
            <TrendingUp className="h-10 w-10 text-green-500/50" />
          </div>
        </div>

        {/* Locked */}
        <div className="bg-gray-800 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Locked in Bids</p>
              <p className="text-2xl font-bold text-yellow-500">
                {walletData ? formatGold(walletData.locked_amount) : '...'}
              </p>
            </div>
            <Clock className="h-10 w-10 text-yellow-500/50" />
          </div>
        </div>

        {/* Active Raids */}
        <div className="bg-gray-800 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Active Raids</p>
              <p className="text-2xl font-bold text-purple-500">
                {recentRaids?.filter((r: any) => r.status === 'ACTIVE').length || 0}
              </p>
            </div>
            <Swords className="h-10 w-10 text-purple-500/50" />
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          to="/wallet"
          className="bg-gray-800 hover:bg-gray-700 rounded-lg p-6 transition-colors"
        >
          <div className="flex items-center space-x-4">
            <div className="h-12 w-12 rounded-full bg-gold-500/20 flex items-center justify-center">
              <Wallet className="h-6 w-6 text-gold-500" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Manage Wallet</h3>
              <p className="text-gray-400 text-sm">Deposit or withdraw gold</p>
            </div>
          </div>
        </Link>

        <Link
          to="/raids"
          className="bg-gray-800 hover:bg-gray-700 rounded-lg p-6 transition-colors"
        >
          <div className="flex items-center space-x-4">
            <div className="h-12 w-12 rounded-full bg-purple-500/20 flex items-center justify-center">
              <Swords className="h-6 w-6 text-purple-500" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Browse Raids</h3>
              <p className="text-gray-400 text-sm">Join or create a raid</p>
            </div>
          </div>
        </Link>
      </div>

      {/* Recent raids */}
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Recent Raids</h2>
          <Link to="/raids" className="text-gold-500 hover:text-gold-400 text-sm">
            View all
          </Link>
        </div>

        {recentRaids?.length > 0 ? (
          <div className="space-y-3">
            {recentRaids.slice(0, 5).map((raid: any) => (
              <Link
                key={raid.id}
                to={`/raids/${raid.id}`}
                className="flex items-center justify-between p-3 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors"
              >
                <div>
                  <h3 className="text-white font-medium">{raid.name}</h3>
                  <p className="text-gray-400 text-sm">{raid.instance}</p>
                </div>
                <div className="text-right">
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      raid.status === 'ACTIVE'
                        ? 'bg-green-500/20 text-green-400'
                        : raid.status === 'PENDING'
                        ? 'bg-yellow-500/20 text-yellow-400'
                        : 'bg-gray-500/20 text-gray-400'
                    }`}
                  >
                    {raid.status}
                  </span>
                  <p className="text-gold-500 text-sm mt-1">
                    {formatGold(raid.pot_total)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-gray-400 text-center py-4">No raids yet</p>
        )}
      </div>
    </div>
  );
}
