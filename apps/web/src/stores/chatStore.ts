import { create } from 'zustand';
import type { ChatMessage } from '@gdkp/shared';

interface Participant {
  user_id: string;
  username: string;
  avatar: string | null;
  role?: string;
}

interface ChatState {
  messages: ChatMessage[];
  participants: Participant[];

  // Actions
  addMessage: (message: ChatMessage) => void;
  setMessages: (messages: ChatMessage[]) => void;
  addParticipant: (participant: Participant) => void;
  removeParticipant: (userId: string) => void;
  setParticipants: (participants: Participant[]) => void;
  reset: () => void;
}

export const useChatStore = create<ChatState>()((set) => ({
  messages: [],
  participants: [],

  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message].slice(-100), // Keep last 100 messages
    })),

  setMessages: (messages) => set({ messages }),

  addParticipant: (participant) =>
    set((state) => {
      // Check if already exists
      if (state.participants.some((p) => p.user_id === participant.user_id)) {
        return state;
      }
      return { participants: [...state.participants, participant] };
    }),

  removeParticipant: (userId) =>
    set((state) => ({
      participants: state.participants.filter((p) => p.user_id !== userId),
    })),

  setParticipants: (participants) => set({ participants }),

  reset: () => set({ messages: [], participants: [] }),
}));
