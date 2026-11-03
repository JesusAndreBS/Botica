import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001',
  headers: { 'Content-Type': 'application/json' }
});

api.interceptors.response.use(
  r => r,
  async err => {
    const original = err.config;
    if (err.response?.status === 401 && !original._retry && localStorage.getItem('auth-storage')) {
      original._retry = true;
      try {
        const { refreshToken } = JSON.parse(localStorage.getItem('auth-storage')!).state;
        const { data } = await axios.post(`${api.defaults.baseURL}/auth/refresh`, { refreshToken });
        api.defaults.headers.common.Authorization = `Bearer ${data.accessToken}`;
        const { useAuthStore } = await import('../features/auth/store');
        useAuthStore.setState({ token: data.accessToken, refreshToken: data.refreshToken });
        return api(original);
      } catch { localStorage.removeItem('auth-storage'); window.location.href = '/login'; }
    }
    return Promise.reject(err);
  }
);