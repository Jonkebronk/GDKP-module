import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { KeyRound } from 'lucide-react';
import { api } from '../api/client';

export function LoginPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, checkAuth } = useAuthStore();
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState('');
  const [isValidating, setIsValidating] = useState(false);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  const handleKeyClick = () => {
    setShowInput(true);
    setError('');
  };

  const handleUnlock = async () => {
    if (!passphrase.trim()) {
      setError('Enter the passphrase');
      return;
    }

    setIsValidating(true);
    setError('');

    try {
      const res = await api.post('/auth/gate', { passphrase: passphrase.trim() });
      if (res.data.success) {
        setIsUnlocked(true);
        setShowInput(false);
      } else {
        setError('Wrong passphrase');
      }
    } catch {
      setError('Failed to validate');
    } finally {
      setIsValidating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleUnlock();
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-amber-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black px-4">
      <div className="max-w-md w-full space-y-8 text-center">
        {/* Logo */}
        <div>
          <img
            src="/gnome-logo.png"
            alt="GDKP"
            className="mx-auto h-48 w-48 rounded-full object-cover"
          />
        </div>

        {/* Gate Section */}
        {!isUnlocked && !showInput && (
          <div className="space-y-6">
            {/* Golden Key */}
            <button
              onClick={handleKeyClick}
              className="group relative mx-auto block"
            >
              <div className="absolute inset-0 rounded-full bg-amber-500/20 blur-xl group-hover:bg-amber-400/30 transition-all duration-500 animate-pulse"></div>
              <KeyRound
                className="relative h-16 w-16 text-amber-500 group-hover:text-amber-400 group-hover:scale-110 transition-all duration-300 drop-shadow-[0_0_15px_rgba(245,158,11,0.5)]"
              />
            </button>
          </div>
        )}

        {/* Password Input */}
        {!isUnlocked && showInput && (
          <div className="space-y-4 animate-fadeIn">
            <div className="relative">
              <input
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter passphrase..."
                autoFocus
                className="w-full bg-black/50 border-2 border-amber-500/50 rounded-lg px-4 py-3 text-amber-100 placeholder-amber-600/50 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-500/30 transition-all"
              />
            </div>

            {error && (
              <p className="text-red-400 text-sm">{error}</p>
            )}

            <button
              onClick={handleUnlock}
              disabled={isValidating}
              className="w-full bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 disabled:from-gray-600 disabled:to-gray-700 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300 shadow-lg shadow-amber-900/50 hover:shadow-amber-800/60"
            >
              {isValidating ? 'Validating...' : 'Unlock'}
            </button>

            <button
              onClick={() => { setShowInput(false); setPassphrase(''); setError(''); }}
              className="text-amber-600/60 hover:text-amber-500 text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Discord Login Button - shown after unlock */}
        {isUnlocked && (
          <div className="animate-fadeIn">
            <a
              href={`${import.meta.env.VITE_API_URL || ''}/api/auth/discord`}
              className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-[#5865F2] hover:bg-[#4752C4] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#5865F2] transition-colors"
            >
              <svg
                className="mr-2 h-5 w-5"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
              </svg>
              Login with Discord
            </a>
          </div>
        )}

        {/* Fight Club Quote */}
        <p className="text-amber-500 text-sm italic">
          The first rule of Fight Club is: You do not talk about Fight Club
        </p>
      </div>

      {/* Custom animation styles */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.4s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
