import { Routes } from '@angular/router';

export const CajaRoutes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'home' },
  {
    path: 'home',
    loadComponent: () =>
      import('./pages/home/home.component').then((m) => m.CajaHomeComponent),
  },
  {
    path: 'sales',
    loadComponent: () =>
      import('./pages/sales/container/component').then(
        (m) => m.CajaSalesContainerComponent,
      ),
  },
  {
    path: 'attendance',
    loadComponent: () =>
      import('./pages/attendance/container/component').then(
        (m) => m.CajaAttendanceContainerComponent,
      ),
  },
];
