import axios, { type AxiosInstance } from 'axios';
import { boot } from 'quasar/wrappers';

declare module 'vue' {
  interface ComponentCustomProperties {
    $axios: AxiosInstance;
    $api: AxiosInstance;
  }
}

const api = axios.create({
  baseURL: 'http://192.168.11.204:8000/',
  timeout: 10_000,
});

/* REQUEST INTERCEPTOR — ADD TOKEN */
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

/* RESPONSE INTERCEPTOR — HANDLE 401 */
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('auth_token');
      // позже: router.push('/login')
    }

    return Promise.reject(error instanceof Error ? error : new Error('Request failed'));
  },
);

export default boot(({ app }) => {
  app.config.globalProperties.$axios = axios;
  app.config.globalProperties.$api = api;
});

export { api };
