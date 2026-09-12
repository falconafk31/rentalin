import 'server-only';
import { db } from '@/db';
import * as s from '@/db/schema';
import { eq } from 'drizzle-orm';
import { withFallback } from './resilient';

// Jejak audit append-only (lihat migrasi 0011). Dipanggil dari Server Actions
// setelah tulis utama berhasil. Kegagalan audit TIDAK BOLEH menggagalkan
// transaksi bisnis — dicatat ke console agar terpantau di log server.
export async function logAudit(input: {
  actorId?: string | null;
  actorName?: string;
  action: 'create' | 'update' | 'delete' | 'approve' | 'reject' | 'pay' | 'complete' | 'revise' | 'reset' | 'role' | 'invite' | 'cron' | 'login' | 'logout' | 'upload' | 'ban' | 'publish' | 'rollback';
  entity: string;
  entityId?: string | null;
  summary: string;
  before?: unknown;
  after?: unknown;
}) {
  try {
    await db.insert(s.auditLog).values({
      actorId: input.actorId || null,
      actorName: input.actorName || 'Sistem',
      action: input.action,
      entity: input.entity,
      entityId: input.entityId || null,
      summary: input.summary,
      beforeData: input.before ?? null,
      afterData: input.after ?? null,
    });
  } catch (error) {
    console.error('[audit] gagal menulis log:', (error as Error).message);
  }
}

// Nama pelaku best-effort (TASK-1B Finding 3): kegagalan baca profil TAK
// BOLEH menggagalkan login yang sudah terautentikasi. Tak pernah throw.
export async function getProfileNameBestEffort(userId: string, fallback: string): Promise<string> {
  // Thunk: Proxy db bisa melempar SYNCHRONOUSLY (DATABASE_URL hilang) —
  // withFallback menahannya juga. Tak pernah throw (Finding 3).
  return withFallback(async () => {
    const [profile] = await db.select({ fullName: s.profiles.fullName }).from(s.profiles).where(eq(s.profiles.id, userId));
    return profile?.fullName || fallback;
  }, fallback, 'audit');
}
