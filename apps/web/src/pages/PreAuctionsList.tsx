import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { formatGold } from '@gdkp/shared';
import { useAuthStore } from '../stores/authStore';
import {
  Clock,
  Gavel,
  Users,
  Loader2,
  Calendar,
  Plus,
  Play,
  Upload,
  ChevronDown,
  AlertTriangle,
  Check,
} from 'lucide-react';
import { useState, useEffect } from 'react';

interface PreAuctionRaid {
  id: string;
  name: string;
  instances: string[];
  roster_locked_at: string;
  preauction_ends_at: string;
  participant_count: number;
  item_count: number;
  items_with_bids: number;
  my_winning_bids: number;
  my_total_bid_amount: number;
}

interface AvailableRaid {
  id: string;
  name: string;
  instances: string[];
  status: string;
  participant_count: number;
  created_at: string;
}

interface ImportResult {
  matched: number;
  created?: number;
  not_found?: string[];
  failed_to_fetch?: string[];
  already_in_raid: number;
  total_added?: number;
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

function CountdownTimer({ endsAt }: { endsAt: string }) {
  const [remainingMs, setRemainingMs] = useState(0);

  useEffect(() => {
    const updateRemaining = () => {
      const remaining = new Date(endsAt).getTime() - Date.now();
      setRemainingMs(Math.max(0, remaining));
    };

    updateRemaining();
    const interval = setInterval(updateRemaining, 1000);

    return () => clearInterval(interval);
  }, [endsAt]);

  if (remainingMs <= 0) {
    return <span className="text-gray-400">Ended</span>;
  }

  const hours = Math.floor(remainingMs / (1000 * 60 * 60));
  const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((remainingMs % (1000 * 60)) / 1000);

  const isEndingSoon = remainingMs <= 30 * 60 * 1000;

  return (
    <span className={`font-mono ${isEndingSoon ? 'text-yellow-400' : 'text-white'}`}>
      {hours.toString().padStart(2, '0')}:
      {minutes.toString().padStart(2, '0')}:
      {seconds.toString().padStart(2, '0')}
    </span>
  );
}

interface RaidHelperImportResult extends ImportResult {
  total_found_in_message?: number;
  message?: string;
}

function StartPreAuctionPanel() {
  const queryClient = useQueryClient();
  const [selectedRaidId, setSelectedRaidId] = useState<string>('');
  const [duration, setDuration] = useState(24);
  const [showImport, setShowImport] = useState(false);
  const [channelId, setChannelId] = useState('');
  const [messageId, setMessageId] = useState('');
  const [importResult, setImportResult] = useState<RaidHelperImportResult | null>(null);

  // Fetch available raids (PENDING, not locked)
  const { data: availableRaids, isLoading: raidsLoading } = useQuery({
    queryKey: ['available-raids-for-preauction'],
    queryFn: async () => {
      const res = await api.get('/pre-auctions/available-raids');
      return res.data as AvailableRaid[];
    },
  });

  const selectedRaid = availableRaids?.find((r) => r.id === selectedRaidId);

  // Import from Raid Helper mutation
  const importMutation = useMutation({
    mutationFn: async (data: { raidId: string; channelId: string; messageId: string }) => {
      const res = await api.post(`/raids/${data.raidId}/import-from-raidhelper`, {
        channel_id: data.channelId,
        message_id: data.messageId,
      });
      return res.data as RaidHelperImportResult;
    },
    onSuccess: (result) => {
      setImportResult(result);
      queryClient.invalidateQueries({ queryKey: ['available-raids-for-preauction'] });
    },
  });

  // Lock roster mutation
  const lockMutation = useMutation({
    mutationFn: async (data: { raidId: string; duration: number }) => {
      const res = await api.post(`/raids/${data.raidId}/lock-roster`, {
        duration_hours: data.duration,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pre-auctions-list'] });
      queryClient.invalidateQueries({ queryKey: ['available-raids-for-preauction'] });
      setSelectedRaidId('');
      setChannelId('');
      setMessageId('');
      setImportResult(null);
      setShowImport(false);
    },
  });

  const handleImport = () => {
    if (!selectedRaidId || !channelId.trim() || !messageId.trim()) return;
    importMutation.mutate({ raidId: selectedRaidId, channelId: channelId.trim(), messageId: messageId.trim() });
  };

  const handleStartPreAuction = () => {
    if (!selectedRaidId) return;
    lockMutation.mutate({ raidId: selectedRaidId, duration });
  };

  if (raidsLoading) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <Loader2 className="h-6 w-6 text-amber-500 animate-spin mx-auto" />
      </div>
    );
  }

  if (!availableRaids || availableRaids.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <div className="flex items-center gap-3 mb-2">
          <Plus className="h-5 w-5 text-amber-500" />
          <h3 className="font-semibold text-white">Start New Pre-Auction</h3>
        </div>
        <p className="text-gray-400 text-sm">
          No raids available. Create a new raid in the Raids section first.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <div className="flex items-center gap-3 mb-4">
        <Plus className="h-5 w-5 text-amber-500" />
        <h3 className="font-semibold text-white">Start New Pre-Auction</h3>
      </div>

      {/* Raid Selection */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-gray-400 mb-2">Select Raid</label>
          <div className="relative">
            <select
              value={selectedRaidId}
              onChange={(e) => {
                setSelectedRaidId(e.target.value);
                setImportResult(null);
              }}
              className="w-full appearance-none bg-gray-700 border border-gray-600 rounded-lg pl-4 pr-10 py-3 text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="">Choose a raid...</option>
              {availableRaids.map((raid) => (
                <option key={raid.id} value={raid.id}>
                  {raid.name} ({raid.instances.join(' + ')}) - {raid.participant_count} players
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {selectedRaid && (
          <>
            {/* Raid Info */}
            <div className="bg-gray-900 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-white font-medium">{selectedRaid.name}</span>
                <span className="text-sm text-gray-400">{selectedRaid.instances.join(' + ')}</span>
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-400">
                <div className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  <span>{selectedRaid.participant_count} participants</span>
                </div>
              </div>
            </div>

            {/* Import Participants */}
            <div>
              <button
                onClick={() => setShowImport(!showImport)}
                className="flex items-center gap-2 text-sm text-amber-400 hover:text-amber-300 transition-colors"
              >
                <Upload className="h-4 w-4" />
                {showImport ? 'Hide Import' : 'Import from Raid Helper'}
              </button>

              {showImport && (
                <div className="mt-3 space-y-3">
                  <p className="text-xs text-gray-400">
                    Right-click the Raid Helper message in Discord → "Copy Message ID".
                    Also need the Channel ID (enable Developer Mode in Discord settings).
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Channel ID</label>
                      <input
                        type="text"
                        value={channelId}
                        onChange={(e) => setChannelId(e.target.value)}
                        placeholder="e.g. 123456789012345678"
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Message ID</label>
                      <input
                        type="text"
                        value={messageId}
                        onChange={(e) => setMessageId(e.target.value)}
                        placeholder="e.g. 123456789012345678"
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleImport}
                      disabled={!channelId.trim() || !messageId.trim() || importMutation.isPending}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      {importMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      Fetch & Import
                    </button>
                    {importResult && (
                      <span className="text-sm text-green-400">
                        <Check className="h-4 w-4 inline mr-1" />
                        Added {importResult.total_added ?? importResult.matched} players
                        {importResult.created !== undefined && importResult.created > 0 && (
                          <span className="text-blue-400 ml-1">
                            ({importResult.created} new accounts created)
                          </span>
                        )}
                        {importResult.total_found_in_message && (
                          <span className="text-gray-400 ml-1">
                            (found {importResult.total_found_in_message} in message)
                          </span>
                        )}
                        {importResult.failed_to_fetch && importResult.failed_to_fetch.length > 0 && (
                          <span className="text-yellow-400 ml-2">
                            ({importResult.failed_to_fetch.length} failed)
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                  {importMutation.isError && (
                    <div className="text-xs text-red-400">
                      {(importMutation.error as Error)?.message || 'Failed to fetch from Discord'}
                    </div>
                  )}
                  {importResult && importResult.message && (
                    <div className="text-xs text-yellow-400">{importResult.message}</div>
                  )}
                </div>
              )}
            </div>

            {/* Duration Selection */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">Pre-Auction Duration</label>
              <div className="relative">
                <select
                  value={duration}
                  onChange={(e) => setDuration(parseInt(e.target.value, 10))}
                  className="w-full appearance-none bg-gray-700 border border-gray-600 rounded-lg pl-4 pr-10 py-3 text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  {DURATION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
              </div>
            </div>

            {/* Warning if no participants */}
            {selectedRaid.participant_count === 0 && (
              <div className="flex items-start gap-2 text-yellow-400 text-sm bg-yellow-500/10 rounded-lg p-3">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>No participants yet. Import players from Raid Helper or have them join the raid first.</span>
              </div>
            )}

            {/* Start Button */}
            <button
              onClick={handleStartPreAuction}
              disabled={lockMutation.isPending || selectedRaid.participant_count === 0}
              className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:bg-gray-700 disabled:text-gray-500 text-black font-semibold py-3 px-4 rounded-lg transition-colors"
            >
              {lockMutation.isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <Play className="h-5 w-5" />
                  Start Pre-Auction ({duration}h)
                </>
              )}
            </button>

            {lockMutation.isError && (
              <p className="text-sm text-red-400 text-center">
                {(lockMutation.error as Error)?.message || 'Failed to start pre-auction'}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function PreAuctionsList() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN';

  const { data, isLoading } = useQuery({
    queryKey: ['pre-auctions-list'],
    queryFn: async () => {
      const res = await api.get('/pre-auctions');
      return res.data as { active: PreAuctionRaid[]; ended: PreAuctionRaid[] };
    },
    refetchInterval: 30000,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Gavel className="h-7 w-7 text-amber-500" />
          Pre-Auctions
        </h1>
      </div>

      {/* Admin: Start New Pre-Auction */}
      {isAdmin && <StartPreAuctionPanel />}

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 text-amber-500 animate-spin" />
        </div>
      ) : (
        <>
          {/* Active Pre-Auctions */}
          <section>
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Clock className="h-5 w-5 text-green-400" />
              Active Pre-Auctions
            </h2>
            {data?.active && data.active.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {data.active.map((raid) => (
                  <Link
                    key={raid.id}
                    to={`/raids/${raid.id}/pre-auction`}
                    className="bg-gray-800 rounded-lg p-4 hover:bg-gray-750 transition-colors border border-gray-700 hover:border-amber-500/50"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-white">{raid.name}</h3>
                        <p className="text-sm text-gray-400">
                          {raid.instances.join(' + ')}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 text-green-400 text-sm">
                        <Clock className="h-4 w-4" />
                        <CountdownTimer endsAt={raid.preauction_ends_at} />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                      <div className="flex items-center gap-2 text-gray-400">
                        <Users className="h-4 w-4" />
                        <span>{raid.participant_count} players</span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-400">
                        <Gavel className="h-4 w-4" />
                        <span>{raid.item_count} items</span>
                      </div>
                    </div>

                    {raid.my_winning_bids > 0 && (
                      <div className="bg-amber-500/10 rounded-lg p-2 text-sm">
                        <span className="text-amber-400">
                          Leading on {raid.my_winning_bids} item{raid.my_winning_bids !== 1 ? 's' : ''} ({formatGold(raid.my_total_bid_amount)})
                        </span>
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            ) : (
              <div className="bg-gray-800 rounded-lg p-8 text-center">
                <Gavel className="h-12 w-12 mx-auto mb-4 text-gray-600" />
                <p className="text-gray-400">No active pre-auctions</p>
                <p className="text-sm text-gray-500 mt-1">
                  {isAdmin
                    ? 'Select a raid above to start a pre-auction'
                    : 'Pre-auctions will appear here when available'}
                </p>
              </div>
            )}
          </section>

          {/* Ended Pre-Auctions */}
          {data?.ended && data.ended.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Calendar className="h-5 w-5 text-gray-400" />
                Recently Ended
              </h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {data.ended.map((raid) => (
                  <Link
                    key={raid.id}
                    to={`/raids/${raid.id}/pre-auction`}
                    className="bg-gray-800/50 rounded-lg p-4 hover:bg-gray-800 transition-colors border border-gray-700"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-gray-300">{raid.name}</h3>
                        <p className="text-sm text-gray-500">
                          {raid.instances.join(' + ')}
                        </p>
                      </div>
                      <span className="text-xs text-gray-500 bg-gray-700 px-2 py-1 rounded">
                        Ended
                      </span>
                    </div>

                    {raid.my_winning_bids > 0 && (
                      <div className="bg-green-500/10 rounded-lg p-2 text-sm">
                        <span className="text-green-400">
                          Won {raid.my_winning_bids} item{raid.my_winning_bids !== 1 ? 's' : ''} ({formatGold(raid.my_total_bid_amount)})
                        </span>
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
