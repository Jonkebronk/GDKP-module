import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { formatGold, WOW_INSTANCES } from '@gdkp/shared';
import { Plus, Users, Coins, Calendar, X } from 'lucide-react';

export function Raids() {
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'mine'>('all');

  const { data: raids, isLoading } = useQuery({
    queryKey: ['raids', filter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filter === 'active') params.set('status', 'ACTIVE');
      if (filter === 'mine') params.set('mine', 'true');
      const res = await api.get(`/raids?${params}`);
      return res.data;
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Raids</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center space-x-2 bg-gold-600 hover:bg-gold-700 text-white font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="h-5 w-5" />
          <span>Create Raid</span>
        </button>
      </div>

      {/* Filters */}
      <div className="flex space-x-2">
        {(['all', 'active', 'mine'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === f
                ? 'bg-gold-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {f === 'all' ? 'All Raids' : f === 'active' ? 'Active' : 'My Raids'}
          </button>
        ))}
      </div>

      {/* Raid list */}
      {isLoading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-gold-500 mx-auto"></div>
        </div>
      ) : raids?.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {raids.map((raid: any) => (
            <Link
              key={raid.id}
              to={`/raids/${raid.id}`}
              className="bg-gray-800 rounded-lg p-6 hover:bg-gray-700 transition-colors"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-white">{raid.name}</h3>
                  <p className="text-gray-400 text-sm">{raid.instance}</p>
                </div>
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
              </div>

              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-1 text-gray-400">
                    <Users className="h-4 w-4" />
                    <span>{raid.participant_count}</span>
                  </div>
                  <div className="flex items-center space-x-1 text-gold-500">
                    <Coins className="h-4 w-4" />
                    <span>{formatGold(raid.pot_total, { abbreviated: true })}</span>
                  </div>
                </div>
                <div className="flex items-center space-x-1 text-gray-500">
                  <Calendar className="h-4 w-4" />
                  <span>{new Date(raid.created_at).toLocaleDateString()}</span>
                </div>
              </div>

              <div className="mt-4 flex items-center space-x-2">
                {raid.leader.discord_avatar ? (
                  <img
                    src={raid.leader.discord_avatar}
                    alt={raid.leader.discord_username}
                    className="h-6 w-6 rounded-full"
                  />
                ) : (
                  <div className="h-6 w-6 rounded-full bg-gray-600" />
                )}
                <span className="text-gray-400 text-sm">{raid.leader.discord_username}</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-gray-800 rounded-lg">
          <p className="text-gray-400">No raids found</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="mt-4 text-gold-500 hover:text-gold-400"
          >
            Create your first raid
          </button>
        </div>
      )}

      {/* Create Raid Modal */}
      {showCreateModal && (
        <CreateRaidModal onClose={() => setShowCreateModal(false)} />
      )}
    </div>
  );
}

function CreateRaidModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [instance, setInstance] = useState(WOW_INSTANCES[0]);
  const [leaderCut, setLeaderCut] = useState(10);

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/raids', {
        name,
        instance,
        split_config: {
          type: 'equal',
          leader_cut_percent: leaderCut,
        },
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['raids'] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Create Raid</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Raid Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., MC Guild Run"
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-gold-500"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Instance</label>
            <select
              value={instance}
              onChange={(e) => setInstance(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-gold-500"
            >
              {WOW_INSTANCES.map((inst) => (
                <option key={inst} value={inst}>
                  {inst}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Leader Cut: {leaderCut}%
            </label>
            <input
              type="range"
              min="0"
              max="20"
              value={leaderCut}
              onChange={(e) => setLeaderCut(parseInt(e.target.value))}
              className="w-full"
            />
            <p className="text-gray-500 text-xs mt-1">
              Remaining {100 - leaderCut}% split equally among participants
            </p>
          </div>

          <button
            onClick={() => createMutation.mutate()}
            disabled={!name || createMutation.isPending}
            className="w-full bg-gold-600 hover:bg-gold-700 disabled:bg-gray-600 text-white font-medium py-2 rounded-lg transition-colors"
          >
            {createMutation.isPending ? 'Creating...' : 'Create Raid'}
          </button>
        </div>
      </div>
    </div>
  );
}
