import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@gdkp/shared';
import { useAuthStore } from '../stores/authStore';
import { api } from '../api/client';
import { GoldDisplay } from '../components/GoldDisplay';
import { Clock, User, AlertCircle, Check, LogOut, Coins, Send } from 'lucide-react';

interface GoldReport {
  id: string;
  reported_amount: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  created_at: string;
}

const ALIAS_REGEX = /^[a-zA-Z0-9_-]+$/;

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function WaitingRoomPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, token, updateAlias, updateSessionStatus, logout } = useAuthStore();
  const [alias, setAlias] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [aliasSaved, setAliasSaved] = useState(false);
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
    socket.on('session:approved', () => {
      updateSessionStatus('APPROVED');
      navigate('/');
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

  const validateAlias = (value: string): string | null => {
    if (value.length < 2) {
      return 'Alias must be at least 2 characters';
    }
    if (value.length > 32) {
      return 'Alias must be at most 32 characters';
    }
    if (!ALIAS_REGEX.test(value)) {
      return 'Alias can only contain letters, numbers, underscores, and hyphens';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationError = validateAlias(alias);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      await updateAlias(alias);
      setAliasSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set alias');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const isValid = alias.length >= 2 && alias.length <= 32 && ALIAS_REGEX.test(alias);
  const currentAlias = user?.alias || alias;
  const hasAlias = aliasSaved || !!user?.alias;

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
            {hasAlias
              ? 'Waiting for admin approval to enter...'
              : 'Pick your alias for this session'}
          </p>
        </div>

        {/* Alias Form - show if no alias yet */}
        {!hasAlias ? (
          <>
            {/* Info Box */}
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <User className="h-5 w-5 text-gold-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-gray-300">
                  <p>
                    Your Discord identity (<span className="text-gold-400">{user?.discord_username}</span>) will remain private.
                    Only administrators can see your real Discord name.
                  </p>
                </div>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="alias" className="block text-sm font-medium text-gray-300 mb-2">
                  Display Name
                </label>
                <div className="relative">
                  <input
                    id="alias"
                    type="text"
                    value={alias}
                    onChange={(e) => {
                      setAlias(e.target.value);
                      setError('');
                    }}
                    placeholder="Enter your alias..."
                    className={`
                      w-full px-4 py-3 bg-gray-800 border rounded-lg text-white placeholder-gray-500
                      focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent
                      ${error ? 'border-red-500' : 'border-gray-700'}
                    `}
                    maxLength={32}
                    autoFocus
                  />
                  {isValid && (
                    <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-green-500" />
                  )}
                </div>

                {/* Character count */}
                <div className="mt-1 flex justify-between text-xs text-gray-500">
                  <span>2-32 characters, letters, numbers, _ -</span>
                  <span className={alias.length > 32 ? 'text-red-500' : ''}>
                    {alias.length}/32
                  </span>
                </div>

                {/* Error message */}
                {error && (
                  <div className="mt-2 flex items-center space-x-2 text-red-400 text-sm">
                    <AlertCircle className="h-4 w-4" />
                    <span>{error}</span>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={!isValid || isSubmitting}
                className={`
                  w-full py-3 px-4 rounded-lg font-medium transition-colors
                  ${isValid && !isSubmitting
                    ? 'bg-gold-500 hover:bg-gold-600 text-gray-900'
                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  }
                `}
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-gray-900 mr-2"></div>
                    Saving...
                  </span>
                ) : (
                  'Save Alias'
                )}
              </button>
            </form>
          </>
        ) : (
          /* Waiting state - alias is set */
          <div className="space-y-6">
            {/* Current alias display */}
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 text-center">
              <div className="flex items-center justify-center space-x-2 mb-4">
                <User className="h-5 w-5 text-gold-500" />
                <span className="text-gray-400">Your alias:</span>
              </div>
              <p className="text-2xl font-bold text-gold-400">{currentAlias}</p>
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
        )}

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
