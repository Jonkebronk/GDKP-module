import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/client';
import { useAuthStore } from '../stores/authStore';
import { getDisplayName } from '@gdkp/shared';
import { User, Check, X, AlertCircle, Edit2 } from 'lucide-react';

const ALIAS_REGEX = /^[a-zA-Z0-9_-]+$/;

export function Profile() {
  const { user, updateAlias } = useAuthStore();
  const [newAlias, setNewAlias] = useState('');
  const [isEditingAlias, setIsEditingAlias] = useState(false);
  const [aliasError, setAliasError] = useState('');
  const [aliasLoading, setAliasLoading] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ['user', 'profile'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    },
  });

  const startEditingAlias = () => {
    setNewAlias(user?.alias || '');
    setIsEditingAlias(true);
    setAliasError('');
  };

  const saveAlias = async () => {
    const trimmed = newAlias.trim();
    if (trimmed.length < 2) {
      setAliasError('Alias must be at least 2 characters');
      return;
    }
    if (trimmed.length > 32) {
      setAliasError('Alias must be at most 32 characters');
      return;
    }
    if (!ALIAS_REGEX.test(trimmed)) {
      setAliasError('Alias can only contain letters, numbers, underscores, and hyphens');
      return;
    }

    setAliasLoading(true);
    try {
      await updateAlias(trimmed);
      setIsEditingAlias(false);
      setAliasError('');
    } catch {
      setAliasError('Failed to update alias. Please try again.');
    } finally {
      setAliasLoading(false);
    }
  };

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
            <span>Display Name (Alias)</span>
          </h3>

          <p className="text-gray-400 text-sm mb-4">
            This is the name shown to other users. Your Discord identity is hidden.
          </p>

          {aliasError && (
            <div className="flex items-center space-x-2 text-red-400 text-sm mb-4">
              <AlertCircle className="h-4 w-4" />
              <span>{aliasError}</span>
            </div>
          )}

          {isEditingAlias ? (
            <div className="space-y-4">
              <input
                type="text"
                value={newAlias}
                onChange={(e) => setNewAlias(e.target.value)}
                placeholder="Enter your alias..."
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-gold-500"
                maxLength={32}
                autoFocus
              />
              <p className="text-gray-500 text-xs">
                2-32 characters. Letters, numbers, underscores, and hyphens only.
              </p>
              <div className="flex space-x-2">
                <button
                  onClick={saveAlias}
                  disabled={aliasLoading}
                  className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  <Check className="h-4 w-4" />
                  <span>{aliasLoading ? 'Saving...' : 'Save'}</span>
                </button>
                <button
                  onClick={() => setIsEditingAlias(false)}
                  className="flex items-center space-x-2 bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  <X className="h-4 w-4" />
                  <span>Cancel</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="text-white font-medium">
                {user?.alias || <span className="text-gray-500">Not set</span>}
              </div>
              <button
                onClick={startEditingAlias}
                className="flex items-center space-x-1 text-gold-500 hover:text-gold-400 text-sm"
              >
                <Edit2 className="h-4 w-4" />
                <span>Change</span>
              </button>
            </div>
          )}
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
