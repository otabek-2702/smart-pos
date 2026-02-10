import { boot } from 'quasar/wrappers';
import Vue3Toastify, { type ToastContainerOptions } from 'vue3-toastify';
import 'vue3-toastify/dist/index.css';

export default boot(({ app }) => {
  app.use(Vue3Toastify, {
    autoClose: 1000,
    position: 'top-right',
    theme: 'light',
  } as ToastContainerOptions);
});