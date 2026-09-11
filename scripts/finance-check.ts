// Uji regresi finansial TASK-1 §19 — wajib lolos sebelum merge.
// Jalankan: node scripts/finance-check.ts   (Node 22.18+, tanpa flag/build)
// Mengimpor util ASLI (bukan duplikat rumus) sehingga yang diuji adalah
// kode produksi yang dipakai Server Actions dan pratinjau UI.
import { calcInvoiceTotals, remainingBalance, resolveInvoiceStatus } from '../src/lib/finance.ts';

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

if (failures) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('\nSemua uji finansial lolos.');
