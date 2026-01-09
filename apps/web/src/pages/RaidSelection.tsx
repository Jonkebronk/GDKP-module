import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { Swords, Users, LogIn, Check, Calendar } from 'lucide-react';
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

// Helper to get instances array from raid data (handles both old 'instance' and new 'instances' field)
const getInstances = (raid: any): string[] => {
  if (raid?.instances && Array.isArray(raid.instances) && raid.instances.length > 0) {
    return raid.instances;
  }
  if (raid?.instance) {
    return [raid.instance];
  }
  return [];
};

const getRaidBackground = (instances: string | string[] | undefined | null) => {
  if (!instances) return '';
  const instanceList = Array.isArray(instances) ? instances : [instances];
  return raidBackgrounds[instanceList[0]] || '';
};

const formatInstances = (instances: string | string[] | undefined | null) => {
  if (!instances) return 'Unknown';
  const instanceList = Array.isArray(instances) ? instances : [instances];
  return instanceList.length > 0 ? instanceList.join(' + ') : 'Unknown';
};

export function RaidSelection() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const { data: activeRaids, isLoading } = useQuery<ActiveRaid[]>({
    queryKey: ['raids', 'active'],
    queryFn: async () => {
      const res = await api.get('/raids?status=ACTIVE,PENDING');
      return res.data;
    },
    refetchInterval: 10000, // Refresh every 10 seconds
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

  const isInRaid = (raid: ActiveRaid) => {
    return raid.participants?.some((p) => p.user_id === user?.id);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-white mb-2">Active Raids</h1>
        <p className="text-gray-400">Select a raid to join</p>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mx-auto mb-4" />
          <p className="text-gray-400">Loading raids...</p>
        </div>
      )}

      {/* No raids state */}
      {!isLoading && (!activeRaids || activeRaids.length === 0) && (
        <div className="text-center py-12 bg-gray-800 rounded-lg">
          <Calendar className="h-16 w-16 text-gray-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">No Active Raids</h2>
          <p className="text-gray-400">
            There are no raids available right now.<br />
            Please wait for a raid leader to start a session.
          </p>
        </div>
      )}

      {/* Raid list */}
      {activeRaids && activeRaids.length > 0 && (
        <div className="space-y-4">
          {activeRaids.map((raid) => {
            const inRaid = isInRaid(raid);
            const bgImage = getRaidBackground(getInstances(raid));

            return (
              <div
                key={raid.id}
                className="rounded-lg overflow-hidden relative"
                style={{
                  backgroundImage: bgImage ? `url(${bgImage})` : undefined,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  minHeight: '120px',
                }}
              >
                {/* Dark overlay */}
                <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/70 to-black/60" />

                {/* Content */}
                <div className="relative p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <Swords className="h-12 w-12 text-purple-400" />
                      <div>
                        <h3 className="text-xl font-bold text-white drop-shadow-lg">{raid.name}</h3>
                        <p className="text-gray-300 flex items-center space-x-2 drop-shadow-md">
                          <span>{formatInstances(getInstances(raid))}</span>
                          <span>•</span>
                          <Users className="h-4 w-4" />
                          <span>{raid.participant_count} players</span>
                          {raid.status === 'ACTIVE' && (
                            <>
                              <span>•</span>
                              <span className="text-green-400 font-medium">LIVE</span>
                            </>
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Join/Joined button */}
                    {inRaid ? (
                      <Link
                        to={`/raids/${raid.id}`}
                        className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors shadow-lg"
                      >
                        <Check className="h-5 w-5" />
                        <span>Enter Raid</span>
                      </Link>
                    ) : (
                      <button
                        onClick={() => joinRaidMutation.mutate(raid.id)}
                        disabled={joinRaidMutation.isPending}
                        className="flex items-center space-x-2 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-600 text-white font-semibold px-6 py-3 rounded-lg transition-colors shadow-lg"
                      >
                        <LogIn className="h-5 w-5" />
                        <span>{joinRaidMutation.isPending ? 'Joining...' : 'Join Raid'}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
