import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser, SessionStatus } from '@gdkp/shared';
import { api } from '../api/client';

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  needsAliasSetup: boolean;
  sessionStatus: SessionStatus;
  lockedAmount: number;
  setAuth: (user: AuthUser, token: string) => void;
  updateWallet: (balance: number, lockedAmount: number) => void;
  updateAlias: (alias: string) => Promise<void>;
  updateSessionStatus: (status: SessionStatus) => void;
  refreshToken: () => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: true,
      needsAliasSetup: false,
      sessionStatus: 'OFFLINE' as SessionStatus,
      lockedAmount: 0,

      setAuth: (user, token) => {
        set({
          user,
          token,
          isAuthenticated: true,
          isLoading: false,
          needsAliasSetup: !user.alias,
          sessionStatus: user.session_status,
        });
      },

      updateWallet: (balance, lockedAmount) => {
        set((state) => ({
          user: state.user ? { ...state.user, gold_balance: balance } : null,
          lockedAmount,
        }));
      },

      updateAlias: async (alias: string) => {
        const response = await api.patch('/users/me/alias', { alias });
        const updatedUser = response.data as AuthUser;
        set({ user: updatedUser, needsAliasSetup: false });
        // Refresh token to include new alias
        await get().refreshToken();
      },

      updateSessionStatus: (status: SessionStatus) => {
        set((state) => ({
          sessionStatus: status,
          user: state.user ? { ...state.user, session_status: status } : null,
        }));
      },

      refreshToken: async () => {
        try {
          const response = await api.post('/auth/refresh');
          const { token } = response.data;
          set({ token });
        } catch {
          // Ignore refresh errors, token will remain valid until expiry
        }
      },

      logout: async () => {
        // Call backend to clear session status
        try {
          await api.post('/auth/logout');
        } catch {
          // Continue with logout even if API fails
        }
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          needsAliasSetup: false,
          sessionStatus: 'OFFLINE',
          lockedAmount: 0,
        });
      },

      checkAuth: async () => {
        const { token } = get();
        if (!token) {
          set({ isLoading: false, sessionStatus: 'OFFLINE' });
          return;
        }

        try {
          const response = await api.get('/auth/me');
          const user = response.data as AuthUser;
          set({
            user,
            isAuthenticated: true,
            isLoading: false,
            needsAliasSetup: !user.alias,
            sessionStatus: user.session_status,
          });
        } catch {
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
            needsAliasSetup: false,
            sessionStatus: 'OFFLINE',
          });
        }
      },
    }),
    {
      name: 'gdkp-auth',
      partialize: (state) => ({ token: state.token }),
    }
  )
);
