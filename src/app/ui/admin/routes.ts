import { Routes } from '@angular/router';

export const AdminRoutes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'home' },
  {
    path: 'home',
    loadComponent: () =>
      import('./pages/home/home.component').then((m) => m.AdminHomeComponent),
  },
  {
    path: 'clients',
    loadComponent: () =>
      import('./pages/clients/container/component').then(
        (m) => m.AdminClientsContainerComponent,
      ),
  },
  {
    path: 'products',
    loadComponent: () =>
      import('./pages/products/container/component').then(
        (m) => m.AdminProductsContainerComponent,
      ),
  },
  {
    path: 'membership-plans',
    loadComponent: () =>
      import('./pages/membership-plans/container/component').then(
        (m) => m.AdminMembershipPlansContainerComponent,
      ),
  },
  {
    path: 'users',
    loadComponent: () =>
      import('./pages/users/container/component').then(
        (m) => m.AdminUsersContainerComponent,
      ),
  },
  {
    path: 'reports',
    loadComponent: () =>
      import('./pages/reports/container/component').then(
        (m) => m.AdminReportsContainerComponent,
      ),
  },
];
