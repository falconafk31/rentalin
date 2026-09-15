// Utilitas kalkulasi finansial terpusat (TASK-1 §8).
// SATU-SATUNYA tempat rumus invoice/pembayaran didefinisikan — dipakai oleh
// Server Actions dan pratinjau UI, serta diuji oleh scripts/finance-check.ts.
// Pure functions: tanpa akses DB/env, aman dipakai server maupun client.

export type InvoiceTotals = { hours: number; subtotal: number; tax: number; total: number };

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Subtotal = jam × tarif; pajak = subtotal × tarif%; total = subtotal + pajak. */
export function calcInvoiceTotals(hours: number, ratePerHour: number, ppnRate: number): InvoiceTotals {
  const subtotal = round2(hours * ratePerHour);
  const tax = round2((subtotal * ppnRate) / 100);
  return { hours, subtotal, tax, total: round2(subtotal + tax) };
}
/**
 * Biaya jasa operator wet-hire (PR-4, docs/plan-operator-dan-riwayat-armada.md
 * 3.5). Dua mode tarif kontrak:
 *  - hourly: total jam efektif x tarif per jam;
 *  - daily : jumlah hari kerja (distinct tanggal log disetujui) x tarif/hari.
 * Dry hire (includeOperator=false / tanpa tarif) => 0.
 */
export function calcOperatorCost(
  opts: { includeOperator: boolean; rateType: 'hourly' | 'daily' | null; rate: number | string | null },
  logs: { effectiveHours: number | string; date: string }[],
): number {
  if (!opts.includeOperator) return 0;
  const rate = Number(opts.rate);
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  if (opts.rateType === 'daily') {
    return round2(new Set(logs.map(l => l.date)).size * rate);
  }
  return round2(logs.reduce((a, l) => a + Number(l.effectiveHours), 0) * rate);
}

/** Total invoice wet-hire: subtotal sewa + jasa operator (kena PPN) + pajak. */
export function calcInvoiceTotalsWithOperator(
  hours: number, ratePerHour: number, ppnRate: number, operatorAmount: number,
): InvoiceTotals & { operatorAmount: number } {
  const base = calcInvoiceTotals(hours, ratePerHour, ppnRate);
  const op = round2(Math.max(0, operatorAmount));
  const subtotal = round2(base.subtotal + op);
  const tax = round2((subtotal * ppnRate) / 100);
  return { hours, subtotal, operatorAmount: op, tax, total: round2(subtotal + tax) };
}

/** Toleransi pembulatan pembayaran: setengah sen (0,005). */
export const PAYMENT_TOLERANCE = 0.005;

export type NormalizedPayment = { recorded: number; rejected: boolean; normalized: boolean };

/**
 * Integritas ledger (TASK-1B Finding 1). Tolak pembayaran yang melebihi
 * sisa di luar toleransi; yang di dalam toleransi dinormalisasi menjadi
 * TEPAT sebesar sisa. Invarian by construction (Math.min): recorded ≤ sisa.
 */
export function normalizePaymentAmount(amount: number, remaining: number): NormalizedPayment {
  const r = round2(remaining);
  // EPS menyerap debu float tepat di batas (mis. 100000.005 tersimpan sebagai
  // 100000.0050000000045): toleransi efektif 0,005000001 — tak berarti uang.
  const EPS = 1e-9;
  if (!Number.isFinite(amount) || amount <= 0 || amount - r > PAYMENT_TOLERANCE + EPS) {
    return { recorded: 0, rejected: true, normalized: false };
  }
  const recorded = Math.min(round2(amount), r);
  return { recorded, rejected: false, normalized: amount > r };
}

/** Sisa tagihan = total − terbayar (tak pernah negatif, presisi 2 desimal). */
export function remainingBalance(totalAmount: number | string, paidSoFar: number): number {
  return Math.max(0, round2(Number(totalAmount) - paidSoFar));
}

export type InvoicePaymentStatus = 'unpaid' | 'partial' | 'paid' | 'overdue';

/**
 * Status hasil pembayaran — ditentukan SERVER (TASK-1 §12). Perbandingan
 * tanggal memakai string ISO YYYY-MM-DD (leksikografis = kronologis,
 * TZ-aman — tak ada konversi ke Date/UTC).
 */
export function resolveInvoiceStatus(
  totalAmount: number | string,
  paidTotal: number,
  dueDateISO: string,
  todayISOv: string,
): InvoicePaymentStatus {
  const total = Number(totalAmount);
  if (paidTotal >= total - 0.005) return 'paid';
  if (dueDateISO < todayISOv) return 'overdue';
  if (paidTotal > 0.005) return 'partial';
  return 'unpaid';
}

/**
 * Calculate equipment amount from timesheet billing rate snapshots.
 * M1.3: Invoice billing uses frozen snapshots, never current contract rates.
 */
export function calcEquipmentAmountFromSnapshots(
  logs: { effectiveHours: number | string | null; billingRateSnapshot: number | string | null }[]
): number {
  let total = 0;
  for (const log of logs) {
    const hours = Number(log.effectiveHours ?? 0);
    const rate = Number(log.billingRateSnapshot ?? 0);
    if (!Number.isFinite(hours) || !Number.isFinite(rate) || rate === 0) {
      throw new Error('Invalid timesheet snapshot: missing or malformed billing_rate_snapshot');
    }
    total += hours * rate;
  }
  return round2(total);
}

/**
 * Calculate operator cost from timesheet snapshots.
 * Handles mixed rate types (hourly + daily) within single invoice.
 * M1.3: Uses frozen snapshots from approval, never current contract/master rates.
 */
export function calcOperatorCostFromSnapshots(
  logs: { 
    effectiveHours: number | string | null; 
    date: string;
    operatorRateSnapshot: number | string | null;
    operatorRateTypeSnapshot: string | null;
  }[]
): number {
  // Separate hourly and daily logs
  const hourlyLogs = logs.filter(l => l.operatorRateTypeSnapshot === 'hourly' && l.operatorRateSnapshot);
  const dailyLogs = logs.filter(l => l.operatorRateTypeSnapshot === 'daily' && l.operatorRateSnapshot);

  let hourlyTotal = 0;
  let dailyTotal = 0;

  // Hourly: sum (hours × rate) for each log
  for (const log of hourlyLogs) {
    const hours = Number(log.effectiveHours ?? 0);
    const rate = Number(log.operatorRateSnapshot ?? 0);
    if (!Number.isFinite(hours) || !Number.isFinite(rate)) {
      throw new Error('Invalid hourly operator snapshot');
    }
    hourlyTotal += hours * rate;
  }

  // Daily: group by rate, count unique dates per rate
  // Handles scenario: contract revised mid-period, different daily rates
  const dailyRateGroups = new Map<number, Set<string>>();
  for (const log of dailyLogs) {
    const rate = Number(log.operatorRateSnapshot ?? 0);
    if (!Number.isFinite(rate)) {
      throw new Error('Invalid daily operator snapshot');
    }
    if (!dailyRateGroups.has(rate)) {
      dailyRateGroups.set(rate, new Set());
    }
    dailyRateGroups.get(rate)!.add(log.date);
  }

  for (const [rate, dates] of dailyRateGroups) {
    dailyTotal += dates.size * rate;
  }

  return round2(hourlyTotal + dailyTotal);
}
