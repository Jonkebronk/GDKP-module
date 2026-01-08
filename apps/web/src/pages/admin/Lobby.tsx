import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@gdkp/shared';
import { api } from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
import { Users, Check, X, Clock, UserCircle } from 'lucide-react';

interface WaitingUser {
  id: string;
  discord_id: string;
  discord_username: string;
  discord_avatar: string | null;
  alias: string | null;
  updated_at: string;
}

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

function formatWaitTime(dateString: string): string {
  const waitingSince = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - waitingSince.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins === 1) return '1 minute';
  if (diffMins < 60) return `${diffMins} minutes`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours === 1) return '1 hour';
  return `${diffHours} hours`;
}

export function Lobby() {
  const queryClient = useQueryClient();
  const { token } = useAuthStore();
  const socketRef = useRef<TypedSocket | null>(null);

  // Fetch waiting users
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin', 'waiting-room'],
    queryFn: async () => {
      const res = await api.get('/admin/waiting-room');
      return res.data as { users: WaitingUser[] };
    },
    // Socket handles real-time updates via useQuerySocket hook
  });

  // Connect to socket for real-time updates
  useEffect(() => {
    if (!token) return;

    const socketUrl = import.meta.env.VITE_API_URL || window.location.origin;

    const socket: TypedSocket = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    // Listen for waiting room updates
    socket.on('waiting-room:updated', () => {
      refetch();
    });

    return () => {
      socket.disconnect();
    };
  }, [token, refetch]);

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await api.post(`/admin/approve/${userId}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'waiting-room'] });
    },
  });

  // Kick mutation
  const kickMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await api.post(`/admin/kick/${userId}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'waiting-room'] });
    },
  });

  const waitingUsers = data?.users || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Waiting Room</h1>
          <p className="text-gray-400 text-sm mt-1">
            Approve players to let them access the platform
          </p>
        </div>
        <div className="flex items-center space-x-2 text-gray-400">
          <Users className="h-5 w-5" />
          <span className="text-lg font-semibold">{waitingUsers.length}</span>
          <span className="text-sm">waiting</span>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="bg-gray-800 rounded-lg p-8">
          <div className="flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-gold-500"></div>
          </div>
        </div>
      ) : waitingUsers.length === 0 ? (
        <div className="bg-gray-800 rounded-lg p-12 text-center">
          <UserCircle className="h-16 w-16 text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">No one waiting</h3>
          <p className="text-gray-400">
            When players log in, they'll appear here for approval
          </p>
        </div>
      ) : (
        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <div className="divide-y divide-gray-700">
            {waitingUsers.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between px-6 py-4 hover:bg-gray-700/50 transition-colors"
              >
                {/* User info */}
                <div className="flex items-center space-x-4">
                  {/* Avatar */}
                  {user.discord_avatar ? (
                    <img
                      src={user.discord_avatar}
                      alt=""
                      className="h-12 w-12 rounded-full"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-full bg-gray-700 flex items-center justify-center">
                      <UserCircle className="h-8 w-8 text-gray-500" />
                    </div>
                  )}

                  {/* Names */}
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-white font-medium">
                        {user.discord_username}
                      </span>
                      {user.alias && (
                        <span className="text-gold-400 text-sm">
                          as "{user.alias}"
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-1 text-gray-500 text-sm">
                      <Clock className="h-3 w-3" />
                      <span>Waiting {formatWaitTime(user.updated_at)}</span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => approveMutation.mutate(user.id)}
                    disabled={approveMutation.isPending}
                    className="flex items-center space-x-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors"
                  >
                    <Check className="h-4 w-4" />
                    <span>Approve</span>
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Kick ${user.discord_username}?`)) {
                        kickMutation.mutate(user.id);
                      }
                    }}
                    disabled={kickMutation.isPending}
                    className="flex items-center space-x-1 bg-red-600/20 hover:bg-red-600/40 text-red-400 px-4 py-2 rounded-lg transition-colors"
                  >
                    <X className="h-4 w-4" />
                    <span>Kick</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info box */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
        <p className="text-gray-400 text-sm">
          Players automatically enter the waiting room after logging in with Discord.
          Once approved, they can access the platform for this session.
          Approval resets when they log out.
        </p>
      </div>
    </div>
  );
}
