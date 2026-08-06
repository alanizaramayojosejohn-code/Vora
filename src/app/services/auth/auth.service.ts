import { computed, inject, Injectable, signal } from '@angular/core';
import type { Session } from '@supabase/supabase-js';
import { Profile, UserRole } from '../../models/profile.model';
import { SupabaseService } from '../supabase/supabase.service';
import { BusinessTheme, DEFAULT_THEME } from '../theme/theme.presets';
import { ThemeService } from '../theme/theme.service';
import { StorageEncryptionService } from '../offline/storage-encryption.service';
import { OfflineQueueService } from '../offline/offline-queue.service';
import { SubscriptionStateService } from '../subscription/subscription-state.service';

interface ProfileWithBusiness extends Profile {
  businesses: { theme: BusinessTheme | null; name: string; logo_url: string | null } | null;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly client = inject(SupabaseService).client;
  private readonly theme = inject(ThemeService);
  private readonly encryption = inject(StorageEncryptionService);
  private readonly offlineQueue = inject(OfflineQueueService);
  private readonly subscriptionState = inject(SubscriptionStateService);

  readonly session = signal<Session | null>(null);
  readonly profile = signal<Profile | null>(null);
  readonly businessName = signal<string | null>(null);
  readonly businessLogoUrl = signal<string | null>(null);
  readonly businessTheme = signal<BusinessTheme | null>(null);
  readonly unauthorizedEmail = signal<string | null>(null);

  readonly role = computed<UserRole | null>(() => this.profile()?.role ?? null);
  readonly businessId = computed<string | null>(() => this.profile()?.business_id ?? null);
  readonly isAuthenticated = computed(() => this.session() !== null);

  // Llamado por APP_INITIALIZER. Espera a que sesión + profile carguen
  // antes de que el router monte cualquier ruta. También captura el callback
  // de OAuth porque supabase-js procesa el hash de la URL en getSession().
  async initialize(): Promise<void> {
    const { data } = await this.client.auth.getSession();
    this.session.set(data.session);
    if (data.session) {
      await this.encryption.setup(data.session.user.id);
      await Promise.all([
        this.loadProfile(data.session.user.id),
        this.offlineQueue.loadFromStorage(),
      ]);
    }

    // Only update session signal here — never make DB queries inside this
    // callback. Making a Supabase query (loadProfile) while the auth-state
    // lock is held causes every concurrent RPC/query to hang indefinitely.
    // Login flows (email, Google OAuth) call loadProfile() directly after
    // sign-in, so no data is lost by omitting it here.
    this.client.auth.onAuthStateChange((_event, session) => {
      this.session.set(session);
      if (!session) {
        this.encryption.clear();
        this.offlineQueue.clearStorage();
        this.profile.set(null);
        this.businessName.set(null);
        this.businessLogoUrl.set(null);
        this.businessTheme.set(null);
        this.theme.reset();
      }
    });
  }

  async login(email: string, password: string): Promise<void> {
    this.unauthorizedEmail.set(null);
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!data.session) throw new Error('No se pudo iniciar sesión');
    this.session.set(data.session);
    await this.encryption.setup(data.session.user.id);
    await Promise.all([
      this.loadProfile(data.session.user.id),
      this.offlineQueue.loadFromStorage(),
    ]);
    if (this.profile() === null) {
      throw new Error('Tu cuenta no está autorizada en Vora. Contacta al administrador.');
    }
  }

  // No retorna: redirige el navegador a Google. Vuelve a /login con el hash
  // OAuth, que supabase-js procesa automáticamente al cargar la app.
  async loginWithGoogle(): Promise<void> {
    this.unauthorizedEmail.set(null);
    const { error } = await this.client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/login`,
      },
    });
    if (error) throw error;
  }

  async logout(): Promise<void> {
    this.offlineQueue.clearStorage();
    this.encryption.clear();
    // Sin esto, el siguiente usuario en la misma tablet hereda el estado de
    // suscripción cacheado del anterior.
    this.subscriptionState.reset();
    await this.client.auth.signOut();
    this.session.set(null);
    this.profile.set(null);
    this.businessName.set(null);
    this.businessLogoUrl.set(null);
    this.businessTheme.set(null);
    this.unauthorizedEmail.set(null);
    this.theme.reset();
  }

  async updatePassword(currentPassword: string, newPassword: string): Promise<void> {
    const email = this.session()?.user.email;
    if (!email) throw new Error('No hay sesión activa.');

    // Verificar contraseña actual re-autenticando antes de actualizar.
    const { error: verifyError } = await this.client.auth.signInWithPassword({
      email,
      password: currentPassword,
    });
    if (verifyError) throw new Error('La contraseña actual es incorrecta.');

    const { error: updateError } = await this.client.auth.updateUser({ password: newPassword });
    if (updateError) throw updateError;
  }

  private async loadProfile(userId: string): Promise<void> {
    const { data, error } = await this.client
      .from('profiles')
      .select('*, businesses(theme, name, logo_url)')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('Error cargando profile', error);
      this.profile.set(null);
      this.businessName.set(null);
      this.businessLogoUrl.set(null);
      this.businessTheme.set(null);
      this.theme.reset();
      return;
    }

    if (!data) {
      // Sesión válida pero sin profile (ej: Google OAuth de un email
      // que el super_admin nunca dio de alta). Cierra sesión para no
      // dejar token huérfano y marca el email como no autorizado.
      const email = this.session()?.user.email ?? null;
      this.unauthorizedEmail.set(email);
      await this.client.auth.signOut();
      this.session.set(null);
      this.profile.set(null);
      this.businessName.set(null);
      this.businessLogoUrl.set(null);
      this.businessTheme.set(null);
      this.theme.reset();
      return;
    }

    const { businesses, ...profile } = data as ProfileWithBusiness;
    this.profile.set(profile);
    this.businessName.set(businesses?.name ?? null);
    this.businessLogoUrl.set(businesses?.logo_url ?? null);

    // Aplica el preset del negocio (incluyendo customColors si es 'custom').
    // El mode (light/dark/system) lo gestiona el theme.service por su cuenta
    // desde localStorage — es preferencia del usuario, no del negocio.
    // super_admin no tiene business asignado → usa su tema personal en
    // localStorage (guardado desde la página de perfil), o cae a default.
    let businessTheme: BusinessTheme;
    if (businesses?.theme) {
      businessTheme = {
        preset: businesses.theme.preset,
        ...(businesses.theme.customColors
          ? { customColors: businesses.theme.customColors }
          : {}),
      };
    } else if (profile.role === 'super_admin') {
      businessTheme = this.theme.loadPersonalPreset() ?? DEFAULT_THEME;
    } else {
      businessTheme = DEFAULT_THEME;
    }
    this.businessTheme.set(businessTheme);
    this.theme.applyPreset(businessTheme);
  }
}
