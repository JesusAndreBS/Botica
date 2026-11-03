import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '../shared/api/client';

interface User { id: string; email: string; fullName: string; role: string; }
interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      refreshToken: null,
      user: null,
      login: async (email, password) => {
        const { data } = await api.post('/auth/login', { email, password });
        api.defaults.headers.common.Authorization = `Bearer ${data.accessToken}`;
        set({ token: data.accessToken, refreshToken: data.refreshToken, user: data.user });
      },
      logout: async () => {
        try { await api.post('/auth/logout', { refreshToken: get().refreshToken }); } catch {}
        delete api.defaults.headers.common.Authorization;
        set({ token: null, refreshToken: null, user: null });
      },
      hydrate: async () => {
        const state = get();
        if (state.token) {
          api.defaults.headers.common.Authorization = `Bearer ${state.token}`;
          try {
            const { data } = await api.get('/auth/me');
            set({ user: data });
          } catch {
            get().logout();
          }
        }
      }
    }),
    { name: 'auth-storage', partialize: s => ({ token: s.token, refreshToken: s.refreshToken, user: s.user }) }
  )
);