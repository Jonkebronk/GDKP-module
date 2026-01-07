import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { formatGold, WOW_INSTANCES } from '@gdkp/shared';
import { Plus, Users, Calendar, X, Trash2 } from 'lucide-react';
import { SimpleUserDisplay } from '../components/UserDisplay';
import { useAuthStore } from '../stores/authStore';

// Gold display component with WoW-style coin icon
function GoldDisplay({ amount, className = '' }: { amount: number; className?: string }) {
  return (
    <span className={`inline-flex items-center space-x-1 ${className}`}>
      <span className="text-amber-400 font-medium">{formatGold(amount, { abbreviated: true })}</span>
      <span className="text-amber-500">●</span>
    </span>
  );
}

export function Raids() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filter, setFilter] = useState<'active' | 'history'>('active');

  const { data: raids, isLoading } = useQuery({
    queryKey: ['raids', filter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filter === 'active') {
        // Active includes PENDING and ACTIVE
        params.set('status', 'ACTIVE,PENDING');
      }
      // History will fetch all and filter client-side
      const res = await api.get(`/raids?${params}`);
      const data = res.data;

      if (filter === 'history') {
        return data.filter((r: any) => r.status === 'COMPLETED' || r.status === 'CANCELLED');
      }
      if (filter === 'active') {
        return data.filter((r: any) => r.status === 'ACTIVE' || r.status === 'PENDING');
      }
      return data;
    },
  });

  const deleteRaidMutation = useMutation({
    mutationFn: async (raidId: string) => {
      await api.delete(`/raids/${raidId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['raids'] });
    },
    onError: (error: any) => {
      alert(error?.response?.data?.message || error?.message || 'Failed to delete raid');
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
        {(['active', 'history'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === f
                ? 'bg-gold-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {f === 'active' ? 'Active' : 'History'}
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
            <div
              key={raid.id}
              className="bg-gray-800 rounded-lg p-6 hover:bg-gray-700 transition-colors relative group"
            >
              {/* Delete button - only for leader on raids without completed auctions */}
              {raid.leader_id === user?.id && (raid.status === 'PENDING' || raid.status === 'CANCELLED') && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (confirm('Are you sure you want to delete this raid?')) {
                      deleteRaidMutation.mutate(raid.id);
                    }
                  }}
                  className="absolute top-2 right-2 p-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Delete raid"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}

              <Link to={`/raids/${raid.id}`} className="block">
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
                        : raid.status === 'COMPLETED'
                        ? 'bg-blue-500/20 text-blue-400'
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
                    <GoldDisplay amount={raid.pot_total} />
                  </div>
                  <div className="flex items-center space-x-1 text-gray-500">
                    <Calendar className="h-4 w-4" />
                    <span>{new Date(raid.created_at).toLocaleDateString()}</span>
                  </div>
                </div>

                <div className="mt-4 text-gray-400 text-sm">
                  <SimpleUserDisplay
                    user={raid.leader}
                    showAvatar
                    avatarSize={24}
                  />
                </div>
              </Link>
            </div>
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
  const [instance, setInstance] = useState<string>(WOW_INSTANCES[0]);
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
