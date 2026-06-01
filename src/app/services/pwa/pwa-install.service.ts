import { Injectable, isDevMode, signal } from '@angular/core';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'pwa_install_dismissed_until';
const DISMISS_DAYS = 7;

@Injectable({ providedIn: 'root' })
export class PwaInstallService {
  private deferredPrompt: BeforeInstallPromptEvent | null = null;

  readonly canInstall = signal(false);
  readonly isIos = signal(this.detectIos());

  constructor() {
    if (this.isStandalone()) return;
    if (this.isDismissedRecently()) return;

    if (isDevMode()) {
      this.canInstall.set(true);
      return;
    }

    if (this.isIos()) {
      this.canInstall.set(true);
      return;
    }

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e as BeforeInstallPromptEvent;
      this.canInstall.set(true);
    });

    window.addEventListener('appinstalled', () => {
      this.canInstall.set(false);
      this.deferredPrompt = null;
    });
  }

  async install(): Promise<void> {
    if (!this.deferredPrompt) {
      this.dismiss();
      return;
    }
    await this.deferredPrompt.prompt();
    const { outcome } = await this.deferredPrompt.userChoice;
    this.deferredPrompt = null;
    this.canInstall.set(false);
    if (outcome === 'dismissed') this.saveDismissal();
  }

  dismiss(): void {
    this.canInstall.set(false);
    this.saveDismissal();
  }

  private isStandalone(): boolean {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  }

  private isDismissedRecently(): boolean {
    const until = localStorage.getItem(DISMISSED_KEY);
    return !!until && new Date() < new Date(until);
  }

  private saveDismissal(): void {
    const until = new Date();
    until.setDate(until.getDate() + DISMISS_DAYS);
    localStorage.setItem(DISMISSED_KEY, until.toISOString());
  }

  private detectIos(): boolean {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as Window & { MSStream?: unknown }).MSStream;
  }
}
