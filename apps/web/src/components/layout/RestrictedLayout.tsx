import { Outlet, Link } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { getDisplayName } from '@gdkp/shared';
import { LogOut } from 'lucide-react';
import gnomeLogo from '../../assets/gnome-logo.png';

export function RestrictedLayout() {
  const { user, logout } = useAuthStore();

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Minimal Header */}
      <header className="sticky top-0 z-50 bg-black border-b border-gray-700" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/raids-select" className="flex items-center">
              <img src={gnomeLogo} alt="Logo" className="h-8 w-8 rounded-full object-cover" />
            </Link>

            {/* User info + Logout */}
            <div className="flex items-center space-x-3">
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
                className="flex items-center space-x-1 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded-md transition-colors"
                title="Logout"
              >
                <LogOut className="h-4 w-4" />
                <span className="text-sm font-medium">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
    </div>
  );
}
