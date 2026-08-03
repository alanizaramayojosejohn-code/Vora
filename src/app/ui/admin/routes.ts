import { Routes } from '@angular/router';
import { planGuard } from '../../guards/plan-guard';

export const AdminRoutes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'home' },
  {
    path: 'profile',
    loadComponent: () =>
      import('../shared/profile-page/component').then((m) => m.ProfilePageComponent),
  },
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
    path: 'categories',
    loadComponent: () =>
      import('./pages/categories/container/component').then(
        (m) => m.AdminCategoriesContainerComponent,
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
    path: 'staff',
    canActivate: [planGuard('staff')],
    loadComponent: () =>
      import('./pages/staff/container/component').then(
        (m) => m.AdminStaffContainerComponent,
      ),
  },
  {
    path: 'purchases',
    canActivate: [planGuard('purchases')],
    loadComponent: () =>
      import('./pages/purchases/container/component').then(
        (m) => m.PurchasesDashboardComponent,
      ),
  },
  {
    path: 'purchases/suppliers',
    canActivate: [planGuard('purchases')],
    loadComponent: () =>
      import('./pages/purchases/suppliers/component').then(
        (m) => m.PurchasesSuppliersComponent,
      ),
  },
  {
    path: 'purchases/acquisitions/new',
    canActivate: [planGuard('purchases')],
    loadComponent: () =>
      import('./pages/purchases/acquisitions/new/component').then(
        (m) => m.NewAcquisitionComponent,
      ),
  },
  {
    path: 'purchases/schedule',
    canActivate: [planGuard('purchases')],
    loadComponent: () =>
      import('./pages/purchases/schedule/component').then(
        (m) => m.PurchasesScheduleComponent,
      ),
  },
  {
    path: 'purchases/orders/new',
    canActivate: [planGuard('purchases')],
    loadComponent: () =>
      import('./pages/purchases/orders/new/component').then(
        (m) => m.NewPurchaseOrderComponent,
      ),
  },
  {
    path: 'reports',
    loadComponent: () =>
      import('./pages/reports/container/component').then(
        (m) => m.AdminReportsContainerComponent,
      ),
  },
  {
    path: 'sales',
    loadComponent: () =>
      import('../caja/pages/sales/container/component').then(
        (m) => m.CajaSalesContainerComponent,
      ),
  },
  {
    path: 'sales/new',
    loadComponent: () =>
      import('../caja/pages/sales/new/component').then(
        (m) => m.CajaSalesNewComponent,
      ),
  },
];
