import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/client';
import { formatGold } from '@gdkp/shared';
import { Wallet as WalletIcon, ArrowDownLeft, ArrowUpRight, RefreshCw } from 'lucide-react';

export function Wallet() {
  const queryClient = useQueryClient();
  const [depositAmount, setDepositAmount] = useState('');
  const [depositCurrency, setDepositCurrency] = useState<'EUR' | 'SEK' | 'USD'>('EUR');
  const [withdrawAmount, setWithdrawAmount] = useState('');

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
      // Redirect to PayPal
      window.location.href = data.approve_url;
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/wallet/withdraw', {
        gold_amount: parseInt(withdrawAmount),
      });
      return res.data;
    },
    onSuccess: () => {
      setWithdrawAmount('');
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['user', 'transactions'] });
    },
  });

  const goldPreview = exchangeRates && depositAmount
    ? Math.floor(parseFloat(depositAmount) * exchangeRates[depositCurrency])
    : 0;

  const euroPreview = exchangeRates && withdrawAmount
    ? parseInt(withdrawAmount) / exchangeRates.EUR
    : 0;

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Deposit */}
        <div className="bg-gray-800 rounded-lg p-6">
          <div className="flex items-center space-x-2 mb-4">
            <ArrowDownLeft className="h-5 w-5 text-green-500" />
            <h2 className="text-lg font-semibold text-white">Deposit</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Amount</label>
              <div className="flex space-x-2">
                <input
                  type="number"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="0.00"
                  min="5"
                  className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-gold-500"
                />
                <select
                  value={depositCurrency}
                  onChange={(e) => setDepositCurrency(e.target.value as 'EUR' | 'SEK' | 'USD')}
                  className="bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-gold-500"
                >
                  <option value="EUR">EUR</option>
                  <option value="SEK">SEK</option>
                  <option value="USD">USD</option>
                </select>
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
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium py-2 rounded-lg transition-colors"
            >
              {depositMutation.isPending ? 'Processing...' : 'Deposit with PayPal'}
            </button>

            <p className="text-gray-500 text-xs text-center">Minimum deposit: 5 EUR</p>
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

            {euroPreview > 0 && (
              <p className="text-gray-400 text-sm">
                You will receive: <span className="text-green-500 font-semibold">{euroPreview.toFixed(2)} EUR</span>
              </p>
            )}

            <button
              onClick={() => withdrawMutation.mutate()}
              disabled={
                !withdrawAmount ||
                parseInt(withdrawAmount) < 5000 ||
                parseInt(withdrawAmount) > (walletData?.available_balance || 0) ||
                withdrawMutation.isPending
              }
              className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium py-2 rounded-lg transition-colors"
            >
              {withdrawMutation.isPending ? 'Processing...' : 'Withdraw to PayPal'}
            </button>

            <p className="text-gray-500 text-xs text-center">
              Minimum: 5,000g | Max: {formatGold(walletData?.available_balance || 0)}
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
