import { Routes } from '@angular/router';

export const SaasRoutes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'home' },
  {
    path: 'profile',
    loadComponent: () =>
      import('../shared/profile-page/component').then((m) => m.ProfilePageComponent),
  },
  {
    path: 'home',
    loadComponent: () =>
      import('./pages/home/home.component').then((m) => m.SaasHomeComponent),
  },
  {
    path: 'businesses',
    loadComponent: () =>
      import('./pages/businesses/container/component').then(
        (m) => m.SaasBusinessesContainerComponent,
      ),
  },
];
