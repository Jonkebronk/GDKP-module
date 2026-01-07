import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { History, Users, Calendar } from 'lucide-react';
import { GoldDisplay } from '../components/GoldDisplay';

interface RaidHistoryItem {
  id: string;
  name: string;
  instance: string;
  status: string;
  pot_total: number;
  participant_count: number;
  ended_at: string | null;
  created_at: string;
}

export function RaidHistory() {
  const { data: raids, isLoading } = useQuery<RaidHistoryItem[]>({
    queryKey: ['raids', 'history'],
    queryFn: async () => {
      const res = await api.get('/raids?status=COMPLETED,CANCELLED');
      return res.data;
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Raid History</h1>

      {isLoading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-gold-500 mx-auto"></div>
        </div>
      ) : raids && raids.length > 0 ? (
        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <div className="divide-y divide-gray-700">
            {raids.map((raid) => (
              <Link
                key={raid.id}
                to={`/raids/${raid.id}`}
                className="flex items-center justify-between px-4 py-4 hover:bg-gray-700/50 transition-colors"
              >
                <div>
                  <p className="text-white font-medium">{raid.name}</p>
                  <p className="text-gray-400 text-sm flex items-center space-x-3">
                    <span>{raid.instance}</span>
                    <span className="flex items-center">
                      <Users className="h-3 w-3 mr-1" />
                      {raid.participant_count}
                    </span>
                    <span className="flex items-center">
                      <Calendar className="h-3 w-3 mr-1" />
                      {raid.ended_at
                        ? new Date(raid.ended_at).toLocaleDateString('sv-SE')
                        : new Date(raid.created_at).toLocaleDateString('sv-SE')}
                    </span>
                  </p>
                </div>
                <div className="flex items-center space-x-3">
                  <GoldDisplay amount={raid.pot_total} iconSize={14} className="text-amber-400 font-medium" />
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      raid.status === 'COMPLETED'
                        ? 'bg-blue-500/20 text-blue-400'
                        : 'bg-gray-500/20 text-gray-400'
                    }`}
                  >
                    {raid.status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-gray-800 rounded-lg p-12 text-center">
          <History className="h-12 w-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">No raid history yet</p>
          <p className="text-gray-500 text-sm mt-1">Completed raids will appear here</p>
        </div>
      )}
    </div>
  );
}
