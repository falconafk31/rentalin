import { db } from '@/db';
import * as s from '@/db/schema';
import { eq, desc, inArray, sql, count, and } from 'drizzle-orm';
import { requireUser } from '@/lib/auth';
import { calcTotalHmUsed, calcFleetUtilization, calcPaginationParams } from '@/lib/fleet-history-helpers';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type DetailedFleetHistory = {
  unit: {
    id: string;
    unitCode: string;
    brandModel: string;
    category: string;
    year: number | null;
    status: string;
    hourlyRate: string;
    currentLocation: string | null;
    sikoExpiry: string | null;
    insuranceExpiry: string | null;
  };
  summary: {
    contractCount: number;
    completedCount: number;
    logCount: number;
    workDays: number;
    contractDays: number;
    effectiveHours: number;
    breakdownHours: number;
    hmUsed: number | null; // Total HM Terpakai: sum(endHm - startHm) dari timesheet valid
    utilizationRate: number; // percentage 0 - 100 berdasarkan approved workDays / contractDays
    totalInvoiced: number | null; // role-gated: Total Nilai Tagihan (Invoices)
    operatorBilled: number | null; // role-gated: Total Nilai Jasa Operator Ditagihkan pada Invoice
  };
  operators: {
    operatorId: string | null;
    name: string;
    sioClass: string | null;
    rateType: string | null;
    rate: string | null;
    logs: number;
    effectiveHours: number;
    firstDate: string | null;
    lastDate: string | null;
  }[];
  contracts: {
    id: string;
    contractNumber: string;
    clientName: string | null;
    startDate: string;
    endDate: string;
    status: string;
    includeOperator: boolean;
    operatorRate: string | null;
    operatorRateType: string | null;
    ratePerHour: string;
    assignedOperators: string[];
    totalInvoiced: number | null; // role-gated: Total Nilai Tagihan per kontrak
  }[];
  timesheets: {
    id: string;
    date: string;
    contractNumber: string | null;
    driver: string | null;
    startHm: string;
    endHm: string;
    breakdownHours: string;
    effectiveHours: string;
    status: string;
    invoiceNumber: string | null;
  }[];
  timesheetPagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  handovers: {
    id: string;
    documentNumber: string;
    type: string;
    date: string;
    contractNumber: string | null;
    photoCount: number;
    notes: string | null;
    checklistOkCount: number;
    checklistTotalCount: number;
  }[];
  financials?: {
    totalInvoiced: number; // Total Nilai Tagihan (Total tagihan termasuk PPN)
    totalOperatorBilled: number; // Total Nilai Jasa Operator Ditagihkan
    invoices: {
      id: string;
      invoiceNumber: string;
      contractNumber: string | null;
      issueDate: string;
      dueDate: string;
      status: string;
      subtotalAmount: string;
      operatorAmount: string; // Jasa operator pada invoice
      taxAmount: string;
      totalAmount: string;
    }[];
  };
};

