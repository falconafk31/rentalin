import 'server-only';
import { db } from '@/db';
import * as s from '@/db/schema';

// Jejak audit append-only (lihat migrasi 0011). Dipanggil dari Server Actions
// setelah tulis utama berhasil. Kegagalan audit TIDAK BOLEH menggagalkan
// transaksi bisnis — dicatat ke console agar terpantau di log server.
export async function logAudit(input: {
  actorId?: string | null;
  actorName?: string;
  action: 'create' | 'update' | 'delete' | 'approve' | 'reject' | 'pay' | 'complete' | 'revise' | 'reset' | 'role' | 'invite' | 'cron';
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
