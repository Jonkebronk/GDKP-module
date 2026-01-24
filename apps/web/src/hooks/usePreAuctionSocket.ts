import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@gdkp/shared';
import { useAuthStore } from '../stores/authStore';
import { usePreAuctionStore } from '../stores/preAuctionStore';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function usePreAuctionSocket(raidId: string | null) {
  const socketRef = useRef<TypedSocket | null>(null);
  const { token } = useAuthStore();
  const {
    setConnection,
    updateItemBid,
    updateItemStatus,
  } = usePreAuctionStore();

  useEffect(() => {
    if (!token || !raidId) return;

    // In production, use configured API URL; in development, use same origin
    const socketUrl = import.meta.env.VITE_API_URL || window.location.origin;

    const socket: TypedSocket = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    // Connection events
    socket.on('connect', () => {
      setConnection(true);
      socket.emit('preauction:join', { raid_id: raidId });
    });

    socket.on('disconnect', () => {
      setConnection(false);
    });

    socket.on('connect_error', () => {
      setConnection(false);
    });

    // Pre-auction bid events
    socket.on('preauction:bid:new', (data) => {
      updateItemBid(
        data.pre_auction_item_id,
        data.amount,
        data.user_id,
        data.username
      );

      // Dispatch event for UI updates
      window.dispatchEvent(new CustomEvent('preauction:bid:new', { detail: data }));
    });

    socket.on('preauction:bid:accepted', (data) => {
      window.dispatchEvent(new CustomEvent('preauction:bid:accepted', { detail: data }));
    });

    socket.on('preauction:bid:rejected', (data) => {
      window.dispatchEvent(new CustomEvent('preauction:bid:rejected', { detail: data }));
    });

    socket.on('preauction:ended', (data) => {
      // Update all items to ENDED status
      window.dispatchEvent(new CustomEvent('preauction:ended', { detail: data }));
    });

    socket.on('preauction:item:updated', (data) => {
      if (data.item) {
        updateItemBid(
          data.item.id,
          data.item.current_bid,
          data.item.winner_id,
          data.item.winner?.discord_username || data.item.winner?.alias || undefined
        );
        if (data.item.status) {
          updateItemStatus(data.item.id, data.item.status);
        }
      }
    });

    socket.on('preauction:item:claimed', (data) => {
      updateItemStatus(data.pre_auction_item_id, 'CLAIMED');
      window.dispatchEvent(new CustomEvent('preauction:item:claimed', { detail: data }));
    });

    // Wallet updates
    socket.on('wallet:updated', (data) => {
      useAuthStore.getState().updateWallet(data.balance, data.locked_amount);
      window.dispatchEvent(new CustomEvent('wallet:updated', { detail: data }));
    });

    socket.on('error', (error) => {
      console.error('Socket error:', error.code, error.message);
      window.dispatchEvent(new CustomEvent('socket:error', { detail: error }));
    });

    return () => {
      socket.emit('preauction:leave', { raid_id: raidId });
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, raidId, setConnection, updateItemBid, updateItemStatus]);

  const placeBid = useCallback((preAuctionItemId: string, amount: number) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('preauction:bid', {
        pre_auction_item_id: preAuctionItemId,
        amount,
      });
    }
  }, []);

  return {
    socket: socketRef.current,
    placeBid,
    isConnected: socketRef.current?.connected ?? false,
  };
}
