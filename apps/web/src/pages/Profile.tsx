import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuthStore } from '../stores/authStore';
import { getDisplayName } from '@gdkp/shared';
import { User } from 'lucide-react';

export function Profile() {
  const { user } = useAuthStore();

  const { data: profile } = useQuery({
    queryKey: ['user', 'profile'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    },
  });

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-white">Profile</h1>

      {/* User info */}
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="flex items-center space-x-4 mb-6">
          <img
            src="/anonymous-avatar.png"
            alt={user ? getDisplayName(user) : ''}
            className="w-20 h-20 rounded-full"
          />
          <div>
            <h2 className="text-xl font-bold text-white">{user ? getDisplayName(user) : ''}</h2>
            {user?.role === 'ADMIN' && (
              <span className="inline-block mt-1 px-2 py-1 bg-red-500/20 text-red-400 text-xs rounded">
                Admin
              </span>
            )}
          </div>
        </div>

        {/* Alias section */}
        <div className="border-t border-gray-700 pt-6 mb-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
            <User className="h-5 w-5" />
            <span>Player ID</span>
          </h3>

          <p className="text-gray-400 text-sm mb-4">
            Your unique player identifier. This is shown to other users instead of your Discord name.
          </p>

          <div className="bg-gray-700/50 rounded-lg px-4 py-3">
            <span className="text-gold-400 font-mono text-lg">{user?.alias || 'Loading...'}</span>
          </div>
        </div>

        <div className="border-t border-gray-700 pt-6">
          <h3 className="text-lg font-semibold text-white mb-4">Account Details</h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Member Since</label>
              <p className="text-white">
                {profile?.created_at
                  ? new Date(profile.created_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })
                  : '...'}
              </p>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">User ID</label>
              <p className="text-white font-mono text-sm">{user?.id}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Danger zone */}
      <div className="bg-gray-800 rounded-lg p-6 border border-red-500/20">
        <h3 className="text-lg font-semibold text-red-500 mb-4">Danger Zone</h3>
        <p className="text-gray-400 text-sm mb-4">
          Once you delete your account, there is no going back. Please be certain.
        </p>
        <button
          disabled
          className="bg-red-600/20 text-red-500 px-4 py-2 rounded-lg cursor-not-allowed opacity-50"
        >
          Delete Account (Coming Soon)
        </button>
      </div>
    </div>
  );
}
