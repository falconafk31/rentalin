import { db } from '@/db';
import * as s from '@/db/schema';
import { and, inArray, sql } from 'drizzle-orm';
import { logAudit } from '@/lib/audit';
import { todayISO } from '@/lib/format';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Cron harian: tandai invoice unpaid/partial yang lewat jatuh tempo sebagai
// 'overdue'. Dijadwalkan via Vercel Cron (vercel.json) atau pg_cron — lihat
// ui-audit.md A-7. Diamankan dengan bearer CRON_SECRET.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return Response.json({ message: 'Tidak diizinkan.' }, { status: 401 });
  }
  // "Hari ini" mengikuti zona waktu perusahaan (WIB/WITA/WIT).
  const [cfg] = await db.select({ timezone: s.companySettings.timezone }).from(s.companySettings).limit(1);
  const updated = await db
    .update(s.invoices)
    .set({ status: 'overdue' })
    .where(and(inArray(s.invoices.status, ['unpaid', 'partial']), sql`${s.invoices.dueDate} < ${todayISO(cfg?.timezone)}`))
    .returning({ id: s.invoices.id });
  if (updated.length) {
    await logAudit({ action: 'cron', entity: 'invoices', summary: `Cron menandai ${updated.length} invoice sebagai jatuh tempo` });
  }
  return Response.json({ updated: updated.length });
}
