import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@gdkp/shared';
import { useAuthStore } from '../stores/authStore';
import { api } from '../api/client';
import { GoldDisplay } from '../components/GoldDisplay';
import { Clock, User, LogOut, Coins, Send } from 'lucide-react';

interface GoldReport {
  id: string;
  reported_amount: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  created_at: string;
}

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function WaitingRoomPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, token, updateSessionStatus, logout } = useAuthStore();
  const [kickMessage, setKickMessage] = useState<string | null>(null);
  const [goldReportAmount, setGoldReportAmount] = useState('');
  const socketRef = useRef<TypedSocket | null>(null);

  // Fetch pending gold report
  const { data: goldReportData } = useQuery<{ report: GoldReport | null }>({
    queryKey: ['user', 'gold-report'],
    queryFn: async () => {
      const res = await api.get('/users/me/gold-report');
      return res.data;
    },
  });

  // Submit gold report mutation
  const submitGoldReportMutation = useMutation({
    mutationFn: async (amount: number) => {
      const res = await api.post('/users/me/gold-report', { amount });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', 'gold-report'] });
      setGoldReportAmount('');
    },
  });

  const handleSubmitGoldReport = () => {
    const amount = parseInt(goldReportAmount, 10);
    if (!isNaN(amount) && amount > 0) {
      submitGoldReportMutation.mutate(amount);
    }
  };

  // Connect to socket for session events
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

    // Listen for approval
    socket.on('session:approved', async () => {
      updateSessionStatus('APPROVED');
      // Refresh auth data to get latest gold balance and role
      await useAuthStore.getState().checkAuth();
      // Navigate based on role - admins to dashboard, users to raid selection
      const user = useAuthStore.getState().user;
      navigate(user?.role === 'ADMIN' ? '/' : '/raids-select');
    });

    // Listen for wallet updates (when gold report is approved while waiting)
    socket.on('wallet:updated', (data) => {
      useAuthStore.getState().updateWallet(data.balance, data.locked_amount);
    });

    // Listen for kick
    socket.on('session:kicked', (data) => {
      setKickMessage(data.message);
      setTimeout(() => {
        logout();
        navigate('/login');
      }, 3000);
    });

    return () => {
      socket.disconnect();
    };
  }, [token, navigate, updateSessionStatus, logout]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // Show kick message if kicked
  if (kickMessage) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 px-4">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="text-red-500 text-6xl">:(</div>
          <h1 className="text-2xl font-bold text-white">Access Denied</h1>
          <p className="text-gray-400">{kickMessage}</p>
          <p className="text-gray-500 text-sm">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 px-4">
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <img
            src="/gnome-logo.png"
            alt="Logo"
            className="mx-auto h-20 w-20 rounded-full object-cover"
          />
          <h1 className="mt-6 text-3xl font-bold text-white">Welcome</h1>
          <p className="mt-2 text-gray-400">
            Waiting for admin approval to enter...
          </p>
        </div>

        {/* Waiting state content */}
        <div className="space-y-6">
          {/* Player ID display */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 text-center">
            <div className="flex items-center justify-center space-x-2 mb-4">
              <User className="h-5 w-5 text-gold-500" />
              <span className="text-gray-400">Your Player ID:</span>
            </div>
            <p className="text-2xl font-bold text-gold-400 font-mono">{user?.alias || 'Loading...'}</p>
          </div>

          {/* Gold Report Card */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
            <div className="flex items-center space-x-2 mb-4">
              <Coins className="h-5 w-5 text-amber-400" />
              <span className="text-amber-400 font-semibold text-sm">Report Gold Balance</span>
            </div>
            {goldReportData?.report ? (
              <div className="flex items-center justify-center space-x-3">
                <Clock className="h-5 w-5 text-amber-400 animate-pulse" />
                <div className="text-center">
                  <p className="text-amber-400 text-sm">Pending approval</p>
                  <GoldDisplay amount={goldReportData.report.reported_amount} iconSize={16} className="text-white font-semibold" />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-gray-400 text-sm text-center">
                  Report your in-game gold so the admin can pre-add it to your wallet
                </p>
                <div className="flex items-center justify-center space-x-2">
                  <input
                    type="number"
                    value={goldReportAmount}
                    onChange={(e) => setGoldReportAmount(e.target.value)}
                    placeholder="Gold amount..."
                    className="w-32 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-gold-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    min="1"
                  />
                  <button
                    onClick={handleSubmitGoldReport}
                    disabled={submitGoldReportMutation.isPending || !goldReportAmount}
                    className="flex items-center space-x-1 bg-gold-600 hover:bg-gold-700 disabled:bg-gray-600 text-white text-sm font-medium px-4 py-2 rounded transition-colors"
                  >
                    <Send className="h-4 w-4" />
                    <span>{submitGoldReportMutation.isPending ? '...' : 'Submit'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Waiting animation */}
          <div className="bg-gray-800/50 border border-amber-500/30 rounded-lg p-6">
            <div className="flex flex-col items-center space-y-4">
              <div className="relative">
                <Clock className="h-12 w-12 text-amber-500 animate-pulse" />
              </div>
              <div className="text-center">
                <p className="text-white font-medium">Waiting for approval</p>
                <p className="text-gray-400 text-sm mt-1">
                  An admin will let you in shortly
                </p>
              </div>
              {/* Loading dots */}
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          </div>
        </div>

        {/* Logout button */}
        <div className="text-center">
          <button
            onClick={handleLogout}
            className="inline-flex items-center space-x-2 text-gray-500 hover:text-gray-300 transition-colors text-sm"
          >
            <LogOut className="h-4 w-4" />
            <span>Leave waiting room</span>
          </button>
        </div>
      </div>
    </div>
  );
}
