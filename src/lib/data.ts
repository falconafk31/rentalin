import 'server-only';
import { cache } from 'react';
import { db } from '@/db';
import * as s from '@/db/schema';
import { and, or, eq, ilike, isNotNull, desc, asc, count, sql, getTableColumns, type SQL } from 'drizzle-orm';
import type { SQLWrapper } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { requireUser, getCurrentUser, type SessionUser } from '@/lib/auth';
import { todayISO } from '@/lib/format';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { seedPreview } from '@/db/seed';

// ---------------------------------------------------------------------------
// O-A (isu #10 / audit.md O1): paginasi + filter SERVER-SIDE per modul.
// Sebelumnya satu `getWorkspaceData()` mem-fetch 7 tabel penuh 2× per request
// (layout + page) lalu mengirim seluruhnya ke browser — pencarian, filter,
// sort, dan paging dikerjakan di client atas data penuh (temuan L7/K7).
// Sekarang: layout memakai `getShellData()` (ramping: user + settings + count),
// halaman modul memakai `getModulePage()` (WHERE/LIMIT/OFFSET di SQL), dasbor
// memakai agregat `getDashboardData()` (SUM/GROUP BY di SQL), dan PDF/CSV
// memakai query titik (`getDocumentBundle`) / ekspor terarah (`getReportData`).
// ---------------------------------------------------------------------------

export type CompanySettings = typeof s.companySettings.$inferSelect;
export type FleetRow = typeof s.fleet.$inferSelect;
export type ProfileRow = typeof s.profiles.$inferSelect;
export type AuditRow = typeof s.auditLog.$inferSelect;
export type PaymentRow = typeof s.payments.$inferSelect;
export type ClientRow = typeof s.clients.$inferSelect & { contractCount: number };
export type ContractRow = typeof s.contracts.$inferSelect & { clientName: string | null; unitCode: string | null; unitModel: string | null };
export type TimesheetRow = typeof s.timesheets.$inferSelect & { contractNumber: string | null; unitCode: string | null; unitModel: string | null };
export type HandoverRow = typeof s.handovers.$inferSelect & { contractNumber: string | null; clientName: string | null };
export type InvoiceRow = typeof s.invoices.$inferSelect & { contractNumber: string | null; clientName: string | null; paidAmount: number };
// Baris hasil getModulePage: record utuh (untuk form Ubah) + label hasil JOIN.
export type ModuleRow = FleetRow | ClientRow | ContractRow | TimesheetRow | HandoverRow | InvoiceRow;

const fallbackSettings: CompanySettings = { id: 'main', companyName: 'PT Penyewaan Alat Berat', address: 'Jakarta, Indonesia', email: '', phone: '', signerName: '', signerTitle: '', ppnRate: '11', expiryWarningDays: 30, city: 'Jakarta', timezone: 'WIB', npwp: '', signerKtp: '', bankName: '', bankAccountName: '', bankAccountNumber: '' };

export const MODULE_SLUGS = ['fleet', 'clients', 'contracts', 'timesheets', 'bast', 'invoices', 'settings'] as const;
export type ModuleSlug = (typeof MODULE_SLUGS)[number];
export const MODULE_PAGE_SIZE = 8;

export type ModuleFilters = { q: string; status: string; category: string; expiringOnly: boolean; page: number; sort: number };

// Param ILIKE: escape % _ \ agar ketikan user tidak dianggap wildcard.
const likeParam = (q: string) => `%${q.replace(/[\\%_]/g, '\\$&')}%`;
// Aritmetika kalender TZ-aman (paritas dengan daysUntil/isExpiringSoon di
// format.ts): tambah hari pada komponen y-m-d, bukan new Date('YYYY-MM-DD').
const addDaysISO = (iso: string, days: number) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};
// Kondisi "dokumen armada memerlukan perhatian" — SIKO/asuransi lewat ATAU
// berakhir dalam `warnDays` hari (di SQL; dipakai filter banner + hitungan).
const expiringCondition = (warnUntil: string) =>
  or(and(isNotNull(s.fleet.sikoExpiry), sql`${s.fleet.sikoExpiry} <= ${warnUntil}`), and(isNotNull(s.fleet.insuranceExpiry), sql`${s.fleet.insuranceExpiry} <= ${warnUntil}`));

const orderFor = (sort: number, sortCol: AnyPgColumn | SQL, fallback: (AnyPgColumn | SQL)[]): (AnyPgColumn | SQL)[] =>
  sort === 1 ? [asc(sortCol)] : sort === -1 ? [desc(sortCol)] : fallback;

