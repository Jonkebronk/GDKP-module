import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { formatGold, getDisplayName } from '@gdkp/shared';
import {
  Home,
  Wallet,
  Swords,
  User,
  LogOut,
  Menu,
  X,
  Package,
  Shield,
  Coins,
} from 'lucide-react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';

const navItems = [
  { path: '/', label: 'Dashboard', icon: Home },
  { path: '/wallet', label: 'Wallet', icon: Wallet },
  { path: '/raids', label: 'Raids', icon: Swords },
  { path: '/items', label: 'Items', icon: Package },
  { path: '/profile', label: 'Profile', icon: User },
];

const adminNavItems = [
  { path: '/admin/gold', label: 'Gold', icon: Coins, color: 'gold' },
  { path: '/admin/aliases', label: 'Aliases', icon: Shield, color: 'green' },
];

export function MainLayout() {
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const { data: walletData } = useQuery({
    queryKey: ['wallet', 'balance'],
    queryFn: async () => {
      const res = await api.get('/wallet/balance');
      return res.data;
    },
    refetchInterval: 30000,
  });

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-black border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center space-x-2">
              <img src="/gnome-logo.png" alt="GDKP" className="h-8 w-8 rounded-full object-cover" />
              <span className="text-xl font-bold text-white">GDKP</span>
            </Link>

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center space-x-4">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-gray-700 text-gold-500'
                        : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
              {/* Admin nav items */}
              {user?.role === 'ADMIN' && (
                <>
                  <div className="w-px h-6 bg-gray-700" />
                  {adminNavItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = location.pathname === item.path;
                    const colorClasses = item.color === 'gold'
                      ? isActive ? 'bg-amber-500/20 text-amber-400' : 'text-amber-400/70 hover:bg-amber-500/10 hover:text-amber-400'
                      : isActive ? 'bg-green-500/20 text-green-400' : 'text-green-400/70 hover:bg-green-500/10 hover:text-green-400';
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${colorClasses}`}
                      >
                        <Icon className="h-4 w-4" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </>
              )}
            </nav>

            {/* User info */}
            <div className="flex items-center space-x-4">
              {/* Gold balance */}
              <div className="hidden sm:flex items-center space-x-2 bg-gray-700 px-3 py-1.5 rounded-full">
                <span className="text-gold-500 font-semibold">
                  {walletData ? formatGold(walletData.balance) : '...'}
                </span>
              </div>

              {/* User avatar */}
              <div className="flex items-center space-x-2">
                <img
                  src="/anonymous-avatar.png"
                  alt={user ? getDisplayName(user) : ''}
                  className="h-8 w-8 rounded-full object-cover"
                />
                <span className="hidden sm:inline text-sm text-white font-semibold">
                  {user ? getDisplayName(user) : ''}
                </span>
              </div>

              {/* Logout */}
              <button
                onClick={logout}
                className="p-2 text-gray-400 hover:text-white transition-colors"
                title="Logout"
              >
                <LogOut className="h-5 w-5" />
              </button>

              {/* Mobile menu button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 text-gray-400 hover:text-white"
              >
                {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile nav */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-gray-700">
            <div className="px-2 pt-2 pb-3 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center space-x-2 px-3 py-2 rounded-md text-base font-medium ${
                      isActive
                        ? 'bg-gray-700 text-gold-500'
                        : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}

              {/* Admin nav items (mobile) */}
              {user?.role === 'ADMIN' && (
                <>
                  <div className="border-t border-gray-700 my-2" />
                  {adminNavItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = location.pathname === item.path;
                    const colorClasses = item.color === 'gold'
                      ? isActive ? 'bg-amber-500/20 text-amber-400' : 'text-amber-400/70 hover:bg-amber-500/10 hover:text-amber-400'
                      : isActive ? 'bg-green-500/20 text-green-400' : 'text-green-400/70 hover:bg-green-500/10 hover:text-green-400';
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`flex items-center space-x-2 px-3 py-2 rounded-md text-base font-medium ${colorClasses}`}
                      >
                        <Icon className="h-5 w-5" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </>
              )}

              {/* Mobile gold balance */}
              <div className="sm:hidden px-3 py-2 text-gold-500 font-semibold">
                Balance: {walletData ? formatGold(walletData.balance) : '...'}
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
    </div>
  );
}
