import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser } from '@gdkp/shared';
import { api } from '../api/client';

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  needsAliasSetup: boolean;
  setAuth: (user: AuthUser, token: string, needsAliasSetup?: boolean) => void;
  updateAlias: (alias: string) => Promise<void>;
  refreshToken: () => Promise<void>;
  logout: () => void;
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

      setAuth: (user, token, needsAliasSetup = false) => {
        set({ user, token, isAuthenticated: true, isLoading: false, needsAliasSetup });
      },

      updateAlias: async (alias: string) => {
        const response = await api.patch('/users/me/alias', { alias });
        const updatedUser = response.data as AuthUser;
        set({ user: updatedUser, needsAliasSetup: false });
        // Refresh token to include new alias
        await get().refreshToken();
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

      logout: () => {
        set({ user: null, token: null, isAuthenticated: false, needsAliasSetup: false });
        api.post('/auth/logout').catch(() => {});
      },

      checkAuth: async () => {
        const { token } = get();
        if (!token) {
          set({ isLoading: false });
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
          });
        } catch {
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
            needsAliasSetup: false,
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
