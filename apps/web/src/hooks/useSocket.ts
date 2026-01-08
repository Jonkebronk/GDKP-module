import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@gdkp/shared';
import { useAuthStore } from '../stores/authStore';
import { useAuctionStore } from '../stores/auctionStore';
import { useChatStore } from '../stores/chatStore';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function useSocket(raidId: string | null) {
  const socketRef = useRef<TypedSocket | null>(null);
  const lastCountdownRef = useRef<number | null>(null);
  const { token } = useAuthStore();
  const {
    setActiveItem,
    addBid,
    updateRemainingTime,
    extendAuction,
    endAuction,
    setConnection,
    addAuctionEvent,
  } = useAuctionStore();
  const {
    addMessage,
    setMessages,
    addParticipant,
    removeParticipant,
    setParticipants,
    reset: resetChat,
  } = useChatStore();

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
      socket.emit('join:raid', { raid_id: raidId });
    });

    socket.on('disconnect', () => {
      setConnection(false);
    });

    socket.on('connect_error', () => {
      setConnection(false);
    });

    // Raid state sync
    socket.on('raid:state', (state) => {
      if (state.active_auction) {
        setActiveItem(state.active_auction);
      }
      // Set chat history
      if (state.chat_history) {
        setMessages(state.chat_history);
      }
      // Set participants
      if (state.participants) {
        setParticipants(
          state.participants.map((p: any) => ({
            user_id: p.user_id,
            username: p.user?.discord_username || 'Unknown',
            avatar: p.user?.discord_avatar || null,
            alias: p.user?.alias || null,
            role: p.role,
          }))
        );
      }
    });

    // Auction events
    socket.on('auction:started', (data) => {
      setActiveItem(data.item);
      lastCountdownRef.current = null; // Reset countdown tracker

      // Gargul-style announcement
      const minBid = Number(data.item.starting_bid) || 0;
      const increment = Number(data.item.min_increment) || 10;
      addAuctionEvent({
        type: 'auction_start',
        message: `Bid on [${data.item.name}]. Minimum is ${minBid}g - increment is ${increment}g.`,
        itemName: data.item.name,
        amount: minBid,
        bundleItemNames: data.item.is_bundle ? data.item.bundle_item_names : undefined,
      });

      // Trigger refetch of raid data to update item status to ACTIVE
      window.dispatchEvent(new CustomEvent('auction:started', { detail: data }));
    });

    socket.on('bid:new', (data) => {
      // Get current user from store to avoid stale closure
      const currentUser = useAuthStore.getState().user;

      if (currentUser) {
        addBid(
          {
            id: data.bid_id,
            item_id: data.item_id,
            user_id: data.user_id,
            amount: data.amount,
            is_winning: true,
            created_at: new Date(data.timestamp),
            user: {
              id: data.user_id,
              discord_username: data.username,
              discord_avatar: null,
            },
          },
          currentUser.id
        );
      }

      // Gargul-style bid announcement (always show, regardless of user state)
      addAuctionEvent({
        type: 'bid_placed',
        message: `${data.username} is the highest bidder - ${data.amount}g`,
        playerName: data.username,
        amount: data.amount,
      });
    });

    socket.on('auction:tick', (data) => {
      updateRemainingTime(data.remaining_ms);

      // Gargul-style countdown at 5, 4, 3, 2, 1 seconds
      const seconds = Math.ceil(data.remaining_ms / 1000);
      if (seconds <= 5 && seconds >= 1 && lastCountdownRef.current !== seconds) {
        lastCountdownRef.current = seconds;
        addAuctionEvent({
          type: 'countdown',
          message: `${seconds} second${seconds !== 1 ? 's' : ''} to bid`,
        });
      }
    });

    socket.on('auction:extended', (data) => {
      extendAuction(data.new_ends_at);
    });

    socket.on('auction:ended', (data) => {
      // Capture item name - use data.item_name for manual awards, or activeItem for regular auctions
      const currentItem = useAuctionStore.getState().activeItem;
      const itemName = data.item_name || currentItem?.name || 'Unknown Item';
      const isManualAward = data.is_manual_award;

      // Gargul-style "Stop your bids!" - only for regular auctions
      if (!isManualAward) {
        addAuctionEvent({
          type: 'stop_bids',
          message: 'Stop your bids!',
        });
      }

      // Award message
      if (data.winner_name && data.final_amount > 0) {
        addAuctionEvent({
          type: 'awarded',
          message: `[${itemName}] was awarded to ${data.winner_name} for ${data.final_amount}g. Congrats!`,
          itemName,
          playerName: data.winner_name,
          amount: data.final_amount,
        });

        // Pot update message
        addAuctionEvent({
          type: 'pot_updated',
          message: `Pot was updated, it now holds ${data.pot_total}g`,
          amount: data.pot_total,
        });
      } else if (!isManualAward) {
        addAuctionEvent({
          type: 'awarded',
          message: `[${itemName}] received no bids.`,
          itemName,
        });
      }

      // Only end auction if there was an active one
      if (!isManualAward) {
        endAuction();
      }

      // Trigger refetch of raid data to update item statuses
      window.dispatchEvent(new CustomEvent('auction:ended', { detail: data }));
    });

    // Re-auction event
    socket.on('auction:restarted', (data) => {
      addAuctionEvent({
        type: 'system',
        message: `🔄 [${data.item_name}] re-auctioned! Previous: ${data.previous_winner} for ${data.previous_amount}g`,
      });
      addAuctionEvent({
        type: 'pot_updated',
        message: `Pot was updated, it now holds ${data.new_pot_total}g`,
        amount: data.new_pot_total,
      });
      // Trigger refetch
      window.dispatchEvent(new CustomEvent('auction:restarted', { detail: data }));
    });

    // Pot distribution events
    socket.on('pot:payout', (data) => {
      console.log('Received payout:', data);
      // Could trigger a toast notification here
    });

    socket.on('raid:completed', (data) => {
      console.log('Raid completed:', data);
      // Trigger refetch of raid data
      window.dispatchEvent(new CustomEvent('raid:completed', { detail: data }));
    });

    socket.on('raid:cancelled', (data) => {
      console.log('Raid cancelled:', data);
      // Trigger refetch of raid data
      window.dispatchEvent(new CustomEvent('raid:cancelled', { detail: data }));
    });

    // Wallet updates (private channel)
    socket.on('wallet:updated', (data) => {
      console.log('Wallet updated:', data);
      useAuthStore.getState().updateWallet(data.balance, data.locked_amount);
      window.dispatchEvent(new CustomEvent('wallet:updated', { detail: data }));
    });

    socket.on('error', (error) => {
      console.error('Socket error:', error.code, error.message, error);
      window.dispatchEvent(new CustomEvent('socket:error', { detail: error }));
    });

    // Bid feedback
    socket.on('bid:rejected', (data) => {
      console.error('Bid rejected:', data);
      const errorMessages: Record<string, string> = {
        'BID_INSUFFICIENT_BALANCE': 'Not enough gold! Deposit more to place bids.',
        'BID_TOO_LOW': `Bid too low! Minimum is ${data.min_required}g`,
        'BID_ALREADY_WINNING': 'You are already the highest bidder!',
        'AUCTION_NOT_ACTIVE': 'This auction is not active.',
        'AUCTION_ENDED': 'This auction has ended.',
        'BID_INVALID_AMOUNT': 'Invalid bid amount.',
      };
      const message = errorMessages[data.error] || `Bid failed: ${data.error}`;
      window.dispatchEvent(new CustomEvent('bid:rejected', { detail: { ...data, message } }));
    });

    socket.on('bid:accepted', (data) => {
      console.log('Bid accepted:', data);
      window.dispatchEvent(new CustomEvent('bid:accepted', { detail: data }));
    });

    // Chat events
    socket.on('chat:message', (data) => {
      addMessage(data);
    });

    socket.on('chat:sent', (data) => {
      console.log('Chat message sent:', data);
    });

    // Participant events
    socket.on('user:joined', (data) => {
      addParticipant({
        user_id: data.user_id,
        username: data.username,
        avatar: data.avatar,
        alias: data.alias,
      });
    });

    socket.on('user:left', (data) => {
      removeParticipant(data.user_id);
    });

    return () => {
      socket.emit('leave:raid', { raid_id: raidId });
      socket.disconnect();
      socketRef.current = null;
      resetChat();
    };
  }, [token, raidId]);

  const placeBid = useCallback((itemId: string, amount: number) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('bid:place', { item_id: itemId, amount });
    }
  }, []);

  const sendChat = useCallback((message: string) => {
    if (socketRef.current?.connected && raidId) {
      socketRef.current.emit('chat:send', { raid_id: raidId, message });
    }
  }, [raidId]);

  const startAuction = useCallback((itemId: string, duration?: number, minBid?: number, increment?: number) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('auction:start', { item_id: itemId, duration, min_bid: minBid, increment });
    }
  }, []);

  return {
    socket: socketRef.current,
    placeBid,
    sendChat,
    startAuction,
    isConnected: socketRef.current?.connected ?? false,
  };
}
