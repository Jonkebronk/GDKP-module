import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { formatGold } from '@gdkp/shared';
import { Coins, Search, Plus, Minus, Check, AlertCircle } from 'lucide-react';

interface User {
  id: string;
  discord_username: string;
  discord_avatar: string | null;
  alias: string | null;
  gold_balance: number;
  role: string;
}

export function GoldManagement() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [isAdding, setIsAdding] = useState(true);
  const [successMessage, setSuccessMessage] = useState('');

  const { data: usersData, isLoading } = useQuery({
    queryKey: ['admin', 'users', search],
    queryFn: async () => {
      const res = await api.get('/admin/users', {
        params: { search: search || undefined, limit: 20 },
      });
      return res.data;
    },
  });

  const adjustMutation = useMutation({
    mutationFn: async (data: { user_id: string; amount: number; reason: string }) => {
      const res = await api.post('/admin/adjust-balance', data);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setSuccessMessage(`Balance updated! New balance: ${formatGold(data.new_balance)}`);
      setAmount('');
      setReason('');
      setSelectedUser(null);
      setTimeout(() => setSuccessMessage(''), 5000);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !amount || !reason) return;

    const adjustAmount = isAdding ? parseInt(amount) : -parseInt(amount);
    adjustMutation.mutate({
      user_id: selectedUser.id,
      amount: adjustAmount,
      reason,
    });
  };

  const getDisplayName = (user: User) => user.alias || user.discord_username;

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-3">
        <Coins className="h-8 w-8 text-amber-500" />
        <h1 className="text-2xl font-bold text-white">Gold Management</h1>
      </div>

      {/* Success Message */}
      {successMessage && (
        <div className="bg-green-500/20 border border-green-500/50 rounded-lg p-4 flex items-center space-x-2">
          <Check className="h-5 w-5 text-green-400" />
          <span className="text-green-400">{successMessage}</span>
        </div>
      )}

      {/* Error Message */}
      {adjustMutation.isError && (
        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 flex items-center space-x-2">
          <AlertCircle className="h-5 w-5 text-red-400" />
          <span className="text-red-400">
            {(adjustMutation.error as Error)?.message || 'Failed to adjust balance'}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User Search */}
        <div className="wow-tooltip wow-border-common">
          <div className="wow-tooltip-header p-3 border-b border-gray-700">
            <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wide">
              Select User
            </h2>
          </div>
          <div className="p-4 space-y-4">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by username or alias..."
                className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-10 pr-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {/* User List */}
            <div className="max-h-96 overflow-y-auto space-y-2">
              {isLoading ? (
                <div className="text-center text-gray-400 py-4">Loading...</div>
              ) : usersData?.users.length === 0 ? (
                <div className="text-center text-gray-400 py-4">No users found</div>
              ) : (
                usersData?.users.map((user: User) => (
                  <button
                    key={user.id}
                    onClick={() => setSelectedUser(user)}
                    className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors ${
                      selectedUser?.id === user.id
                        ? 'bg-amber-500/20 border border-amber-500/50'
                        : 'bg-gray-800 hover:bg-gray-700 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      {user.discord_avatar ? (
                        <img
                          src={`https://cdn.discordapp.com/avatars/${user.id.split('-')[0]}/${user.discord_avatar}.png`}
                          alt=""
                          className="w-8 h-8 rounded-full"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center">
                          <span className="text-gray-400 text-sm">
                            {getDisplayName(user)[0].toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div className="text-left">
                        <p className="text-white font-medium">{getDisplayName(user)}</p>
                        {user.alias && (
                          <p className="text-gray-500 text-xs">{user.discord_username}</p>
                        )}
                      </div>
                    </div>
                    <span className="text-amber-400 font-medium">
                      {formatGold(user.gold_balance)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Adjust Balance Form */}
        <div className="wow-tooltip wow-border-common">
          <div className="wow-tooltip-header p-3 border-b border-gray-700">
            <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wide">
              Adjust Balance
            </h2>
          </div>
          <div className="p-4">
            {selectedUser ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Selected User Info */}
                <div className="bg-gray-800 rounded-lg p-4">
                  <p className="text-gray-400 text-sm">Selected User</p>
                  <p className="text-white font-medium text-lg">{getDisplayName(selectedUser)}</p>
                  <p className="text-amber-400">
                    Current Balance: {formatGold(selectedUser.gold_balance)}
                  </p>
                </div>

                {/* Add/Remove Toggle */}
                <div className="flex space-x-2">
                  <button
                    type="button"
                    onClick={() => setIsAdding(true)}
                    className={`flex-1 flex items-center justify-center space-x-2 py-2 rounded-lg transition-colors ${
                      isAdding
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                    }`}
                  >
                    <Plus className="h-4 w-4" />
                    <span>Add Gold</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAdding(false)}
                    className={`flex-1 flex items-center justify-center space-x-2 py-2 rounded-lg transition-colors ${
                      !isAdding
                        ? 'bg-red-600 text-white'
                        : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                    }`}
                  >
                    <Minus className="h-4 w-4" />
                    <span>Remove Gold</span>
                  </button>
                </div>

                {/* Amount Input */}
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Amount</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="Enter amount..."
                      min="1"
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-amber-500">
                      g
                    </span>
                  </div>
                </div>

                {/* Reason Input */}
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Reason</label>
                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g., Test gold, compensation, etc."
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                {/* Preview */}
                {amount && (
                  <div className="bg-gray-800 rounded-lg p-3 text-center">
                    <p className="text-gray-400 text-sm">New Balance</p>
                    <p className={`text-2xl font-bold ${isAdding ? 'text-green-400' : 'text-red-400'}`}>
                      {formatGold(
                        selectedUser.gold_balance + (isAdding ? parseInt(amount) || 0 : -(parseInt(amount) || 0))
                      )}
                    </p>
                    <p className="text-gray-500 text-xs">
                      ({isAdding ? '+' : '-'}{formatGold(parseInt(amount) || 0)})
                    </p>
                  </div>
                )}

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={!amount || !reason || adjustMutation.isPending}
                  className={`w-full py-3 rounded-lg font-medium transition-colors ${
                    isAdding
                      ? 'bg-green-600 hover:bg-green-700 disabled:bg-gray-600'
                      : 'bg-red-600 hover:bg-red-700 disabled:bg-gray-600'
                  } text-white disabled:cursor-not-allowed`}
                >
                  {adjustMutation.isPending
                    ? 'Processing...'
                    : `${isAdding ? 'Add' : 'Remove'} ${amount ? formatGold(parseInt(amount)) : '0g'}`}
                </button>
              </form>
            ) : (
              <div className="text-center text-gray-400 py-12">
                <Coins className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Select a user to adjust their gold balance</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
