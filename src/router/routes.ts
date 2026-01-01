import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('layouts/MainLayout.vue'),
    children: [
      {
        path: '',
        name: 'users',
        component: () => import('pages/IndexPage.vue'),
      },
      {
        path: 'pin',
        name: 'pin',
        component: () => import('pages/PinPage.vue'),
      },
      {
        path: 'orders',
        name: 'orders',
        component: () => import('pages/OrdersPage.vue'),
      },
      {
        path: 'create-order',
        name: 'create-order',
        component: () => import('pages/CreateOrderPage.vue'),
      },
    ],
  },
];

export default routes;