const asStatusMap = (rows: { status: string | null; n: number }[]) =>
  Object.fromEntries(rows.map(r => [String(r.status), Number(r.n)]));

async function getSettingsRow(): Promise<CompanySettings> {
  const [row] = await db.select().from(s.companySettings).limit(1);
  return row ?? fallbackSettings;
}

// --- Data shell (ramping) ---------------------------------------------------
// Dipakai dashboard/layout.tsx: identitas, settings, dan 4 angka badge —
// BUKAN lagi 7 tabel penuh. Pencarian global pindah ke /api/search (async).
export type ShellData = {
  user: SessionUser;
  settings: CompanySettings;
  counts: { pendingTimesheets: number; unpaidInvoices: number; overdueInvoices: number; expiringFleet: number };
};

export const getShellData = cache(async (): Promise<ShellData> => {
  const [user, settings] = await Promise.all([getCurrentUser(), getSettingsRow()]);
  await seedPreview();
  // "Hari ini" mengikuti zona waktu perusahaan (WIB/WITA/WIT) — kalender
  // lokal untuk badge jatuh tempo, bukan selalu kalender Jakarta.
  const today = todayISO(settings.timezone);
  const warnUntil = addDaysISO(today, Number(settings.expiryWarningDays) || 30);
  const [pending, unpaid, overdue, expiring] = await Promise.all([
    db.select({ n: count() }).from(s.timesheets).where(eq(s.timesheets.status, 'pending')),
    db.select({ n: count() }).from(s.invoices).where(sql`${s.invoices.status} <> 'paid'`),
    db.select({ n: count() }).from(s.invoices).where(and(sql`${s.invoices.status} <> 'paid'`, sql`${s.invoices.dueDate} < ${today}`)),
    db.select({ n: count() }).from(s.fleet).where(expiringCondition(warnUntil)),
  ]);
  return {
    user,
    settings,
    counts: {
      pendingTimesheets: Number(pending[0]?.n ?? 0),
      unpaidInvoices: Number(unpaid[0]?.n ?? 0),
      overdueInvoices: Number(overdue[0]?.n ?? 0),
      expiringFleet: Number(expiring[0]?.n ?? 0),
    },
  };
});

// --- Pencarian global (dipakai /api/search) --------------------------------
export type SearchResult = { label: string; sub: string; path: string };

export async function searchGlobal(query: string): Promise<SearchResult[]> {
  const trimmed = query.trim().slice(0, 100);
  if (!trimmed) return [];
  const like = likeParam(trimmed);
  const [fleetR, clientR, contractR, bastR, invoiceR] = await Promise.all([
    db.select({ unitCode: s.fleet.unitCode, brandModel: s.fleet.brandModel }).from(s.fleet)
      .where(or(ilike(s.fleet.unitCode, like), ilike(s.fleet.brandModel, like))).orderBy(desc(s.fleet.createdAt)).limit(7),
    db.select({ companyName: s.clients.companyName }).from(s.clients)
      .where(or(ilike(s.clients.companyName, like), ilike(s.clients.picName, like))).orderBy(desc(s.clients.createdAt)).limit(7),
    db.select({ contractNumber: s.contracts.contractNumber }).from(s.contracts)
      .where(ilike(s.contracts.contractNumber, like)).orderBy(desc(s.contracts.createdAt)).limit(7),
    db.select({ documentNumber: s.handovers.documentNumber }).from(s.handovers)
      .where(ilike(s.handovers.documentNumber, like)).orderBy(desc(s.handovers.createdAt)).limit(7),
    db.select({ invoiceNumber: s.invoices.invoiceNumber }).from(s.invoices)
      .where(ilike(s.invoices.invoiceNumber, like)).orderBy(desc(s.invoices.issueDate)).limit(7),
  ]);
  return [
    ...fleetR.map(f => ({ label: `${f.unitCode} · ${f.brandModel}`, sub: 'Armada Alat Berat', path: `/dashboard/fleet?q=${encodeURIComponent(f.unitCode)}` })),
    ...clientR.map(c => ({ label: c.companyName, sub: 'Data Klien', path: `/dashboard/clients?q=${encodeURIComponent(c.companyName)}` })),
    ...contractR.map(c => ({ label: c.contractNumber, sub: '1. Kontrak Sewa', path: `/dashboard/contracts?q=${encodeURIComponent(c.contractNumber)}` })),
    ...bastR.map(h => ({ label: h.documentNumber, sub: '2. BAST Serah Terima', path: `/dashboard/bast?q=${encodeURIComponent(h.documentNumber)}` })),
    ...invoiceR.map(i => ({ label: i.invoiceNumber, sub: '4. Penagihan Invoice', path: `/dashboard/invoices?q=${encodeURIComponent(i.invoiceNumber)}` })),
  ].slice(0, 7);
}

