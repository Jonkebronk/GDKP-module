import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { getDisplayName } from '@gdkp/shared';
import { GoldDisplay } from '../GoldDisplay';
import {
  Home,
  Swords,
  User,
  LogOut,
  Menu,
  X,
  Package,
  Shield,
  Coins,
  History,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import gnomeLogo from '../../assets/gnome-logo.png';
import anonymousAvatar from '../../assets/anonymous-avatar.png';

const navItems = [
  { path: '/', label: 'Dashboard', icon: Home },
  { path: '/items', label: 'Items', icon: Package },
  { path: '/raid-history', label: 'History', icon: History },
  { path: '/profile', label: 'Profile', icon: User },
];

const adminNavItems = [
  { path: '/admin/lobby', label: 'Lobby', icon: Users, color: 'blue' },
  { path: '/raids', label: 'Raids', icon: Swords, color: 'purple' },
  { path: '/admin/gold', label: 'Gold', icon: Coins, color: 'gold' },
  { path: '/admin/aliases', label: 'Aliases', icon: Shield, color: 'green' },
];

export function MainLayout() {
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-black border-b border-gray-700" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center mr-6">
              <img src={gnomeLogo} alt="Logo" className="h-8 w-8 rounded-full object-cover" />
            </Link>

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center space-x-1 flex-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center space-x-1.5 px-2 py-1.5 rounded-md text-sm font-medium transition-colors ${
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
                      : item.color === 'purple'
                      ? isActive ? 'bg-purple-500/20 text-purple-400' : 'text-purple-400/70 hover:bg-purple-500/10 hover:text-purple-400'
                      : item.color === 'blue'
                      ? isActive ? 'bg-blue-500/20 text-blue-400' : 'text-blue-400/70 hover:bg-blue-500/10 hover:text-blue-400'
                      : isActive ? 'bg-green-500/20 text-green-400' : 'text-green-400/70 hover:bg-green-500/10 hover:text-green-400';
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        className={`flex items-center space-x-1.5 px-2 py-1.5 rounded-md text-sm font-medium transition-colors ${colorClasses}`}
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
            <div className="flex items-center space-x-2">
              {/* Gold balance */}
              <div className="hidden sm:flex items-center px-2 py-1">
                <GoldDisplay amount={user?.gold_balance || 0} className="text-amber-400 font-semibold" iconSize={14} />
              </div>

              {/* User avatar */}
              <div className="flex items-center space-x-2">
                <img
                  src={anonymousAvatar}
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
                    className={`flex items-center space-x-2 px-3 py-2 rounded-md text-base font-semibold ${
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
                      : item.color === 'purple'
                      ? isActive ? 'bg-purple-500/20 text-purple-400' : 'text-purple-400/70 hover:bg-purple-500/10 hover:text-purple-400'
                      : item.color === 'blue'
                      ? isActive ? 'bg-blue-500/20 text-blue-400' : 'text-blue-400/70 hover:bg-blue-500/10 hover:text-blue-400'
                      : isActive ? 'bg-green-500/20 text-green-400' : 'text-green-400/70 hover:bg-green-500/10 hover:text-green-400';
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`flex items-center space-x-2 px-3 py-2 rounded-md text-base font-semibold ${colorClasses}`}
                      >
                        <Icon className="h-5 w-5" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </>
              )}

              {/* Mobile gold balance */}
              <div className="sm:hidden px-3 py-2 text-amber-400 font-semibold flex items-center space-x-1">
                <span>Balance:</span>
                <GoldDisplay amount={user?.gold_balance || 0} className="text-amber-400 font-semibold" iconSize={14} />
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Main content */}
      <main className="max-w-[2000px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
    </div>
  );
}
