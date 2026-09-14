// Uji regresi finansial TASK-1 §19 — wajib lolos sebelum merge.
// Jalankan: node scripts/finance-check.ts   (Node 22.18+, tanpa flag/build)
// Mengimpor util ASLI (bukan duplikat rumus) sehingga yang diuji adalah
// kode produksi yang dipakai Server Actions dan pratinjau UI.
import { calcInvoiceTotals, calcOperatorCost, calcInvoiceTotalsWithOperator, remainingBalance, resolveInvoiceStatus, normalizePaymentAmount } from '../src/lib/finance.ts';

let failures = 0;
const check = (name: string, cond: boolean, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
  if (!cond) failures++;
};

// §19: Subtotal Rp100.000.000, PPN 11% → pajak Rp11.000.000, total Rp111.000.000
const inv = calcInvoiceTotals(250, 400000, 11);
check('subtotal = 100.000.000', inv.subtotal === 100000000, String(inv.subtotal));
check('pajak 11% = 11.000.000', inv.tax === 11000000, String(inv.tax));
check('total = 111.000.000', inv.total === 111000000, String(inv.total));

// Snapshot §7: invoice lama terkunci di tarif penerbitan; invoice baru ikut setting.
const stored = { ...inv, taxRate: 11 }; // yang disimpan ke kolom invoices.*
const invNew = calcInvoiceTotals(250, 400000, 12); // setting diubah ke 12%
check('invoice lama tetap 11%', stored.taxRate === 11 && stored.tax === 11000000 && stored.total === 111000000);
check('invoice baru 12% → 12.000.000 / 112.000.000', invNew.tax === 12000000 && invNew.total === 112000000);

// Ledger §12: total − sum(bayar) = sisa; status ditentukan server.
check('sisa = total − bayar', remainingBalance('111000000', 40000000) === 71000000);
check('sisa tak pernah negatif', remainingBalance('111000000', 999999999) === 0);
check('status unpaid', resolveInvoiceStatus(111000000, 0, '2026-10-01', '2026-09-11') === 'unpaid');
check('status partial', resolveInvoiceStatus(111000000, 40000000, '2026-10-01', '2026-09-11') === 'partial');
check('status paid', resolveInvoiceStatus(111000000, 111000000, '2026-08-01', '2026-09-11') === 'paid');
check('lunas tak pernah overdue', resolveInvoiceStatus(111000000, 111000000, '2020-01-01', '2026-09-11') === 'paid');
check('lewat tempo → overdue', resolveInvoiceStatus(111000000, 40000000, '2026-09-10', '2026-09-11') === 'overdue');
check('batas toleransi 0,005 → paid', resolveInvoiceStatus(111000000, 110999999.996, '2026-10-01', '2026-09-11') === 'paid');

// TASK-1B Finding 1: ledger tak boleh menyimpan overpayment.
let t = normalizePaymentAmount(100000, 100000);
check('bayar pas → paid, sisa 0', !t.rejected && t.recorded === 100000 && !t.normalized && resolveInvoiceStatus(100000, 100000, '2026-10-01', '2026-09-11') === 'paid');
t = normalizePaymentAmount(50000, 100000);
check('bayar setengah → partial, sisa 50.000', !t.rejected && t.recorded === 50000 && remainingBalance(100000, 50000) === 50000);
t = normalizePaymentAmount(100000.004, 100000);
check('100.000,004 → dinormalisasi 100.000 (tak simpan 100.000,004)', !t.rejected && t.normalized && t.recorded === 100000);
t = normalizePaymentAmount(100000.005, 100000);
check('batas toleransi 100.000,005 → dinormalisasi, bukan ditolak', !t.rejected && t.recorded === 100000);
t = normalizePaymentAmount(100000.006, 100000);
check('100.000,006 → ditolak', t.rejected);
t = normalizePaymentAmount(100000.006, 100000);
check('100.000,006 → ditolak', t.rejected);
t = normalizePaymentAmount(50000, 0);
check('sisa 0 → pembayaran apa pun ditolak', t.rejected);
// Akumulasi multi-baris via sisa berjalan (seperti transaksi recordPayment).
let acc = 0; let ledgerOk = true;
for (const p of [40000, 30000, 30000]) {
  const n = normalizePaymentAmount(p, remainingBalance(100000, acc));
  if (n.rejected) { ledgerOk = false; break; }
  acc += n.recorded;
}
check('40+30+30 → lunas, ledger = 100.000', ledgerOk && acc === 100000 && resolveInvoiceStatus(100000, acc, '2026-10-01', '2026-09-11') === 'paid');
acc = 70000;
const last = normalizePaymentAmount(30000.006, remainingBalance(100000, acc));
check('40+30+30.000,006 → baris ketiga ditolak, ledger ≤ total', last.rejected && acc <= 100000);

// Operator wet-hire (PR-4): dua mode tarif + dry hire = 0.
const logs = [{ effectiveHours: 8, date: '2026-09-10' }, { effectiveHours: 7.5, date: '2026-09-11' }, { effectiveHours: 0, date: '2026-09-11' }];
check('operator hourly = 15.5 x 150.000', calcOperatorCost({ includeOperator: true, rateType: 'hourly', rate: 150000 }, logs) === 2325000, String(calcOperatorCost({ includeOperator: true, rateType: 'hourly', rate: 150000 }, logs)));
check('operator daily = 2 hari x 500.000 (duplikat tanggal tidak dihitung 2x)', calcOperatorCost({ includeOperator: true, rateType: 'daily', rate: 500000 }, logs) === 1000000);
check('dry hire = 0', calcOperatorCost({ includeOperator: false, rateType: 'hourly', rate: 150000 }, logs) === 0);
check('tanpa tarif = 0', calcOperatorCost({ includeOperator: true, rateType: 'hourly', rate: 0 }, logs) === 0);
// Invoice wet-hire: subtotal 100 jt + operator 2.325.000, PPN 11% atas keduanya.
const invOp = calcInvoiceTotalsWithOperator(250, 400000, 11, 2325000);
check('wet-hire subtotal sewa tetap 100.000.000', invOp.subtotal === 100000000, String(invOp.subtotal));
check('wet-hire operator_amount = 2.325.000', invOp.operatorAmount === 2325000, String(invOp.operatorAmount));
check('wet-hire pajak 11% = 11.255.750', invOp.tax === 11255750, String(invOp.tax));
check('wet-hire total = 113.580.750', invOp.total === 113580750, String(invOp.total));

if (failures) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('\nSemua uji finansial lolos.');
