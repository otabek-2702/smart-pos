import { defineRouter } from '#q-app/wrappers';
import {
  createMemoryHistory,
  createRouter,
  createWebHashHistory,
  createWebHistory,
} from 'vue-router';
import routes from './routes';
import { read } from 'src/utils/storage';

interface AuthUser {
  role: 'ADMIN' | 'CASHIER' | 'MANAGER';
}

/*
 * If not building with SSR mode, you can
 * directly export the Router instantiation;
 *
 * The function below can be async too; either use
 * async/await or return a Promise which resolves
 * with the Router instance.
 */

export default defineRouter(function (/* { store, ssrContext } */) {
  const createHistory = process.env.SERVER
    ? createMemoryHistory
    : process.env.VUE_ROUTER_MODE === 'history'
      ? createWebHistory
      : createWebHashHistory;

  const Router = createRouter({
    scrollBehavior: () => ({ left: 0, top: 0 }),
    routes,

    // Leave this as is and make changes in quasar.conf.js instead!
    // quasar.conf.js -> build -> vueRouterMode
    // quasar.conf.js -> build -> publicPath
    history: createHistory(process.env.VUE_ROUTER_BASE),
  });

  // Short-term role check. Will swap to a per-permission system once the
  // admin-editable permissions feature lands (route meta moves from
  // `requiresAdmin: true` to `permissions: [...]`).
  Router.beforeEach((to) => {
    const requiresAdmin = to.matched.some((r) => r.meta.requiresAdmin);
    if (!requiresAdmin) return true;

    const user = read<AuthUser>('auth_user');
    if (user?.role === 'ADMIN') return true;

    return { name: user ? 'orders' : 'users' };
  });

  return Router;
});
