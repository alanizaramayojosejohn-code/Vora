import { Routes } from '@angular/router';

export const CajaRoutes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'home' },
  {
    path: 'profile',
    loadComponent: () =>
      import('../shared/profile-page/component').then((m) => m.ProfilePageComponent),
  },
  {
    path: 'home',
    loadComponent: () =>
      import('./pages/home/home.component').then((m) => m.CajaHomeComponent),
  },
  {
    path: 'turno',
    loadComponent: () =>
      import('./pages/shift/shift.component').then((m) => m.CajaShiftComponent),
  },
  {
    path: 'sales',
    loadComponent: () =>
      import('./pages/sales/container/component').then(
        (m) => m.CajaSalesContainerComponent,
      ),
  },
  {
    path: 'sales/new',
    loadComponent: () =>
      import('./pages/sales/new/component').then(
        (m) => m.CajaSalesNewComponent,
      ),
  },
  {
    path: 'clients',
    loadComponent: () =>
      import('../admin/pages/clients/container/component').then(
        (m) => m.AdminClientsContainerComponent,
      ),
  },
];
