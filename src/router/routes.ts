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
        // In-app update flow. Reachable from the OrdersPage footer badge; the
        // page itself gates the actual update behind a manager PIN / tech code.
        path: '/update',
        name: 'update',
        component: () => import('pages/UpdatePage.vue'),
      },
      {
        path: '/expenses',
        name: 'expenses',
        component: () => import('pages/ExpensesPage.vue'),
        meta: { permissions: ['expenses.manage'] },
      },
      {
        path: '/client-display',
        name: 'client-display',
        component: () => import('pages/ClientDisplayPage.vue'),
        meta: { fullscreen: true },
      },
      // Settings routes — per-permission access. Admins (role=ADMIN or
      // '*' permission) pass everything; non-admin power users get
      // access to the specific child whose permission they hold. The
      // parent gates the tree itself on `settings.view`; the sidebar
      // also hides child entries the user can't reach so they don't
      // bounce off the guard.
      {
        path: '/settings',
        component: () => import('pages/settings/SettingsLayout.vue'),
        meta: { permissions: ['settings.view'] },
        children: [
          {
            path: '',
            redirect: { name: 'settings-receipt' },
          },
          {
            path: 'receipt',
            name: 'settings-receipt',
            component: () => import('pages/settings/ReceiptSettings.vue'),
            meta: { permissions: ['receipt.manage'] },
          },
          {
            path: 'printer',
            name: 'settings-printer',
            component: () => import('pages/settings/PrinterSettings.vue'),
            meta: { permissions: ['printer.manage'] },
          },
          {
            path: 'display',
            name: 'settings-display',
            component: () => import('pages/settings/DisplaySettings.vue'),
            meta: { permissions: ['display.manage'] },
          },
          {
            path: 'order-types',
            name: 'settings-order-types',
            component: () => import('pages/settings/OrderTypesSettings.vue'),
            meta: { permissions: ['display.manage'] },
          },
          {
            path: 'discount',
            name: 'settings-discount',
            component: () => import('pages/settings/DiscountSettings.vue'),
            meta: { permissions: ['display.manage'] },
          },
          {
            path: 'categories',
            name: 'settings-categories',
            component: () => import('pages/settings/CategoriesSettings.vue'),
            meta: { permissions: ['categories.manage'] },
          },
          {
            path: 'users',
            name: 'settings-users',
            component: () => import('pages/settings/UsersSettings.vue'),
            meta: { permissions: ['users.manage'] },
          },
          {
            path: 'products',
            name: 'settings-products',
            component: () => import('pages/settings/ProductsSettings.vue'),
            meta: { permissions: ['products.manage'] },
          },
          {
            path: 'roles',
            name: 'settings-roles',
            component: () => import('pages/settings/RolesSettings.vue'),
            // Editing roles is an admin-only superpower — gated by '*'
            // (i.e. only admins / users with all perms).
            meta: { permissions: ['*'] },
          },
          {
            path: 'backup',
            name: 'settings-backup',
            component: () => import('pages/settings/BackupSettings.vue'),
            meta: { permissions: ['display.manage'] },
          },
          {
            path: 'courier-qr',
            name: 'settings-courier-qr',
            component: () => import('pages/settings/CourierQrSettings.vue'),
            meta: { permissions: ['users.manage'] },
          },
          {
            path: 'telegram-reports',
            name: 'settings-telegram-reports',
            component: () => import('pages/settings/TelegramReportsSettings.vue'),
            meta: { permissions: ['telegram.manage'] },
          },
        ],
      },
    ],
  },
];

export default routes;
