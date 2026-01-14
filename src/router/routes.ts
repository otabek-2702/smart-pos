// src/router/routes.ts

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
      {
        path: '/kds',
        name: 'kds',
        component: () => import('pages/KDSPage.vue'),
      },
      {
        path: '/client-display',
        name: 'client-display',
        component: () => import('pages/ClientDisplayPage.vue'),
        meta: { fullscreen: true },
      },
      {
        path: '/cash-box',
        name: 'cash-box',
        component: () => import('pages/CashBoxPage.vue'),
      },

      // Settings routes (Admin only)
      {
        path: '/settings',
        component: () => import('pages/settings/SettingsLayout.vue'),
        meta: { requiresAdmin: true },
        children: [
          {
            path: '',
            redirect: { name: 'settings-receipt' },
          },
          {
            path: 'receipt',
            name: 'settings-receipt',
            component: () => import('pages/settings/ReceiptSettings.vue'),
          },
          {
            path: 'printer',
            name: 'settings-printer',
            component: () => import('pages/settings/PrinterSettings.vue'),
          },
        ],
      },
    ],
  },
];

export default routes;