export async function getDetailedFleetHistory(
  unitId: string,
  options?: { page?: number; pageSize?: number; allTimesheets?: boolean }
): Promise<DetailedFleetHistory | { error: 'unauthorized' | 'not_found' }> {
  let user: { id: string; role: string; fullName: string };
  try {
    user = await requireUser();
  } catch {
    return { error: 'unauthorized' };
  }

  if (!UUID_RE.test(unitId)) return { error: 'not_found' };

  const [unit] = await db.select().from(s.fleet).where(eq(s.fleet.id, unitId));
  if (!unit) return { error: 'not_found' };

  const isFinance = ['admin', 'finance', 'operations'].includes(user.role);
  const allTimesheets = !!options?.allTimesheets;

  // 1. Ambil seluruh kontrak untuk unit ini
  const contractRows = await db
    .select({
      id: s.contracts.id,
      contractNumber: s.contracts.contractNumber,
      clientName: s.clients.companyName,
      startDate: s.contracts.startDate,
      endDate: s.contracts.endDate,
      status: s.contracts.status,
      includeOperator: s.contracts.includeOperator,
      operatorRate: s.contracts.operatorRate,
      operatorRateType: s.contracts.operatorRateType,
      ratePerHour: s.contracts.ratePerHour,
    })
    .from(s.contracts)
    .leftJoin(s.clients, eq(s.clients.id, s.contracts.clientId))
    .where(eq(s.contracts.unitId, unitId))
    .orderBy(desc(s.contracts.startDate), desc(s.contracts.id));

  const contractIds = contractRows.map((c) => c.id);

  // 2. Ambil assigned operators per kontrak jika ada kontrak
  let contractOps: { contractId: string; operatorId: string; fullName: string }[] = [];
  if (contractIds.length > 0) {
    contractOps = await db
      .select({
        contractId: s.contractOperators.contractId,
        operatorId: s.contractOperators.operatorId,
        fullName: s.operators.fullName,
      })
      .from(s.contractOperators)
      .innerJoin(s.operators, eq(s.operators.id, s.contractOperators.operatorId))
      .where(inArray(s.contractOperators.contractId, contractIds));
  }

  const assignedOpsMap = new Map<string, string[]>();
  for (const co of contractOps) {
    const list = assignedOpsMap.get(co.contractId) || [];
    list.push(co.fullName);
    assignedOpsMap.set(co.contractId, list);
  }

  // 3. Timesheets Summary:
  // - HM Terpakai: sum(end_hm - start_hm) dari interval log valid
  // - Effective hours: hanya dari timesheet berstatus 'approved'
  const allLogsSummaryQuery = await db
    .select({
      totalLogs: count(),
      effectiveHours: sql<string>`coalesce(sum(case when ${s.timesheets.status} = 'approved' then ${s.timesheets.effectiveHours} else 0 end), 0)`,
      breakdownHours: sql<string>`coalesce(sum(case when ${s.timesheets.status} = 'approved' then ${s.timesheets.breakdownHours} else 0 end), 0)`,
      totalHmUsed: sql<string>`coalesce(sum(case when ${s.timesheets.endHm} >= ${s.timesheets.startHm} then (${s.timesheets.endHm} - ${s.timesheets.startHm}) else 0 end), 0)`,
    })
    .from(s.timesheets)
    .where(eq(s.timesheets.unitId, unitId));

  const logSummary = allLogsSummaryQuery[0];
  const totalLogs = Number(logSummary?.totalLogs || 0);
  const hmUsed = logSummary ? Math.round(Number(logSummary.totalHmUsed) * 100) / 100 : 0;

  // 4. Utilisasi: workDays HANYA menghitung tanggal dengan timesheet berstatus 'approved'
  const approvedWorkDaysRes = await db
    .select({ workDate: s.timesheets.date })
    .from(s.timesheets)
    .where(and(eq(s.timesheets.unitId, unitId), eq(s.timesheets.status, 'approved')))
    .groupBy(s.timesheets.date);
  const workDays = approvedWorkDaysRes.length;

  // Hitung total contract days (rentang hari sewa semua kontrak yang aktif atau selesai)
  let totalContractDays = 0;
  for (const c of contractRows) {
    if (c.startDate && c.endDate) {
      const d1 = Date.parse(c.startDate + 'T00:00:00Z');
      const d2 = Date.parse(c.endDate + 'T00:00:00Z');
      if (!Number.isNaN(d1) && !Number.isNaN(d2) && d2 >= d1) {
        totalContractDays += Math.round((d2 - d1) / 86400000) + 1;
      }
    }
  }

  // Utilisasi resmi dihitung via helper bisnis teruji
  const utilizationRate = calcFleetUtilization(workDays, totalContractDays);

  // 5. Operator history aggregation
  // Menjawab: "Siapa saja yang pernah mengoperasikan unit ini?"
  // Berdasarkan operator_driver_id (actual physical driver)
  const operatorAggRows = await db
    .select({
      driverId: s.timesheets.operatorDriverId,
      driverName: s.operators.fullName,
      sioClass: s.operators.sioClass,
      logCount: count(),
      hours: sql<string>`coalesce(sum(${s.timesheets.effectiveHours}), 0)`,
      firstDate: sql<string>`min(${s.timesheets.date})`,
      lastDate: sql<string>`max(${s.timesheets.date})`,
    })
    .from(s.timesheets)
    .leftJoin(s.operators, eq(s.operators.id, s.timesheets.operatorDriverId))
    .where(eq(s.timesheets.unitId, unitId))
    .groupBy(s.timesheets.operatorDriverId, s.operators.fullName, s.operators.sioClass)
    .orderBy(desc(sql`sum(${s.timesheets.effectiveHours})`));

  // Fallback untuk catatan lama jika ada yang operator_driver_id-nya null tapi dicatat profiles.id
  const unmappedLogs = await db
    .select({
      profileName: s.profiles.fullName,
      logCount: count(),
      hours: sql<string>`coalesce(sum(${s.timesheets.effectiveHours}), 0)`,
      firstDate: sql<string>`min(${s.timesheets.date})`,
      lastDate: sql<string>`max(${s.timesheets.date})`,
    })
    .from(s.timesheets)
    .leftJoin(s.profiles, eq(s.profiles.id, s.timesheets.operatorId))
    .where(and(eq(s.timesheets.unitId, unitId), sql`${s.timesheets.operatorDriverId} is null`))
    .groupBy(s.profiles.fullName);

  const operatorsResult: DetailedFleetHistory['operators'] = [];

  for (const row of operatorAggRows) {
    if (row.driverId && row.driverName) {
      operatorsResult.push({
        operatorId: row.driverId,
        name: row.driverName,
        sioClass: row.sioClass || '-',
        rateType: null,
        rate: null,
        logs: Number(row.logCount),
        effectiveHours: Math.round(Number(row.hours) * 100) / 100,
        firstDate: row.firstDate,
        lastDate: row.lastDate,
      });
    }
  }

  for (const un of unmappedLogs) {
    if (un.profileName) {
      operatorsResult.push({
        operatorId: null,
        name: `${un.profileName} (Pencatat)`,
        sioClass: '-',
        rateType: null,
        rate: null,
        logs: Number(un.logCount),
        effectiveHours: Math.round(Number(un.hours) * 100) / 100,
        firstDate: un.firstDate,
        lastDate: un.lastDate,
      });
    }
  }

  // 6. Invoices & Billing (Least-privilege: Query DB HANYA jika pengguna memiliki role finance)
  let revenueRows: {
    id: string;
    invoiceNumber: string;
    contractId: string;
    contractNumber: string | null;
    issueDate: string;
    dueDate: string;
    status: string;
    subtotalAmount: string;
    operatorAmount: string;
    taxAmount: string;
    totalAmount: string;
  }[] = [];
  let totalInvoiced = 0;
  let totalOperatorBilled = 0;

  if (isFinance && contractIds.length > 0) {
    const invData = await db
      .select({
        id: s.invoices.id,
        invoiceNumber: s.invoices.invoiceNumber,
        contractId: s.invoices.contractId,
        contractNumber: s.contracts.contractNumber,
        issueDate: s.invoices.issueDate,
        dueDate: s.invoices.dueDate,
        status: s.invoices.status,
        subtotalAmount: s.invoices.subtotalAmount,
        operatorAmount: s.invoices.operatorAmount,
        taxAmount: s.invoices.taxAmount,
        totalAmount: s.invoices.totalAmount,
      })
      .from(s.invoices)
      .innerJoin(s.contracts, eq(s.contracts.id, s.invoices.contractId))
      .where(inArray(s.invoices.contractId, contractIds))
      .orderBy(desc(s.invoices.issueDate), desc(s.invoices.id));

    revenueRows = invData;
    totalInvoiced = invData.reduce((acc, curr) => acc + Number(curr.totalAmount || 0), 0);
    totalOperatorBilled = invData.reduce((acc, curr) => acc + Number(curr.operatorAmount || 0), 0);
  }

  // 7. Timesheets selection:
  // Hitung parameter paginasi menggunakan pure helper teruji
  const pagination = calcPaginationParams({
    totalRecords: totalLogs,
    page: options?.page || 1,
    pageSize: options?.pageSize || 10,
  });

  // PENTING (Finding 1 & 2):
  // - Least-privilege: Tabel `invoices` HANYA di-join bila pengguna berwenang finansial (`isFinance === true`).
  //   Bila non-finance, invoiceNumber otomatis null dan database TIDAK menyentuh tabel invoices.
  // - Deterministic Ordering: Menggunakan `desc(s.timesheets.date), desc(s.timesheets.id)`
  //   sebagai tie-breaker unik sehingga halaman tidak mengalami duplikasi atau catatan terlewat.
  let pagedTimesheets: {
    id: string;
    date: string;
    contractNumber: string | null;
    driverName: string | null;
    driverProfile: string | null;
    startHm: string;
    endHm: string;
    breakdownHours: string;
    effectiveHours: string | null;
    status: string;
    invoiceNumber: string | null;
  }[] = [];

  if (isFinance) {
    const baseQuery = db
      .select({
        id: s.timesheets.id,
        date: s.timesheets.date,
        contractNumber: s.contracts.contractNumber,
        driverName: s.operators.fullName,
        driverProfile: s.profiles.fullName,
        startHm: s.timesheets.startHm,
        endHm: s.timesheets.endHm,
        breakdownHours: s.timesheets.breakdownHours,
        effectiveHours: s.timesheets.effectiveHours,
        status: s.timesheets.status,
        invoiceNumber: s.invoices.invoiceNumber,
      })
      .from(s.timesheets)
      .leftJoin(s.contracts, eq(s.contracts.id, s.timesheets.contractId))
      .leftJoin(s.operators, eq(s.operators.id, s.timesheets.operatorDriverId))
      .leftJoin(s.profiles, eq(s.profiles.id, s.timesheets.operatorId))
      .leftJoin(s.invoices, eq(s.invoices.id, s.timesheets.invoiceId))
      .where(eq(s.timesheets.unitId, unitId))
      .orderBy(desc(s.timesheets.date), desc(s.timesheets.id));

    pagedTimesheets = allTimesheets
      ? await baseQuery
      : await baseQuery.limit(pagination.limit).offset(pagination.offset);
  } else {
    const baseQuery = db
      .select({
        id: s.timesheets.id,
        date: s.timesheets.date,
        contractNumber: s.contracts.contractNumber,
        driverName: s.operators.fullName,
        driverProfile: s.profiles.fullName,
        startHm: s.timesheets.startHm,
        endHm: s.timesheets.endHm,
        breakdownHours: s.timesheets.breakdownHours,
        effectiveHours: s.timesheets.effectiveHours,
        status: s.timesheets.status,
        invoiceNumber: sql<string | null>`null`,
      })
      .from(s.timesheets)
      .leftJoin(s.contracts, eq(s.contracts.id, s.timesheets.contractId))
      .leftJoin(s.operators, eq(s.operators.id, s.timesheets.operatorDriverId))
      .leftJoin(s.profiles, eq(s.profiles.id, s.timesheets.operatorId))
      .where(eq(s.timesheets.unitId, unitId))
      .orderBy(desc(s.timesheets.date), desc(s.timesheets.id));

    pagedTimesheets = allTimesheets
      ? await baseQuery
      : await baseQuery.limit(pagination.limit).offset(pagination.offset);
  }

  // 8. BAST Handovers
  let handoverRows: {
    id: string;
    documentNumber: string;
    type: string;
    date: string;
    contractNumber: string | null;
    photoUrls: string[];
    notes: string | null;
    engine: boolean;
    hydraulics: boolean;
    tracks: boolean;
    oil: boolean;
    fuel: boolean;
    battery: boolean;
    lights: boolean;
    brakes: boolean;
    bucket: boolean;
    cabin: boolean;
    safety: boolean;
    documents: boolean;
  }[] = [];

  if (contractIds.length > 0) {
    handoverRows = await db
      .select({
        id: s.handovers.id,
        documentNumber: s.handovers.documentNumber,
        type: s.handovers.type,
        date: s.handovers.date,
        contractNumber: s.contracts.contractNumber,
        photoUrls: s.handovers.photoUrls,
        notes: s.handovers.notes,
        engine: s.handovers.engine,
        hydraulics: s.handovers.hydraulics,
        tracks: s.handovers.tracks,
        oil: s.handovers.oil,
        fuel: s.handovers.fuel,
        battery: s.handovers.battery,
        lights: s.handovers.lights,
        brakes: s.handovers.brakes,
        bucket: s.handovers.bucket,
        cabin: s.handovers.cabin,
        safety: s.handovers.safety,
        documents: s.handovers.documents,
      })
      .from(s.handovers)
      .innerJoin(s.contracts, eq(s.contracts.id, s.handovers.contractId))
      .where(inArray(s.handovers.contractId, contractIds))
      .orderBy(desc(s.handovers.date), desc(s.handovers.id));
  }

  const handoversFormatted = handoverRows.map((h) => {
    const checks = [
      h.engine,
      h.hydraulics,
      h.tracks,
      h.oil,
      h.fuel,
      h.battery,
      h.lights,
      h.brakes,
      h.bucket,
      h.cabin,
      h.safety,
      h.documents,
    ];
    const okCount = checks.filter(Boolean).length;
    return {
      id: h.id,
      documentNumber: h.documentNumber,
      type: h.type,
      date: h.date,
      contractNumber: h.contractNumber,
      photoCount: h.photoUrls?.length || 0,
      notes: h.notes,
      checklistOkCount: okCount,
      checklistTotalCount: checks.length,
    };
  });

  // Susun contracts dengan total billing per kontrak (jika isFinance)
  const contractRevMap = new Map<string, number>();
  for (const inv of revenueRows) {
    const prev = contractRevMap.get(inv.contractId) || 0;
    contractRevMap.set(inv.contractId, prev + Number(inv.totalAmount || 0));
  }

  const contractsFormatted = contractRows.map((c) => ({
    id: c.id,
    contractNumber: c.contractNumber,
    clientName: c.clientName,
    startDate: c.startDate,
    endDate: c.endDate,
    status: c.status,
    includeOperator: c.includeOperator,
    operatorRate: c.operatorRate,
    operatorRateType: c.operatorRateType,
    ratePerHour: c.ratePerHour,
    assignedOperators: assignedOpsMap.get(c.id) || [],
    totalInvoiced: isFinance ? contractRevMap.get(c.id) || 0 : null,
  }));

  return {
    unit: {
      id: unit.id,
      unitCode: unit.unitCode,
      brandModel: unit.brandModel,
      category: unit.category,
      year: unit.year,
      status: unit.status,
      hourlyRate: unit.hourlyRate,
      currentLocation: unit.currentLocation,
      sikoExpiry: unit.sikoExpiry,
      insuranceExpiry: unit.insuranceExpiry,
    },
    summary: {
      contractCount: contractRows.length,
      completedCount: contractRows.filter((c) => c.status === 'completed').length,
      logCount: totalLogs,
      workDays,
      contractDays: totalContractDays,
      effectiveHours: Math.round(Number(logSummary?.effectiveHours || 0) * 100) / 100,
      breakdownHours: Math.round(Number(logSummary?.breakdownHours || 0) * 100) / 100,
      hmUsed,
      utilizationRate,
      totalInvoiced: isFinance ? Math.round(totalInvoiced * 100) / 100 : null,
      operatorBilled: isFinance ? Math.round(totalOperatorBilled * 100) / 100 : null,
    },
    operators: operatorsResult,
    contracts: contractsFormatted,
    timesheets: pagedTimesheets.map((t) => ({
      id: t.id,
      date: t.date,
      contractNumber: t.contractNumber,
      driver: t.driverName || t.driverProfile || '-',
      startHm: t.startHm,
      endHm: t.endHm,
      breakdownHours: t.breakdownHours,
      effectiveHours: t.effectiveHours || '0',
      status: t.status,
      invoiceNumber: isFinance ? t.invoiceNumber : null,
    })),
    timesheetPagination: {
      page: allTimesheets ? 1 : pagination.page,
      pageSize: allTimesheets ? totalLogs : pagination.pageSize,
      total: totalLogs,
      totalPages: allTimesheets ? 1 : pagination.totalPages,
    },
    handovers: handoversFormatted,
    financials: isFinance
      ? {
          totalInvoiced: Math.round(totalInvoiced * 100) / 100,
          totalOperatorBilled: Math.round(totalOperatorBilled * 100) / 100,
          invoices: revenueRows.map((r) => ({
            id: r.id,
            invoiceNumber: r.invoiceNumber,
            contractNumber: r.contractNumber,
            issueDate: r.issueDate,
            dueDate: r.dueDate,
            status: r.status,
            subtotalAmount: r.subtotalAmount,
            operatorAmount: r.operatorAmount,
            taxAmount: r.taxAmount,
            totalAmount: r.totalAmount,
          })),
        }
      : undefined,
  };
}