// --- getModulePage: satu query per modul, WHERE/LIMIT/OFFSET di server ------
// Tab status tetap menampilkan hitungan dataset penuh (GROUP BY, tanpa filter
// pencarian/kategori) — paritas dengan perilaku lama sebelum dipindah server.
export type ModulePageData = {
  module: ModuleSlug;
  user: SessionUser;
  settings: CompanySettings;
  // Filter efektif (halaman sudah di-clamp) — di-echo agar client memakai
  // nilai yang sama dengan server untuk membangun URL navigasi berikutnya.
  filters: ModuleFilters;
  rows: ModuleRow[];
  total: number;
  page: number;
  pageCount: number;
  statusCounts: Record<string, number>;
  fleetGroups?: [string, number][];
  expiringCount?: number;
  categoryOptions?: string[];
  invoiceTotals?: { all: number; collected: number; paidCount: number; unpaidCount: number };
};

export async function getModulePage(module: string, filters: ModuleFilters): Promise<ModulePageData | null> {
  if (!MODULE_SLUGS.includes(module as ModuleSlug)) return null;
  // Autentikasi, seed preview, dan settings saling bebas — dijalankan
  // paralel (sebelumnya 3 await berurutan = 3 round-trip beruntun).
  const [user, settings] = await Promise.all([requireUser(), getSettingsRow(), seedPreview()]);
  const warnUntil = addDaysISO(todayISO(settings.timezone), Number(settings.expiryWarningDays) || 30);
  const like = likeParam(filters.q);
  const hasQ = filters.q.trim().length > 0;
  const base = { module: module as ModuleSlug, user, settings };
  const requestedPage = Math.max(1, Math.floor(filters.page) || 1);

  // Halaman di luar jangkauan (URL lama/tampan) dikembalikan ke halaman
  // terakhir yang valid — paritas dengan clamp client sebelumnya.
  const resolvePage = async <T,>(rowsQuery: (pg: number) => Promise<T[]>, total: number, rowsAtRequested: T[]) => {
    const pageCount = Math.max(1, Math.ceil(total / MODULE_PAGE_SIZE));
    const page = Math.min(requestedPage, pageCount);
    const rows = !rowsAtRequested.length && page !== requestedPage ? await rowsQuery(page) : rowsAtRequested;
    return { rows, page, pageCount };
  };

  if (module === 'settings') {
    return { ...base, filters: { ...filters, page: 1 }, rows: [], total: 0, page: 1, pageCount: 1, statusCounts: {} };
  }

  if (module === 'fleet') {
    const qCond: SQL | undefined = hasQ ? or(ilike(s.fleet.unitCode, like), ilike(s.fleet.brandModel, like), ilike(s.fleet.category, like), ilike(s.fleet.currentLocation, like)) : undefined;
    const expCond = filters.expiringOnly ? expiringCondition(warnUntil) : undefined;
    const statusCond = filters.status !== 'all' ? eq(s.fleet.status, filters.status) : undefined;
    const catCond = filters.category !== 'all' ? eq(s.fleet.category, filters.category) : undefined;
    const rowsWhere = and(qCond, expCond, statusCond, catCond);
    const rowsQuery = (pg: number) => db.select().from(s.fleet).where(rowsWhere)
      .orderBy(...orderFor(filters.sort, s.fleet.unitCode, [desc(s.fleet.createdAt), asc(s.fleet.unitCode)]))
      .limit(MODULE_PAGE_SIZE).offset((pg - 1) * MODULE_PAGE_SIZE);
    const [rowsRes, totalRes, statusRes, datasetRes, groupRes, expiringRes, catRes] = await Promise.all([
      rowsQuery(requestedPage),
      db.select({ n: count() }).from(s.fleet).where(rowsWhere),
      db.select({ status: s.fleet.status, n: count() }).from(s.fleet).where(expCond).groupBy(s.fleet.status),
      db.select({ n: count() }).from(s.fleet).where(expCond),
      db.select({ brandModel: s.fleet.brandModel, category: s.fleet.category, n: count() }).from(s.fleet)
        .groupBy(s.fleet.brandModel, s.fleet.category).orderBy(sql`count(*) desc`, asc(s.fleet.brandModel)).limit(6),
      db.select({ n: count() }).from(s.fleet).where(expiringCondition(warnUntil)),
      db.selectDistinct({ category: s.fleet.category }).from(s.fleet).orderBy(asc(s.fleet.category)),
    ]);
    const { rows, page, pageCount } = await resolvePage(rowsQuery, Number(totalRes[0]?.n ?? 0), rowsRes);
    return {
      ...base,
      filters: { ...filters, page },
      rows,
      total: Number(totalRes[0]?.n ?? 0),
      page,
      pageCount,
      statusCounts: { all: Number(datasetRes[0]?.n ?? 0), ...asStatusMap(statusRes) },
      fleetGroups: groupRes.map(g => [`${g.brandModel} · ${g.category}`, Number(g.n)] as [string, number]),
      expiringCount: Number(expiringRes[0]?.n ?? 0),
      categoryOptions: catRes.map(r => r.category),
    };
  }

  if (module === 'clients') {
    const qCond = hasQ ? or(ilike(s.clients.companyName, like), ilike(s.clients.picName, like), ilike(s.clients.picEmail, like)) : undefined;
    const rowsWhere = and(qCond);
    const rowsQuery = (pg: number) => db.select({
      ...getTableColumns(s.clients),
      // Jumlah kontrak per klien — subquery berkorelasi, menggantikan
      // pengiriman seluruh tabel contracts ke client.
      contractCount: sql<number>`(select count(*) from ${s.contracts} where ${s.contracts.clientId} = ${s.clients.id})`.mapWith(Number),
    }).from(s.clients).where(rowsWhere)
      .orderBy(...orderFor(filters.sort, s.clients.companyName, [desc(s.clients.createdAt)]))
      .limit(MODULE_PAGE_SIZE).offset((pg - 1) * MODULE_PAGE_SIZE);
    const [rowsRes, totalRes, datasetRes] = await Promise.all([
      rowsQuery(requestedPage),
      db.select({ n: count() }).from(s.clients).where(rowsWhere),
      db.select({ n: count() }).from(s.clients),
    ]);
    const { rows, page, pageCount } = await resolvePage(rowsQuery, Number(totalRes[0]?.n ?? 0), rowsRes);
    return { ...base, filters: { ...filters, page }, rows, total: Number(totalRes[0]?.n ?? 0), page, pageCount, statusCounts: { all: Number(datasetRes[0]?.n ?? 0) } };
  }

  if (module === 'contracts') {
    const rowsQuery = (pg: number) => db.select({
      ...getTableColumns(s.contracts), clientName: s.clients.companyName, unitCode: s.fleet.unitCode, unitModel: s.fleet.brandModel,
    }).from(s.contracts)
      .leftJoin(s.clients, eq(s.clients.id, s.contracts.clientId))
      .leftJoin(s.fleet, eq(s.fleet.id, s.contracts.unitId))
      .where(and(hasQ ? or(ilike(s.contracts.contractNumber, like), ilike(s.clients.companyName, like), ilike(s.fleet.unitCode, like)) : undefined, filters.status !== 'all' ? eq(s.contracts.status, filters.status) : undefined))
      .orderBy(...orderFor(filters.sort, s.contracts.contractNumber, [desc(s.contracts.createdAt)]))
      .limit(MODULE_PAGE_SIZE).offset((pg - 1) * MODULE_PAGE_SIZE);
    const [rowsRes, totalRes, statusRes, datasetRes] = await Promise.all([
      rowsQuery(requestedPage),
      db.select({ n: count() }).from(s.contracts)
        .leftJoin(s.clients, eq(s.clients.id, s.contracts.clientId))
        .leftJoin(s.fleet, eq(s.fleet.id, s.contracts.unitId))
        .where(and(hasQ ? or(ilike(s.contracts.contractNumber, like), ilike(s.clients.companyName, like), ilike(s.fleet.unitCode, like)) : undefined, filters.status !== 'all' ? eq(s.contracts.status, filters.status) : undefined)),
      db.select({ status: s.contracts.status, n: count() }).from(s.contracts).groupBy(s.contracts.status),
      db.select({ n: count() }).from(s.contracts),
    ]);
    const { rows, page, pageCount } = await resolvePage(rowsQuery, Number(totalRes[0]?.n ?? 0), rowsRes);
    return { ...base, filters: { ...filters, page }, rows, total: Number(totalRes[0]?.n ?? 0), page, pageCount, statusCounts: { all: Number(datasetRes[0]?.n ?? 0), ...asStatusMap(statusRes) } };
  }

  if (module === 'timesheets') {
    const rowsQuery = (pg: number) => db.select({
      ...getTableColumns(s.timesheets), contractNumber: s.contracts.contractNumber, unitCode: s.fleet.unitCode, unitModel: s.fleet.brandModel,
    }).from(s.timesheets)
      .leftJoin(s.contracts, eq(s.contracts.id, s.timesheets.contractId))
      .leftJoin(s.fleet, eq(s.fleet.id, s.timesheets.unitId))
      .where(and(hasQ ? or(sql`${s.timesheets.date}::text like ${like}`, ilike(s.contracts.contractNumber, like), ilike(s.fleet.unitCode, like)) : undefined, filters.status !== 'all' ? eq(s.timesheets.status, filters.status) : undefined))
      .orderBy(...orderFor(filters.sort, s.timesheets.date, [desc(s.timesheets.date), desc(s.timesheets.createdAt)]))
      .limit(MODULE_PAGE_SIZE).offset((pg - 1) * MODULE_PAGE_SIZE);
    const [rowsRes, totalRes, statusRes, datasetRes] = await Promise.all([
      rowsQuery(requestedPage),
      db.select({ n: count() }).from(s.timesheets)
        .leftJoin(s.contracts, eq(s.contracts.id, s.timesheets.contractId))
        .leftJoin(s.fleet, eq(s.fleet.id, s.timesheets.unitId))
        .where(and(hasQ ? or(sql`${s.timesheets.date}::text like ${like}`, ilike(s.contracts.contractNumber, like), ilike(s.fleet.unitCode, like)) : undefined, filters.status !== 'all' ? eq(s.timesheets.status, filters.status) : undefined)),
      db.select({ status: s.timesheets.status, n: count() }).from(s.timesheets).groupBy(s.timesheets.status),
      db.select({ n: count() }).from(s.timesheets),
    ]);
    const { rows, page, pageCount } = await resolvePage(rowsQuery, Number(totalRes[0]?.n ?? 0), rowsRes);
    return { ...base, filters: { ...filters, page }, rows, total: Number(totalRes[0]?.n ?? 0), page, pageCount, statusCounts: { all: Number(datasetRes[0]?.n ?? 0), ...asStatusMap(statusRes) } };
  }

  if (module === 'bast') {
    const rowsQuery = (pg: number) => db.select({
      ...getTableColumns(s.handovers), contractNumber: s.contracts.contractNumber, clientName: s.clients.companyName,
    }).from(s.handovers)
      .leftJoin(s.contracts, eq(s.contracts.id, s.handovers.contractId))
      .leftJoin(s.clients, eq(s.clients.id, s.contracts.clientId))
      .where(and(hasQ ? or(ilike(s.handovers.documentNumber, like), ilike(s.contracts.contractNumber, like)) : undefined, filters.status !== 'all' ? eq(s.handovers.type, filters.status) : undefined))
      .orderBy(...orderFor(filters.sort, s.handovers.documentNumber, [desc(s.handovers.date), desc(s.handovers.createdAt)]))
      .limit(MODULE_PAGE_SIZE).offset((pg - 1) * MODULE_PAGE_SIZE);
    const [rowsRes, totalRes, statusRes, datasetRes] = await Promise.all([
      rowsQuery(requestedPage),
      db.select({ n: count() }).from(s.handovers)
        .leftJoin(s.contracts, eq(s.contracts.id, s.handovers.contractId))
        .leftJoin(s.clients, eq(s.clients.id, s.contracts.clientId))
        .where(and(hasQ ? or(ilike(s.handovers.documentNumber, like), ilike(s.contracts.contractNumber, like)) : undefined, filters.status !== 'all' ? eq(s.handovers.type, filters.status) : undefined)),
      db.select({ status: s.handovers.type, n: count() }).from(s.handovers).groupBy(s.handovers.type),
      db.select({ n: count() }).from(s.handovers),
    ]);
    const { rows, page, pageCount } = await resolvePage(rowsQuery, Number(totalRes[0]?.n ?? 0), rowsRes);
    return { ...base, filters: { ...filters, page }, rows, total: Number(totalRes[0]?.n ?? 0), page, pageCount, statusCounts: { all: Number(datasetRes[0]?.n ?? 0), ...asStatusMap(statusRes) } };
  }

  // module === 'invoices' — status tampil mengikuti logika UI lama: belum lunas
  // + lewat jatuh tempo = "overdue" (dievaluasi di SQL lewat CASE).
  const displayStatus = sql<string>`(case when ${s.invoices.status} <> 'paid' and ${s.invoices.dueDate} < ${todayISO(settings.timezone)} then 'overdue' else ${s.invoices.status} end)`;
  const invoiceWhere = and(
    hasQ ? or(ilike(s.invoices.invoiceNumber, like), ilike(s.clients.companyName, like)) : undefined,
    filters.status !== 'all' ? sql`${displayStatus} = ${filters.status}` : undefined,
  );
  const rowsQuery = (pg: number) => db.select({
    ...getTableColumns(s.invoices),
    contractNumber: s.contracts.contractNumber,
    clientName: s.clients.companyName,
    // Akumulasi pembayaran per tagihan — subquery, menggantikan pengiriman
    // seluruh tabel payments ke client.
    paidAmount: sql<number>`(select coalesce(sum(p.amount), 0) from payments p where p.invoice_id = ${s.invoices.id})`.mapWith(Number),
  }).from(s.invoices)
    .leftJoin(s.contracts, eq(s.contracts.id, s.invoices.contractId))
    .leftJoin(s.clients, eq(s.clients.id, s.contracts.clientId))
    .where(invoiceWhere)
    .orderBy(...orderFor(filters.sort, s.invoices.invoiceNumber, [desc(s.invoices.issueDate), desc(s.invoices.createdAt)]))
    .limit(MODULE_PAGE_SIZE).offset((pg - 1) * MODULE_PAGE_SIZE);
  const [rowsRes, totalRes, statusRes, datasetRes, totalsRes, collectedRes] = await Promise.all([
    rowsQuery(requestedPage),
    db.select({ n: count() }).from(s.invoices)
      .leftJoin(s.contracts, eq(s.contracts.id, s.invoices.contractId))
      .leftJoin(s.clients, eq(s.clients.id, s.contracts.clientId))
      .where(invoiceWhere),
    db.select({ status: displayStatus, n: count() }).from(s.invoices)
      // GROUP BY 1 (ordinal) — drizzle merender ekspresi CASE secara berbeda
      // di SELECT vs GROUP BY sehingga pencocokan teks ekspresi ditolak PG.
      .groupBy(sql`1`),
    db.select({ n: count() }).from(s.invoices),
    db.select({
      all: sql<string>`coalesce(sum(${s.invoices.totalAmount}), 0)`,
      paidCount: sql<number>`count(*) filter (where ${s.invoices.status} = 'paid')`.mapWith(Number),
      unpaidCount: sql<number>`count(*) filter (where ${s.invoices.status} <> 'paid')`.mapWith(Number),
    }).from(s.invoices),
    db.select({ collected: sql<string>`coalesce(sum(${s.payments.amount}), 0)` }).from(s.payments),
  ]);
  const { rows, page, pageCount } = await resolvePage(rowsQuery, Number(totalRes[0]?.n ?? 0), rowsRes);
  return {
    ...base,
    filters: { ...filters, page },
    rows,
    total: Number(totalRes[0]?.n ?? 0),
    page,
    pageCount,
    statusCounts: { all: Number(datasetRes[0]?.n ?? 0), ...asStatusMap(statusRes) },
    invoiceTotals: {
      all: Number(totalsRes[0]?.all ?? 0),
      collected: Number(collectedRes[0]?.collected ?? 0),
      paidCount: Number(totalsRes[0]?.paidCount ?? 0),
      unpaidCount: Number(totalsRes[0]?.unpaidCount ?? 0),
    },
  };
}

