import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/client';
import { useAuthStore } from '../stores/authStore';
import { User, Mail, Check, X } from 'lucide-react';

export function Profile() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [paypalEmail, setPaypalEmail] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ['user', 'profile'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (email: string | null) => {
      const res = await api.patch('/users/me', { paypal_email: email });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', 'profile'] });
      setIsEditing(false);
    },
  });

  const startEditing = () => {
    setPaypalEmail(profile?.paypal_email || '');
    setIsEditing(true);
  };

  const savePaypal = () => {
    updateMutation.mutate(paypalEmail || null);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-white">Profile</h1>

      {/* User info */}
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="flex items-center space-x-4 mb-6">
          {user?.discord_avatar ? (
            <img
              src={user.discord_avatar}
              alt={user.discord_username}
              className="w-20 h-20 rounded-full"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-gray-700 flex items-center justify-center">
              <User className="h-10 w-10 text-gray-500" />
            </div>
          )}
          <div>
            <h2 className="text-xl font-bold text-white">{user?.discord_username}</h2>
            <p className="text-gray-400">Discord ID: {user?.discord_id}</p>
            {user?.role === 'ADMIN' && (
              <span className="inline-block mt-1 px-2 py-1 bg-red-500/20 text-red-400 text-xs rounded">
                Admin
              </span>
            )}
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

      {/* PayPal settings */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
          <Mail className="h-5 w-5" />
          <span>PayPal Settings</span>
        </h3>

        <p className="text-gray-400 text-sm mb-4">
          Connect your PayPal email to enable withdrawals. Deposits work without linking PayPal.
        </p>

        {isEditing ? (
          <div className="space-y-4">
            <input
              type="email"
              value={paypalEmail}
              onChange={(e) => setPaypalEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-gold-500"
            />
            <div className="flex space-x-2">
              <button
                onClick={savePaypal}
                disabled={updateMutation.isPending}
                className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors"
              >
                <Check className="h-4 w-4" />
                <span>{updateMutation.isPending ? 'Saving...' : 'Save'}</span>
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="flex items-center space-x-2 bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors"
              >
                <X className="h-4 w-4" />
                <span>Cancel</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              {profile?.paypal_email ? (
                <div className="flex items-center space-x-2">
                  <Check className="h-5 w-5 text-green-500" />
                  <span className="text-white">{profile.paypal_email}</span>
                </div>
              ) : (
                <span className="text-gray-500">No PayPal email linked</span>
              )}
            </div>
            <button
              onClick={startEditing}
              className="text-gold-500 hover:text-gold-400 text-sm"
            >
              {profile?.paypal_email ? 'Edit' : 'Add PayPal'}
            </button>
          </div>
        )}
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
