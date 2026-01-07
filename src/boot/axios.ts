import axios, { type AxiosInstance } from 'axios';
import { boot } from 'quasar/wrappers';

declare module 'vue' {
  interface ComponentCustomProperties {
    $axios: AxiosInstance;
    $api: AxiosInstance;
  }
}
const baseURL = localStorage.getItem('pos:IpAdress')
  ? `http://${localStorage.getItem('pos:IpAdress')}:8000`
  : '';

const api = axios.create({
  baseURL,
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

/* BOOT */
export default boot(({ app, router }) => {
  /* RESPONSE INTERCEPTOR — HANDLE 401 */
  api.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response?.status === 401) {
        localStorage.removeItem('auth_token');

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