// --- Data dasbor (agregat di SQL, bukan 7 tabel penuh) ----------------------
export type DashboardData = {
  user: SessionUser;
  settings: CompanySettings;
  fleetTotal: number;
  fleetByStatus: Record<string, number>;
  revenueByMonth: Record<string, number>;
  unpaidCount: number;
  overdueCount: number;
  pendingTimesheets: number;
  expiringCount: number;
  recentFleet: FleetRow[];
  latest: {
    timesheet?: { date: string };
    invoice?: { invoiceNumber: string; totalAmount: string; issueDate: string };
    handover?: { date: string };
    contract?: { contractNumber: string; startDate: string };
  };
};

export const getDashboardData = cache(async (): Promise<DashboardData> => {
  const [user, settings] = await Promise.all([getCurrentUser(), getSettingsRow()]);
  await seedPreview();
  const today = todayISO(settings.timezone);
  const warnUntil = addDaysISO(today, Number(settings.expiryWarningDays) || 30);
  const [fleetTotalRes, statusRes, revenueRes, unpaidRes, overdueRes, pendingRes, expiringRes, recentFleet, latestTimesheet, latestInvoice, latestHandover, latestContract] = await Promise.all([
    db.select({ n: count() }).from(s.fleet),
    db.select({ status: s.fleet.status, n: count() }).from(s.fleet).groupBy(s.fleet.status),
    db.select({ m: sql<string>`to_char(${s.invoices.issueDate}, 'YYYY-MM')`, total: sql<string>`coalesce(sum(${s.invoices.totalAmount}), 0)` })
      .from(s.invoices).groupBy(sql`1`),
    db.select({ n: count() }).from(s.invoices).where(sql`${s.invoices.status} <> 'paid'`),
    db.select({ n: count() }).from(s.invoices).where(and(sql`${s.invoices.status} <> 'paid'`, sql`${s.invoices.dueDate} < ${today}`)),
    db.select({ n: count() }).from(s.timesheets).where(eq(s.timesheets.status, 'pending')),
    db.select({ n: count() }).from(s.fleet).where(expiringCondition(warnUntil)),
    // Paritas ringkasan armada lama: urut bagian angka pada kode unit naik, 5 baris.
    db.select().from(s.fleet).orderBy(sql`nullif(split_part(${s.fleet.unitCode}, '-', 2), '')::numeric asc nulls last`).limit(5),
    db.select({ date: s.timesheets.date }).from(s.timesheets).orderBy(desc(s.timesheets.date), desc(s.timesheets.createdAt)).limit(1),
    db.select({ invoiceNumber: s.invoices.invoiceNumber, totalAmount: s.invoices.totalAmount, issueDate: s.invoices.issueDate })
      .from(s.invoices).orderBy(desc(s.invoices.issueDate), desc(s.invoices.createdAt)).limit(1),
    db.select({ date: s.handovers.date }).from(s.handovers).orderBy(desc(s.handovers.date), desc(s.handovers.createdAt)).limit(1),
    db.select({ contractNumber: s.contracts.contractNumber, startDate: s.contracts.startDate }).from(s.contracts).orderBy(desc(s.contracts.createdAt)).limit(1),
  ]);
  return {
    user,
    settings,
    fleetTotal: Number(fleetTotalRes[0]?.n ?? 0),
    fleetByStatus: Object.fromEntries(statusRes.map(r => [r.status, Number(r.n)])),
    revenueByMonth: Object.fromEntries(revenueRes.map(r => [r.m, Number(r.total)])),
    unpaidCount: Number(unpaidRes[0]?.n ?? 0),
    overdueCount: Number(overdueRes[0]?.n ?? 0),
    pendingTimesheets: Number(pendingRes[0]?.n ?? 0),
    expiringCount: Number(expiringRes[0]?.n ?? 0),
    recentFleet,
    latest: {
      timesheet: latestTimesheet[0],
      invoice: latestInvoice[0],
      handover: latestHandover[0],
      contract: latestContract[0],
    },
  };
});

