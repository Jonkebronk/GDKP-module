import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/client';
import { formatGold } from '@gdkp/shared';
import { Coins, Users, Crown, AlertTriangle, Check, X } from 'lucide-react';
import { SimpleUserDisplay } from './UserDisplay';

interface ParticipantShare {
  user_id: string;
  discord_username: string;
  display_name?: string;
  alias?: string;
  role: string;
  share_amount: number;
  share_percentage: number;
}

interface DistributionPreview {
  raid_id: string;
  raid_name: string;
  pot_total: number;
  leader_cut: number;
  leader_cut_amount: number;
  member_share: number;
  participant_count: number;
  shares: ParticipantShare[];
}

interface PotDistributionProps {
  raidId: string;
  isLeader: boolean;
  raidStatus: string;
  onDistributed?: () => void;
}

export function PotDistribution({
  raidId,
  isLeader,
  raidStatus,
  onDistributed,
}: PotDistributionProps) {
  const queryClient = useQueryClient();
  const [showConfirmDistribute, setShowConfirmDistribute] = useState(false);
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const { data: preview, isLoading } = useQuery<DistributionPreview>({
    queryKey: ['raid', raidId, 'distribution-preview'],
    queryFn: async () => {
      const res = await api.get(`/raids/${raidId}/distribution-preview`);
      return res.data;
    },
    enabled: !!raidId && isLeader,
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  const distributeMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/raids/${raidId}/distribute`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['raid', raidId] });
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      setShowConfirmDistribute(false);
      onDistributed?.();
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/raids/${raidId}/cancel`, {
        reason: cancelReason || 'Raid cancelled by leader',
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['raid', raidId] });
      queryClient.invalidateQueries({ queryKey: ['raids'] });
      setShowConfirmCancel(false);
    },
  });

  if (!isLeader) {
    return null;
  }

  if (raidStatus === 'COMPLETED') {
    return (
      <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
        <div className="flex items-center space-x-2 text-green-400">
          <Check className="h-5 w-5" />
          <span className="font-medium">Pot has been distributed</span>
        </div>
      </div>
    );
  }

  if (raidStatus === 'CANCELLED') {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
        <div className="flex items-center space-x-2 text-red-400">
          <X className="h-5 w-5" />
          <span className="font-medium">Raid was cancelled</span>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-700 rounded w-1/3"></div>
          <div className="h-4 bg-gray-700 rounded w-full"></div>
          <div className="h-4 bg-gray-700 rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  if (!preview) {
    return null;
  }

  const hasActiveAuctions = raidStatus === 'ACTIVE';

  return (
    <div className="bg-gray-800 rounded-lg p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white flex items-center space-x-2">
          <Coins className="h-5 w-5 text-gold-500" />
          <span>Pot Distribution</span>
        </h3>
        <span className="text-2xl font-bold text-gold-500">
          {formatGold(preview.pot_total)}
        </span>
      </div>

      {/* Distribution breakdown */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-gray-400">Participants</p>
          <p className="text-white font-medium flex items-center space-x-1">
            <Users className="h-4 w-4" />
            <span>{preview.participant_count}</span>
          </p>
        </div>
        <div>
          <p className="text-gray-400">Leader Cut</p>
          <p className="text-white font-medium">
            {preview.leader_cut}% ({formatGold(preview.leader_cut_amount)})
          </p>
        </div>
        <div className="col-span-2">
          <p className="text-gray-400">Equal Share per Member</p>
          <p className="text-gold-500 font-medium">
            {formatGold(preview.member_share)}
          </p>
        </div>
      </div>

      {/* Participant shares */}
      <div className="border-t border-gray-700 pt-4">
        <h4 className="text-sm font-medium text-gray-400 mb-2">Share Breakdown</h4>
        <div className="max-h-48 overflow-y-auto space-y-2">
          {preview.shares.map((share) => (
            <div
              key={share.user_id}
              className="flex items-center justify-between py-2 px-3 bg-gray-700/50 rounded"
            >
              <div className="flex items-center space-x-2">
                {share.role === 'LEADER' && (
                  <Crown className="h-4 w-4 text-gold-500" />
                )}
                <SimpleUserDisplay
                  user={share}
                  className="text-white text-sm"
                />
                <span className="text-gray-500 text-xs">
                  ({share.share_percentage.toFixed(1)}%)
                </span>
              </div>
              <span className="text-gold-500 font-medium">
                {formatGold(share.share_amount)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex space-x-2 pt-4 border-t border-gray-700">
        <button
          onClick={() => setShowConfirmDistribute(true)}
          disabled={hasActiveAuctions || preview.pot_total === 0}
          className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium py-2 rounded-lg transition-colors"
        >
          Distribute Pot
        </button>
        <button
          onClick={() => setShowConfirmCancel(true)}
          className="bg-red-600/20 hover:bg-red-600/30 text-red-400 font-medium px-4 py-2 rounded-lg transition-colors"
        >
          Cancel Raid
        </button>
      </div>

      {hasActiveAuctions && (
        <p className="text-yellow-500 text-xs flex items-center space-x-1">
          <AlertTriangle className="h-3 w-3" />
          <span>Complete all auctions before distributing</span>
        </p>
      )}

      {/* Confirm Distribute Modal */}
      {showConfirmDistribute && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-white mb-4">Confirm Distribution</h3>
            <p className="text-gray-400 mb-4">
              You are about to distribute <span className="text-gold-500 font-bold">{formatGold(preview.pot_total)}</span> to {preview.participant_count} participants.
            </p>
            <p className="text-yellow-500 text-sm mb-6">
              This action cannot be undone. Make sure all auctions are complete.
            </p>
            <div className="flex space-x-2">
              <button
                onClick={() => distributeMutation.mutate()}
                disabled={distributeMutation.isPending}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white font-medium py-2 rounded-lg transition-colors"
              >
                {distributeMutation.isPending ? 'Distributing...' : 'Confirm Distribution'}
              </button>
              <button
                onClick={() => setShowConfirmDistribute(false)}
                className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
            {distributeMutation.isError && (
              <p className="text-red-500 text-sm mt-4">
                {(distributeMutation.error as Error)?.message || 'Failed to distribute pot'}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Confirm Cancel Modal */}
      {showConfirmCancel && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-red-500 mb-4">Cancel Raid</h3>
            <p className="text-gray-400 mb-4">
              This will cancel the raid and refund all auction winners. The pot will be reset to zero.
            </p>
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-1">Reason (optional)</label>
              <input
                type="text"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g., Raid disbanded"
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white font-medium py-2 rounded-lg transition-colors"
              >
                {cancelMutation.isPending ? 'Cancelling...' : 'Cancel Raid'}
              </button>
              <button
                onClick={() => setShowConfirmCancel(false)}
                className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors"
              >
                Go Back
              </button>
            </div>
            {cancelMutation.isError && (
              <p className="text-red-500 text-sm mt-4">
                {(cancelMutation.error as Error)?.message || 'Failed to cancel raid'}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
