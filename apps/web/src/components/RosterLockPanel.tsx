import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { Lock, Users, Clock, Loader2, ExternalLink, AlertTriangle } from 'lucide-react';

interface RosterLockPanelProps {
  raidId: string;
  participantCount: number;
  rosterLockedAt: Date | null;
  preAuctionEndsAt: Date | null;
  isLeader: boolean;
  raidStatus: string;
}

const DURATION_OPTIONS = [
  { value: 1, label: '1 hour' },
  { value: 2, label: '2 hours' },
  { value: 4, label: '4 hours' },
  { value: 8, label: '8 hours' },
  { value: 12, label: '12 hours' },
  { value: 24, label: '24 hours' },
  { value: 48, label: '48 hours' },
  { value: 72, label: '72 hours' },
];

export function RosterLockPanel({
  raidId,
  participantCount,
  rosterLockedAt,
  preAuctionEndsAt,
  isLeader,
  raidStatus,
}: RosterLockPanelProps) {
  const queryClient = useQueryClient();
  const [selectedDuration, setSelectedDuration] = useState(24);
  const [confirmLock, setConfirmLock] = useState(false);

  const lockMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/raids/${raidId}/lock-roster`, {
        duration_hours: selectedDuration,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['raid', raidId] });
      setConfirmLock(false);
    },
  });

  // If roster is already locked, show status
  if (rosterLockedAt) {
    const endsAt = preAuctionEndsAt ? new Date(preAuctionEndsAt) : null;
    const now = new Date();
    const isEnded = endsAt && now > endsAt;

    return (
      <div className="bg-gray-800 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-amber-500" />
            <span className="font-medium text-white">Pre-Auction</span>
          </div>
          <span className={`text-sm ${isEnded ? 'text-gray-400' : 'text-green-400'}`}>
            {isEnded ? 'Ended' : 'Active'}
          </span>
        </div>

        {!isEnded && endsAt && (
          <div className="text-sm text-gray-400 mb-3">
            <Clock className="inline h-4 w-4 mr-1" />
            Ends {endsAt.toLocaleString()}
          </div>
        )}

        <Link
          to={`/raids/${raidId}/pre-auction`}
          className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-black font-semibold py-2 px-4 rounded-lg transition-colors"
        >
          <ExternalLink className="h-4 w-4" />
          View Pre-Auction
        </Link>
      </div>
    );
  }

  // Show lock roster option only to leader and in PENDING status
  if (!isLeader || raidStatus !== 'PENDING') {
    return null;
  }

  // Confirmation state
  if (confirmLock) {
    return (
      <div className="bg-gray-800 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="h-5 w-5 text-yellow-500" />
          <span className="font-medium text-white">Confirm Lock</span>
        </div>

        <p className="text-sm text-gray-400 mb-4">
          This will lock the roster with <strong className="text-white">{participantCount}</strong> participants
          and start a <strong className="text-white">{selectedDuration} hour</strong> pre-auction for all items
          in the selected raids.
        </p>

        <p className="text-sm text-yellow-500 mb-4">
          Players can bid on items before the raid starts. Winners are automatically awarded when items drop.
        </p>

        <div className="flex gap-2">
          <button
            onClick={() => setConfirmLock(false)}
            className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => lockMutation.mutate()}
            disabled={lockMutation.isPending}
            className="flex-1 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-gray-700 text-black font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {lockMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Lock className="h-4 w-4" />
                Lock & Start
              </>
            )}
          </button>
        </div>

        {lockMutation.isError && (
          <p className="text-sm text-red-400 mt-2">
            {(lockMutation.error as Error)?.message || 'Failed to lock roster'}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <Lock className="h-5 w-5 text-gray-400" />
        <span className="font-medium text-white">Pre-Auction</span>
      </div>

      <div className="flex items-center gap-2 text-sm text-gray-400 mb-3">
        <Users className="h-4 w-4" />
        <span>{participantCount} participants</span>
      </div>

      {/* Duration Selector */}
      <div className="mb-4">
        <label className="block text-xs text-gray-400 mb-2">Duration</label>
        <select
          value={selectedDuration}
          onChange={(e) => setSelectedDuration(parseInt(e.target.value, 10))}
          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
          {DURATION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <button
        onClick={() => setConfirmLock(true)}
        disabled={participantCount < 1}
        className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:bg-gray-700 disabled:text-gray-500 text-black font-semibold py-2 px-4 rounded-lg transition-colors"
      >
        <Lock className="h-4 w-4" />
        Lock Roster & Start Pre-Auction
      </button>

      <p className="text-xs text-gray-500 mt-2 text-center">
        Players can bid on items before the raid
      </p>
    </div>
  );
}