// --- Halaman admin (Pengguna & Peran, Log Audit) — data ramping -------------
export type UsersData = { user: SessionUser; settings: CompanySettings; profiles: ProfileRow[] };
export type AuditData = { user: SessionUser; settings: CompanySettings; auditLogs: AuditRow[] };

export const getUsersData = cache(async (): Promise<UsersData> => {
  const user = await requireUser(['admin']);
  await seedPreview();
  const [profiles, settings] = await Promise.all([
    db.select().from(s.profiles).orderBy(asc(s.profiles.fullName)),
    getSettingsRow(),
  ]);
  return { user, settings, profiles };
});

export const getAuditData = cache(async (): Promise<AuditData> => {
  const user = await requireUser(['admin']);
  await seedPreview();
  const [auditLogs, settings] = await Promise.all([
    db.select().from(s.auditLog).orderBy(desc(s.auditLog.createdAt)).limit(200),
    getSettingsRow(),
  ]);
  return { user, settings, auditLogs };
});

// --- Laporan CSV (ekspor penuh memang butuh seluruh baris) -------------------
export const getReportData = cache(async () => {
  await requireUser();
  await seedPreview();
  const [settings, fleet, invoices, payments] = await Promise.all([
    getSettingsRow(),
    db.select().from(s.fleet).orderBy(asc(s.fleet.unitCode)),
    db.select().from(s.invoices).orderBy(desc(s.invoices.issueDate)),
    db.select({ invoiceId: s.payments.invoiceId, amount: s.payments.amount }).from(s.payments),
  ]);
  return { settings, fleet, invoices, payments };
});

