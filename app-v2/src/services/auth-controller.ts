import { onAuthStateChanged, setPersistence, browserLocalPersistence, type Auth, type User } from 'firebase/auth';
import { get, ref, type Database } from 'firebase/database';

export type PortalRole = 'athlete' | 'coach' | 'admin';
export type AuthPhase = 'booting' | 'signed_out' | 'loading_profile' | 'ready' | 'blocked' | 'error';

export interface PortalProfile {
  uid: string;
  role: PortalRole;
  status: string;
  displayName: string;
  email: string;
}

export interface AuthSnapshot {
  phase: AuthPhase;
  user: User | null;
  profile: PortalProfile | null;
  message?: string;
}

type Listener = (snapshot: AuthSnapshot) => void;

export class AuthController {
  private snapshot: AuthSnapshot = { phase: 'booting', user: null, profile: null };
  private listeners = new Set<Listener>();
  private unsubscribeAuth: (() => void) | null = null;
  private generation = 0;

  constructor(private auth: Auth, private db: Database, private requestedRole?: PortalRole) {}

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  private emit(next: AuthSnapshot) {
    this.snapshot = next;
    for (const listener of this.listeners) listener(next);
  }

  async start() {
    if (this.unsubscribeAuth) return;
    await setPersistence(this.auth, browserLocalPersistence);
    this.emit({ phase: 'booting', user: null, profile: null });

    this.unsubscribeAuth = onAuthStateChanged(this.auth, user => {
      const run = ++this.generation;
      void this.resolveAuth(run, user);
    });
  }

  stop() {
    this.generation++;
    this.unsubscribeAuth?.();
    this.unsubscribeAuth = null;
    this.listeners.clear();
  }

  private async resolveAuth(run: number, user: User | null) {
    if (run !== this.generation) return;
    if (!user) {
      this.emit({ phase: 'signed_out', user: null, profile: null });
      return;
    }

    this.emit({ phase: 'loading_profile', user, profile: null });
    try {
      const snap = await get(ref(this.db, `users/${user.uid}`));
      if (run !== this.generation) return;
      const raw = snap.val() || {};
      const role = String(raw.role || '').trim().toLowerCase() as PortalRole;
      const status = String(raw.status || 'active').trim().toLowerCase();

      if (!['athlete', 'coach', 'admin'].includes(role)) {
        this.emit({ phase: 'blocked', user, profile: null, message: 'บัญชีนี้ยังไม่มีสิทธิ์เข้าใช้งาน' });
        return;
      }
      if (this.requestedRole && role !== this.requestedRole) {
        this.emit({ phase: 'blocked', user, profile: null, message: `บัญชีนี้เป็น ${role} ไม่สามารถเข้า ${this.requestedRole} Portal ได้` });
        return;
      }
      if (role === 'coach' && status !== 'active') {
        this.emit({ phase: 'blocked', user, profile: null, message: 'บัญชี Coach ยังไม่ Active กรุณาติดต่อ Admin' });
        return;
      }

      const profile: PortalProfile = {
        uid: user.uid,
        role,
        status,
        displayName: String(raw.displayName || ''),
        email: String(raw.email || user.email || ''),
      };
      this.emit({ phase: 'ready', user, profile });
    } catch (error: any) {
      if (run !== this.generation) return;
      this.emit({ phase: 'error', user, profile: null, message: String(error?.message || error || 'โหลดสิทธิ์ไม่สำเร็จ') });
    }
  }
}
