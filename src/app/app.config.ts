import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { AuthService } from './services/auth/auth.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // Carga sesión + profile antes de que el router resuelva la primera ruta.
    // Sin esto los guards correrían con role/businessId=null en el primer refresh.
    provideAppInitializer(() => inject(AuthService).initialize()),
  ],
};
