// Utilitas kalkulasi finansial terpusat (TASK-1 §8).
// SATU-SATUNYA tempat rumus invoice/pembayaran didefinisikan — dipakai oleh
// Server Actions dan pratinjau UI, serta diuji oleh scripts/finance-check.ts.
// Pure functions: tanpa akses DB/env, aman dipakai server maupun client.

export type InvoiceTotals = { hours: number; subtotal: number; tax: number; total: number };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Subtotal = jam × tarif; pajak = subtotal × tarif%; total = subtotal + pajak. */
export function calcInvoiceTotals(hours: number, ratePerHour: number, ppnRate: number): InvoiceTotals {
  const subtotal = round2(hours * ratePerHour);
  const tax = round2((subtotal * ppnRate) / 100);
  return { hours, subtotal, tax, total: round2(subtotal + tax) };
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
