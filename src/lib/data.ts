import 'server-only';
import { cache } from 'react';
import { db } from '@/db';
import * as s from '@/db/schema';
import { asc, desc } from 'drizzle-orm';
import { requireUser } from '@/lib/auth';
import { seedPreview } from '@/db/seed';

// React cache(): layout dashboard + page memanggil fungsi ini 2x per request —
// dengan cache, query hanya berjalan 1x (dedup per request, tanpa mengubah
// perilaku). Lihat audit K3.
export const getWorkspaceData = cache(async () => {
 const user = await requireUser();
 await seedPreview();
 const [fleet,clients,contracts,revisions,timesheets,invoices,payments,handovers,auditLogs,profiles,settings] = await Promise.all([
 db.select().from(s.fleet).orderBy(desc(s.fleet.createdAt),asc(s.fleet.unitCode)),
 db.select().from(s.clients).orderBy(desc(s.clients.createdAt)),
 db.select().from(s.contracts).orderBy(desc(s.contracts.createdAt)),
 db.select().from(s.contractRevisions).orderBy(desc(s.contractRevisions.createdAt)),
 db.select().from(s.timesheets).orderBy(desc(s.timesheets.date),desc(s.timesheets.createdAt)),
 db.select().from(s.invoices).orderBy(desc(s.invoices.issueDate),desc(s.invoices.createdAt)),
 db.select().from(s.payments).orderBy(desc(s.payments.paidAt),desc(s.payments.createdAt)),
 db.select().from(s.handovers).orderBy(desc(s.handovers.date),desc(s.handovers.createdAt)),
 db.select().from(s.auditLog).orderBy(desc(s.auditLog.createdAt)).limit(200),
 db.select().from(s.profiles).orderBy(asc(s.profiles.fullName)),
 db.select().from(s.companySettings).limit(1),
 ]);
 return {user,fleet,clients,contracts,revisions,timesheets,invoices,payments,handovers,auditLogs,profiles,settings:settings[0]||{id:'main',companyName:'PT Penyewaan Alat Berat',address:'Jakarta, Indonesia',email:'',phone:'',signerName:'',signerTitle:'',ppnRate:'11',expiryWarningDays:30}};
});
export type WorkspaceData = Awaited<ReturnType<typeof getWorkspaceData>>;
