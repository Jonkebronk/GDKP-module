import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { formatGold } from '@gdkp/shared';
import { Clock, Gavel, Users, Loader2, Calendar } from 'lucide-react';
import { useState, useEffect } from 'react';

interface PreAuctionRaid {
  id: string;
  name: string;
  instances: string[];
  roster_locked_at: string;
  preauction_ends_at: string;
  participant_count: number;
  item_count: number;
  items_with_bids: number;
  my_winning_bids: number;
  my_total_bid_amount: number;
}

function CountdownTimer({ endsAt }: { endsAt: string }) {
  const [remainingMs, setRemainingMs] = useState(0);

  useEffect(() => {
    const updateRemaining = () => {
      const remaining = new Date(endsAt).getTime() - Date.now();
      setRemainingMs(Math.max(0, remaining));
    };

    updateRemaining();
    const interval = setInterval(updateRemaining, 1000);

    return () => clearInterval(interval);
  }, [endsAt]);

  if (remainingMs <= 0) {
    return <span className="text-gray-400">Ended</span>;
  }

  const hours = Math.floor(remainingMs / (1000 * 60 * 60));
  const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((remainingMs % (1000 * 60)) / 1000);

  const isEndingSoon = remainingMs <= 30 * 60 * 1000;

  return (
    <span className={`font-mono ${isEndingSoon ? 'text-yellow-400' : 'text-white'}`}>
      {hours.toString().padStart(2, '0')}:
      {minutes.toString().padStart(2, '0')}:
      {seconds.toString().padStart(2, '0')}
    </span>
  );
}

export function PreAuctionsList() {
  const { data, isLoading } = useQuery({
    queryKey: ['pre-auctions-list'],
    queryFn: async () => {
      const res = await api.get('/pre-auctions');
      return res.data as { active: PreAuctionRaid[]; ended: PreAuctionRaid[] };
    },
    refetchInterval: 30000,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Gavel className="h-7 w-7 text-amber-500" />
          Pre-Auctions
        </h1>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 text-amber-500 animate-spin" />
        </div>
      ) : (
        <>
          {/* Active Pre-Auctions */}
          <section>
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Clock className="h-5 w-5 text-green-400" />
              Active Pre-Auctions
            </h2>
            {data?.active && data.active.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {data.active.map((raid) => (
                  <Link
                    key={raid.id}
                    to={`/raids/${raid.id}/pre-auction`}
                    className="bg-gray-800 rounded-lg p-4 hover:bg-gray-750 transition-colors border border-gray-700 hover:border-amber-500/50"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-white">{raid.name}</h3>
                        <p className="text-sm text-gray-400">
                          {raid.instances.join(' + ')}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 text-green-400 text-sm">
                        <Clock className="h-4 w-4" />
                        <CountdownTimer endsAt={raid.preauction_ends_at} />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                      <div className="flex items-center gap-2 text-gray-400">
                        <Users className="h-4 w-4" />
                        <span>{raid.participant_count} players</span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-400">
                        <Gavel className="h-4 w-4" />
                        <span>{raid.item_count} items</span>
                      </div>
                    </div>

                    {raid.my_winning_bids > 0 && (
                      <div className="bg-amber-500/10 rounded-lg p-2 text-sm">
                        <span className="text-amber-400">
                          Leading on {raid.my_winning_bids} item{raid.my_winning_bids !== 1 ? 's' : ''} ({formatGold(raid.my_total_bid_amount)})
                        </span>
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            ) : (
              <div className="bg-gray-800 rounded-lg p-8 text-center">
                <Gavel className="h-12 w-12 mx-auto mb-4 text-gray-600" />
                <p className="text-gray-400">No active pre-auctions</p>
                <p className="text-sm text-gray-500 mt-1">
                  Pre-auctions will appear here when a raid leader locks the roster
                </p>
              </div>
            )}
          </section>

          {/* Ended Pre-Auctions */}
          {data?.ended && data.ended.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Calendar className="h-5 w-5 text-gray-400" />
                Recently Ended
              </h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {data.ended.map((raid) => (
                  <Link
                    key={raid.id}
                    to={`/raids/${raid.id}/pre-auction`}
                    className="bg-gray-800/50 rounded-lg p-4 hover:bg-gray-800 transition-colors border border-gray-700"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-gray-300">{raid.name}</h3>
                        <p className="text-sm text-gray-500">
                          {raid.instances.join(' + ')}
                        </p>
                      </div>
                      <span className="text-xs text-gray-500 bg-gray-700 px-2 py-1 rounded">
                        Ended
                      </span>
                    </div>

                    {raid.my_winning_bids > 0 && (
                      <div className="bg-green-500/10 rounded-lg p-2 text-sm">
                        <span className="text-green-400">
                          Won {raid.my_winning_bids} item{raid.my_winning_bids !== 1 ? 's' : ''} ({formatGold(raid.my_total_bid_amount)})
                        </span>
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
