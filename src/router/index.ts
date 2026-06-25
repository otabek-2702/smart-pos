import { defineRouter } from '#q-app/wrappers';
import {
  createMemoryHistory,
  createRouter,
  createWebHistory,
  createWebHashHistory,
} from 'vue-router';
import routes from './routes';
import { hasAllPermissions, getAuthUser } from 'src/composables/usePermissions';

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

  // Per-route access control. Two layers:
  //   1. meta.permissions: string[]  — checked via hasAllPermissions
  //      (ADMIN role and '*' bypass everything; see usePermissions).
  //   2. meta.requiresAdmin: true    — legacy gate, kept for any route
  //      that hasn't been migrated to meta.permissions yet.
  // A route may carry both; the user must satisfy whichever apply.
  Router.beforeEach((to) => {
    const user = getAuthUser();

    // Kitchen staff (CHEF) operate the KDS only — bounce them off cashier
    // pages onto the KDS. (Once logged out, user is null and this is skipped,
    // so logging back in via the picker still works.)
    if (user?.role === 'CHEF' && to.name !== 'kds') {
      return { name: 'kds' };
    }

    const required: string[] = to.matched.flatMap(
      (r) => (r.meta as { permissions?: string[] }).permissions ?? [],
    );
    const requiresAdmin = to.matched.some((r) => r.meta.requiresAdmin);

    if (!requiresAdmin && required.length === 0) return true;

    if (!user) return { name: 'users' };

    if (requiresAdmin) {
      const isAdmin =
        user.role === 'ADMIN' || (user.permissions ?? []).includes('*');
      if (!isAdmin) return { name: 'orders' };
    }

    if (required.length > 0 && !hasAllPermissions(required)) {
      return { name: 'orders' };
    }

    return true;
  });

  return Router;
});
