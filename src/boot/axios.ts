import axios, { type AxiosInstance } from 'axios';
import { boot } from 'quasar/wrappers';
import { initStorage, read, remove } from 'src/utils/storage';

declare module 'vue' {
  interface ComponentCustomProperties {
    $axios: AxiosInstance;
    $api: AxiosInstance;
  }
}

// Created with no baseURL — set during boot() once kv-store has been read.
// Other modules import `api` at module-load time but don't fire requests
// until Vue components mount, which is after all boot files resolve.
const api = axios.create({
  timeout: 10_000,
});

/* REQUEST INTERCEPTOR — ADD TOKEN
   read() is synchronous because initStorage() pre-populated the in-memory
   cache during boot. */
api.interceptors.request.use((config) => {
  const token = read<string>('auth_token');

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

/* BOOT */
export default boot(async ({ app, router }) => {
  // 1. Pull the entire kv-store into the renderer's hot cache (one IPC).
  //    Also one-shot migrates any pre-refactor localStorage values.
  await initStorage();

  // 2. Resolve baseURL from the cached IP. Fallback to 127.0.0.1 for first
  //    boot before the user has set anything.
  const ip = read<string>('pos:IpAdress');
  api.defaults.baseURL = ip ? `http://${ip}:8000` : 'http://127.0.0.1:8000';

  /* RESPONSE INTERCEPTOR — HANDLE 401 */
  api.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response?.status === 401) {
        void remove('auth_token');

        // POS-safe redirect
        void router.push({ name: 'users' });
      }

      return Promise.reject(error instanceof Error ? error : new Error('Request failed'));
    },
  );

  app.config.globalProperties.$axios = axios;
  app.config.globalProperties.$api = api;
});

export { api };
