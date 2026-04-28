import { Routes } from '@angular/router';
import {
  adminGuard,
  authGuard,
  cajaGuard,
  superAdminGuard,
} from './guards/auth-guard';
import { AdminRoutes } from './ui/admin/routes';
import { CajaRoutes } from './ui/caja/routes';
import { PublicRoutes } from './ui/public/routes';
import { SaasRoutes } from './ui/saas/routes';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./ui/public/container/component').then(
        (m) => m.PublicContainerComponent,
      ),
    children: PublicRoutes,
  },
  {
    path: 'saas',
    canActivate: [authGuard, superAdminGuard],
    loadComponent: () =>
      import('./ui/saas/container/component').then(
        (m) => m.SaasContainerComponent,
      ),
    children: SaasRoutes,
  },
  {
    path: 'admin',
    canActivate: [authGuard, adminGuard],
    loadComponent: () =>
      import('./ui/admin/container/component').then(
        (m) => m.AdminContainerComponent,
      ),
    children: AdminRoutes,
  },
  {
    path: 'caja',
    canActivate: [authGuard, cajaGuard],
    loadComponent: () =>
      import('./ui/caja/container/component').then(
        (m) => m.CajaContainerComponent,
      ),
    children: CajaRoutes,
  },
  { path: '**', redirectTo: '' },
];
