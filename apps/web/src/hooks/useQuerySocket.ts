import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@gdkp/shared';
import { useAuthStore } from '../stores/authStore';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Hook to sync socket events with TanStack Query cache for instant updates.
 * Instead of invalidating queries (which triggers a refetch), this directly
 * updates the cache when possible for lightning-fast UI updates.
 */
export function useQuerySocket() {
  const queryClient = useQueryClient();
  const { token, user } = useAuthStore();

  useEffect(() => {
    if (!token) return;

    const socketUrl = import.meta.env.VITE_API_URL || window.location.origin;

    const socket: TypedSocket = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    // Connection established - user channel is auto-joined by the server
    socket.on('connect', () => {
      // User's personal channel is automatically joined server-side based on auth token
    });

    // Wallet updates - instant cache update
    socket.on('wallet:updated', (data) => {
      // Update auth store directly (already done in useSocket)
      useAuthStore.getState().updateWallet(data.balance, data.locked_amount);

      // Also update any user queries that might have gold_balance
      queryClient.setQueryData(['user'], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          gold_balance: data.balance,
        };
      });
    });

    // Raid updates - invalidate immediately (staleTime: 0 means instant refetch)
    // Note: Some backend emits include raid_id, others don't (they emit to a room)
    socket.on('raid:updated', (data) => {
      if (data.raid_id) {
        // If we have raid_id, invalidate that specific raid
        queryClient.invalidateQueries({
          queryKey: ['raid', data.raid_id],
          refetchType: 'active',
        });

        if (data.items_changed) {
          queryClient.invalidateQueries({
            queryKey: ['raid', data.raid_id, 'distribution-preview'],
            refetchType: 'active',
          });
        }
      } else {
        // If no raid_id, invalidate all raid queries (user is in the room)
        queryClient.invalidateQueries({
          queryKey: ['raid'],
          refetchType: 'active',
        });
      }
    });

    // Session events for waiting room
    socket.on('session:approved', () => {
      useAuthStore.getState().updateSessionStatus('APPROVED');
    });

    socket.on('session:kicked', () => {
      // Will be handled by WaitingRoom component
    });

    // Admin waiting room updates
    socket.on('waiting-room:updated', () => {
      queryClient.invalidateQueries({
        queryKey: ['admin', 'waiting-room'],
        refetchType: 'active',
      });
    });

    // Gold report updates
    socket.on('gold-report:updated', () => {
      queryClient.invalidateQueries({
        queryKey: ['user', 'gold-report'],
        refetchType: 'active',
      });
      queryClient.invalidateQueries({
        queryKey: ['admin', 'gold-reports'],
        refetchType: 'active',
      });
    });

    // Raids list updates (new raid created, etc.)
    socket.on('raids:updated', () => {
      queryClient.invalidateQueries({
        queryKey: ['raids'],
        refetchType: 'active',
      });
    });

    return () => {
      socket.disconnect();
    };
  }, [token, user?.id, queryClient]);
}

/**
 * Utility to instantly update raid data in cache.
 * Use this when you have the full updated data from a socket event.
 */
export function useRaidCacheUpdater() {
  const queryClient = useQueryClient();

  return {
    // Update a single item in the raid's items array
    updateItem: (raidId: string, itemId: string, updates: Record<string, any>) => {
      queryClient.setQueryData(['raid', raidId], (old: any) => {
        if (!old?.items) return old;
        return {
          ...old,
          items: old.items.map((item: any) =>
            item.id === itemId ? { ...item, ...updates } : item
          ),
        };
      });
    },

    // Update the pot total
    updatePotTotal: (raidId: string, potTotal: number) => {
      queryClient.setQueryData(['raid', raidId], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          pot_total: potTotal,
        };
      });
    },

    // Add a new item to the raid
    addItem: (raidId: string, item: any) => {
      queryClient.setQueryData(['raid', raidId], (old: any) => {
        if (!old?.items) return old;
        return {
          ...old,
          items: [...old.items, item],
        };
      });
    },

    // Remove an item from the raid
    removeItem: (raidId: string, itemId: string) => {
      queryClient.setQueryData(['raid', raidId], (old: any) => {
        if (!old?.items) return old;
        return {
          ...old,
          items: old.items.filter((item: any) => item.id !== itemId),
        };
      });
    },

    // Force immediate refetch (for when setQueryData isn't enough)
    refetchRaid: (raidId: string) => {
      queryClient.invalidateQueries({
        queryKey: ['raid', raidId],
        refetchType: 'all',
      });
    },
  };
}