// --- Bundle dokumen PDF (query titik, bukan seluruh workspace) ---------------
export type DocumentBundle =
  | { ok: true; settings: CompanySettings; contract: typeof s.contracts.$inferSelect; client: typeof s.clients.$inferSelect; unit: typeof s.fleet.$inferSelect; invoice?: typeof s.invoices.$inferSelect; handover?: typeof s.handovers.$inferSelect; hours?: number; payments?: PaymentRow[]; bastNumber?: string }
  | { ok: false; reason: 'not_found' | 'incomplete' };

export async function getDocumentBundle(kind: 'invoice' | 'bast' | 'sph' | 'perjanjian', id: string): Promise<DocumentBundle> {
  const settings = await getSettingsRow();
  const loadContract = async (contractId: string): Promise<{ contract: typeof s.contracts.$inferSelect; client: typeof s.clients.$inferSelect; unit: typeof s.fleet.$inferSelect } | 'not_found' | 'incomplete'> => {
    const [contract] = await db.select().from(s.contracts).where(eq(s.contracts.id, contractId));
    if (!contract) return 'not_found';
    const [client] = await db.select().from(s.clients).where(eq(s.clients.id, contract.clientId));
    const [unit] = await db.select().from(s.fleet).where(eq(s.fleet.id, contract.unitId));
    if (!client || !unit) return 'incomplete';
    return { contract, client, unit };
  };
  if (kind === 'sph' || kind === 'perjanjian') {
    const found = await loadContract(id);
    if (found === 'not_found' || found === 'incomplete') return { ok: false, reason: found };
    // Perjanjian merujuk BAST mobilisasi (bukti kondisi unit saat diserahkan).
    let bastNumber: string | undefined;
    if (kind === 'perjanjian') {
      const [h] = await db.select({ documentNumber: s.handovers.documentNumber }).from(s.handovers)
        .where(and(eq(s.handovers.contractId, id), eq(s.handovers.type, 'mobilization')))
        .orderBy(desc(s.handovers.date), desc(s.handovers.createdAt)).limit(1);
      bastNumber = h?.documentNumber;
    }
    return { ok: true, settings, ...found, bastNumber };
  }
  if (kind === 'bast') {
    const [handover] = await db.select().from(s.handovers).where(eq(s.handovers.id, id));
    if (!handover) return { ok: false, reason: 'not_found' };
    const found = await loadContract(handover.contractId);
    if (found === 'not_found' || found === 'incomplete') return { ok: false, reason: found };
    return { ok: true, settings, ...found, handover };
  }
  const [invoice] = await db.select().from(s.invoices).where(eq(s.invoices.id, id));
  if (!invoice) return { ok: false, reason: 'not_found' };
  const found = await loadContract(invoice.contractId);
  if (found === 'not_found' || found === 'incomplete') return { ok: false, reason: found };
  const [hourRows, payments] = await Promise.all([
    db.select({ h: s.timesheets.effectiveHours }).from(s.timesheets).where(eq(s.timesheets.invoiceId, invoice.id)),
    db.select().from(s.payments).where(eq(s.payments.invoiceId, invoice.id)).orderBy(desc(s.payments.paidAt), desc(s.payments.createdAt)),
  ]);
  return { ok: true, settings, ...found, invoice, hours: hourRows.reduce((a, r) => a + Number(r.h ?? 0), 0), payments };
}

// Peta akun banned untuk halaman Pengguna (A-4). Service-role, server-only;
// kosong bila kunci tak dikonfigurasi (mode pratinjau) atau API gagal.
export async function getBannedMap(): Promise<Record<string, boolean>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return {};
  try {
    const { data, error } = await createServiceClient(url, serviceKey).auth.admin.listUsers({ page: 1, perPage: 100 });
    if (error || !data) return {};
    const now = Date.now();
    return Object.fromEntries(data.users.map(u => [u.id, !!u.banned_until && new Date(u.banned_until).getTime() > now]));
  } catch { return {}; }
}
