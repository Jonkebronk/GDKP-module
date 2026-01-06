import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { Swords } from 'lucide-react';

export function LoginPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-gold-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 px-4">
      <div className="max-w-md w-full space-y-8">
        {/* Logo */}
        <div className="text-center">
          <Swords className="mx-auto h-16 w-16 text-gold-500" />
          <h1 className="mt-6 text-4xl font-bold text-white">GDKP Platform</h1>
          <p className="mt-2 text-gray-400">
            Real-time auction platform for WoW raids
          </p>
        </div>

        {/* Features */}
        <div className="bg-gray-800 rounded-lg p-6 space-y-4">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0 h-6 w-6 rounded-full bg-gold-500/20 flex items-center justify-center">
              <span className="text-gold-500 text-sm">1</span>
            </div>
            <div>
              <h3 className="text-white font-medium">Live Auctions</h3>
              <p className="text-gray-400 text-sm">
                Real-time bidding with anti-snipe protection
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0 h-6 w-6 rounded-full bg-gold-500/20 flex items-center justify-center">
              <span className="text-gold-500 text-sm">2</span>
            </div>
            <div>
              <h3 className="text-white font-medium">Automatic Pot Split</h3>
              <p className="text-gray-400 text-sm">
                Fair distribution based on configurable rules
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0 h-6 w-6 rounded-full bg-gold-500/20 flex items-center justify-center">
              <span className="text-gold-500 text-sm">3</span>
            </div>
            <div>
              <h3 className="text-white font-medium">Integrated Wallet</h3>
              <p className="text-gray-400 text-sm">
                Deposit and withdraw via PayPal
              </p>
            </div>
          </div>
        </div>

        {/* Discord Login Button */}
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

        <p className="text-center text-gray-500 text-sm">
          By logging in, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  );
}
