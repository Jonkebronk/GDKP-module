import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { formatGold } from '@gdkp/shared';
import { useAuthStore } from '../stores/authStore';
import { Wallet as WalletIcon, ArrowDownLeft, ArrowUpRight, RefreshCw, Bitcoin, AlertCircle, CheckCircle, TrendingUp, ExternalLink, Settings, Save, X } from 'lucide-react';

export function Wallet() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [depositAmount, setDepositAmount] = useState('');
  const [depositCurrency] = useState<'USD'>('USD');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Exchange rate editing (admin only)
  const [rateEditorOpen, setRateEditorOpen] = useState(false);
  const [editRate, setEditRate] = useState('');

  const isAdmin = user?.role === 'ADMIN';

  // Handle redirect from Coinbase
  useEffect(() => {
    const status = searchParams.get('status');
    if (status === 'success') {
      setStatusMessage({
        type: 'info',
        message: 'Payment initiated! Your gold will be credited once the blockchain confirms the transaction.',
      });
      setSearchParams({});
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['user', 'transactions'] });
    } else if (status === 'cancelled') {
      setStatusMessage({
        type: 'error',
        message: 'Payment was cancelled.',
      });
      setSearchParams({});
    }
  }, [searchParams, setSearchParams, queryClient]);

  const { data: walletData, isLoading } = useQuery({
    queryKey: ['wallet', 'balance'],
    queryFn: async () => {
      const res = await api.get('/wallet/balance');
      return res.data;
    },
  });

  const { data: exchangeRates } = useQuery({
    queryKey: ['wallet', 'exchange-rates'],
    queryFn: async () => {
      const res = await api.get('/wallet/exchange-rates');
      return res.data;
    },
  });

  const { data: transactions } = useQuery({
    queryKey: ['user', 'transactions'],
    queryFn: async () => {
      const res = await api.get('/users/me/transactions?limit=20');
      return res.data;
    },
  });

  const depositMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/wallet/deposit', {
        amount: parseFloat(depositAmount),
        currency: depositCurrency,
      });
      return res.data;
    },
    onSuccess: (data) => {
      // Redirect to Coinbase Commerce checkout
      window.location.href = data.checkout_url;
    },
    onError: () => {
      setStatusMessage({
        type: 'error',
        message: 'Failed to create payment. Please try again.',
      });
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/wallet/withdraw', {
        gold_amount: parseInt(withdrawAmount),
      });
      return res.data;
    },
    onSuccess: (data) => {
      setWithdrawAmount('');
      setStatusMessage({
        type: 'success',
        message: `Withdrawal request submitted! $${data.real_amount.toFixed(2)} USD will be sent to your wallet address.`,
      });
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['user', 'transactions'] });
    },
    onError: (error: any) => {
      setStatusMessage({
        type: 'error',
        message: error.response?.data?.message || 'Withdrawal failed. Make sure you have a wallet address configured in your profile.',
      });
    },
  });

  // Admin: Update exchange rates
  const updateRatesMutation = useMutation({
    mutationFn: async (rates: { SEK: number; EUR: number; USD: number }) => {
      const res = await api.put('/admin/exchange-rates', rates);
      return res.data;
    },
    onSuccess: () => {
      setRateEditorOpen(false);
      setStatusMessage({
        type: 'success',
        message: 'Exchange rates updated successfully!',
      });
      queryClient.invalidateQueries({ queryKey: ['wallet', 'exchange-rates'] });
    },
    onError: () => {
      setStatusMessage({
        type: 'error',
        message: 'Failed to update exchange rates.',
      });
    },
  });

  const handleSaveRates = () => {
    const usdPer1000g = parseFloat(editRate);

    if (isNaN(usdPer1000g) || usdPer1000g <= 0) {
      setStatusMessage({
        type: 'error',
        message: 'Please enter a valid positive number.',
      });
      return;
    }

    // Convert to gold per currency (internal format)
    const usd = 1000 / usdPer1000g;

    // Keep existing SEK/EUR rates or use derived values
    const sek = exchangeRates?.SEK || usd;
    const eur = exchangeRates?.EUR || usd;

    updateRatesMutation.mutate({ SEK: sek, EUR: eur, USD: usd });
  };

  const openRateEditor = () => {
    setEditRate(exchangeRates?.USD ? (1000 / exchangeRates.USD).toFixed(2) : '');
    setRateEditorOpen(true);
  };

  const goldPreview = exchangeRates && depositAmount
    ? Math.floor(parseFloat(depositAmount) * exchangeRates[depositCurrency])
    : 0;

  const usdPreview = exchangeRates && withdrawAmount
    ? parseInt(withdrawAmount) / exchangeRates.USD
    : 0;

  // Format time since last update
  const getTimeSinceUpdate = () => {
    if (!exchangeRates?.updated_at) return null;
    const updated = new Date(exchangeRates.updated_at);
    const now = new Date();
    const diffMs = now.getTime() - updated.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return updated.toLocaleDateString();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 text-gold-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Wallet</h1>

      {/* Status message */}
      {statusMessage && (
        <div
          className={`flex items-center space-x-3 p-4 rounded-lg ${
            statusMessage.type === 'success'
              ? 'bg-green-500/20 text-green-400'
              : statusMessage.type === 'error'
              ? 'bg-red-500/20 text-red-400'
              : 'bg-blue-500/20 text-blue-400'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle className="h-5 w-5 flex-shrink-0" />
          ) : statusMessage.type === 'error' ? (
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
          ) : (
            <Bitcoin className="h-5 w-5 flex-shrink-0" />
          )}
          <span>{statusMessage.message}</span>
          <button
            onClick={() => setStatusMessage(null)}
            className="ml-auto text-current hover:opacity-70"
          >
            &times;
          </button>
        </div>
      )}

      {/* Balance overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-800 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Total Balance</p>
              <p className="text-3xl font-bold text-gold-500">
                {formatGold(walletData?.balance || 0)}
              </p>
            </div>
            <WalletIcon className="h-12 w-12 text-gold-500/30" />
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-6">
          <p className="text-gray-400 text-sm">Available</p>
          <p className="text-2xl font-bold text-green-500">
            {formatGold(walletData?.available_balance || 0)}
          </p>
        </div>

        <div className="bg-gray-800 rounded-lg p-6">
          <p className="text-gray-400 text-sm">Locked in Bids</p>
          <p className="text-2xl font-bold text-yellow-500">
            {formatGold(walletData?.locked_amount || 0)}
          </p>
        </div>
      </div>

      {/* Exchange Rates */}
      {exchangeRates && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center space-x-3">
              <TrendingUp className="h-5 w-5 text-green-500" />
              <span className="text-gray-400 text-sm font-medium">Exchange Rates</span>
              <a
                href="https://www.g2g.com/wow-classic-tbc-gold"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                <span>Check G2G</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="flex items-center space-x-6 text-sm">
              <div>
                <span className="text-gold-500 font-semibold">1000g</span>
                <span className="text-gray-500"> = </span>
                <span className="text-green-400 font-semibold">${exchangeRates.USD ? (1000 / exchangeRates.USD).toFixed(2) : '—'} USD</span>
              </div>
              {getTimeSinceUpdate() && (
                <div className="text-gray-500 text-xs">
                  Updated: {getTimeSinceUpdate()}
                </div>
              )}
              {isAdmin && (
                <button
                  onClick={openRateEditor}
                  className="flex items-center space-x-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-2 py-1 rounded transition-colors"
                >
                  <Settings className="h-3 w-3" />
                  <span>Edit</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Rate Editor Modal (Admin) */}
      {rateEditorOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/70" onClick={() => setRateEditorOpen(false)} />
            <div className="relative bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Set Exchange Rates</h3>
                <button
                  onClick={() => setRateEditorOpen(false)}
                  className="text-gray-400 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <p className="text-gray-400 text-sm mb-4">
                Check current rates on{' '}
                <a
                  href="https://www.g2g.com/wow-classic-tbc-gold"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline"
                >
                  G2G
                </a>
                {' '}and enter how much 1000g costs in USD.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">1000g = ? USD</label>
                  <input
                    type="number"
                    value={editRate}
                    onChange={(e) => setEditRate(e.target.value)}
                    placeholder="e.g., 40.00"
                    step="0.01"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-gold-500"
                  />
                </div>
              </div>

              <div className="flex space-x-3 mt-6">
                <button
                  onClick={() => setRateEditorOpen(false)}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveRates}
                  disabled={updateRatesMutation.isPending}
                  className="flex-1 bg-gold-600 hover:bg-gold-700 disabled:bg-gray-600 text-white py-2 rounded-lg transition-colors flex items-center justify-center space-x-2"
                >
                  <Save className="h-4 w-4" />
                  <span>{updateRatesMutation.isPending ? 'Saving...' : 'Save Rates'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Deposit */}
        <div className="bg-gray-800 rounded-lg p-6">
          <div className="flex items-center space-x-2 mb-4">
            <ArrowDownLeft className="h-5 w-5 text-green-500" />
            <h2 className="text-lg font-semibold text-white">Deposit</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Amount (USD)</label>
              <div className="flex space-x-2">
                <input
                  type="number"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="0.00"
                  min="5"
                  className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-gold-500"
                />
                <span className="bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white font-medium">
                  USD
                </span>
              </div>
            </div>

            {goldPreview > 0 && (
              <p className="text-gray-400 text-sm">
                You will receive: <span className="text-gold-500 font-semibold">{formatGold(goldPreview)}</span>
              </p>
            )}

            <button
              onClick={() => depositMutation.mutate()}
              disabled={!depositAmount || parseFloat(depositAmount) < 5 || depositMutation.isPending}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium py-2 rounded-lg transition-colors flex items-center justify-center space-x-2"
            >
              <Bitcoin className="h-4 w-4" />
              <span>{depositMutation.isPending ? 'Processing...' : 'Deposit with Crypto'}</span>
            </button>

            <p className="text-gray-500 text-xs text-center">
              Minimum deposit: $5 USD | Accepts BTC, ETH, USDC, and more
            </p>
          </div>
        </div>

        {/* Withdraw */}
        <div className="bg-gray-800 rounded-lg p-6">
          <div className="flex items-center space-x-2 mb-4">
            <ArrowUpRight className="h-5 w-5 text-red-500" />
            <h2 className="text-lg font-semibold text-white">Withdraw</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Gold Amount</label>
              <input
                type="number"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                placeholder="0"
                min="5000"
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-gold-500"
              />
            </div>

            {usdPreview > 0 && (
              <p className="text-gray-400 text-sm">
                You will receive: <span className="text-green-500 font-semibold">${usdPreview.toFixed(2)} USD</span>
              </p>
            )}

            <button
              onClick={() => withdrawMutation.mutate()}
              disabled={
                !withdrawAmount ||
                parseInt(withdrawAmount) < 9000 ||
                parseInt(withdrawAmount) > (walletData?.available_balance || 0) ||
                withdrawMutation.isPending
              }
              className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium py-2 rounded-lg transition-colors"
            >
              {withdrawMutation.isPending ? 'Processing...' : 'Request Withdrawal'}
            </button>

            <p className="text-gray-500 text-xs text-center">
              Minimum: $10 USD (~9,000g) | Max: {formatGold(walletData?.available_balance || 0)}
            </p>
            <p className="text-gray-500 text-xs text-center">
              Requires wallet address in Profile | Manual processing (24-48h)
            </p>
          </div>
        </div>
      </div>

      {/* Transaction History */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Transaction History</h2>

        {transactions?.transactions?.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-gray-400 text-sm border-b border-gray-700">
                  <th className="pb-3">Type</th>
                  <th className="pb-3">Amount</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {transactions.transactions.map((tx: any) => (
                  <tr key={tx.id} className="text-sm">
                    <td className="py-3">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          tx.type === 'DEPOSIT'
                            ? 'bg-green-500/20 text-green-400'
                            : tx.type === 'WITHDRAWAL'
                            ? 'bg-red-500/20 text-red-400'
                            : tx.type === 'AUCTION_WIN'
                            ? 'bg-purple-500/20 text-purple-400'
                            : tx.type === 'POT_PAYOUT'
                            ? 'bg-gold-500/20 text-gold-400'
                            : 'bg-gray-500/20 text-gray-400'
                        }`}
                      >
                        {tx.type.replace('_', ' ')}
                      </span>
                    </td>
                    <td className={`py-3 font-medium ${tx.gold_amount >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {tx.gold_amount >= 0 ? '+' : ''}{formatGold(tx.gold_amount)}
                    </td>
                    <td className="py-3">
                      <span
                        className={`${
                          tx.status === 'COMPLETED'
                            ? 'text-green-500'
                            : tx.status === 'PENDING'
                            ? 'text-yellow-500'
                            : tx.status === 'FAILED'
                            ? 'text-red-500'
                            : 'text-gray-500'
                        }`}
                      >
                        {tx.status}
                      </span>
                    </td>
                    <td className="py-3 text-gray-400">
                      {new Date(tx.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-400 text-center py-4">No transactions yet</p>
        )}
      </div>
    </div>
  );
}
