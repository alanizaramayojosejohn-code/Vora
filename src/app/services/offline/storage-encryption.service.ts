import { Injectable } from '@angular/core';

const SESSION_KEY = 'saas_enc_k';
// Fixed salt — user ID is the actual entropy differentiator per-user
const SALT = new TextEncoder().encode('saascafes-local-2026');

@Injectable({ providedIn: 'root' })
export class StorageEncryptionService {
  private key: CryptoKey | null = null;

  get isReady(): boolean {
    return this.key !== null;
  }

  async setup(userId: string): Promise<void> {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) {
      try {
        const raw = Uint8Array.from(atob(stored), (c) => c.charCodeAt(0));
        this.key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, [
          'encrypt',
          'decrypt',
        ]);
        return;
      } catch {
        sessionStorage.removeItem(SESSION_KEY);
      }
    }

    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(userId),
      'PBKDF2',
      false,
      ['deriveKey'],
    );
    this.key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: SALT, iterations: 100_000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt'],
    );

    const exported = await crypto.subtle.exportKey('raw', this.key);
    sessionStorage.setItem(
      SESSION_KEY,
      btoa(String.fromCharCode(...new Uint8Array(exported))),
    );
  }

  clear(): void {
    this.key = null;
    sessionStorage.removeItem(SESSION_KEY);
  }

  async encrypt(data: unknown): Promise<string> {
    if (!this.key) throw new Error('StorageEncryptionService not initialized');
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(JSON.stringify(data));
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this.key, encoded);
    const combined = new Uint8Array(12 + cipher.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(cipher), 12);
    return btoa(String.fromCharCode(...combined));
  }

  async decrypt<T>(ciphertext: string): Promise<T> {
    if (!this.key) throw new Error('StorageEncryptionService not initialized');
    const combined = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const cipher = combined.slice(12);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, this.key, cipher);
    return JSON.parse(new TextDecoder().decode(plain)) as T;
  }
}
