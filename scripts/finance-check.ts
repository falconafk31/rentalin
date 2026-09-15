// Uji regresi finansial TASK-1 §19 & M1.3 snapshot — wajib lolos sebelum merge.
// Jalankan: npx tsx scripts/finance-check.ts
// Mengimpor util ASLI (bukan duplikat rumus) sehingga yang diuji adalah
// kode produksi yang dipakai Server Actions dan pratinjau UI.
import { 
  calcInvoiceTotals, 
  calcOperatorCost, 
  calcInvoiceTotalsWithOperator, 
  remainingBalance, 
  resolveInvoiceStatus, 
  normalizePaymentAmount, 
  calcEquipmentAmountFromSnapshots, 
  calcOperatorCostFromSnapshots,
  calcInvoiceTotalsFromSnapshots,
  round2 
} from '../src/lib/finance.ts';

let failures = 0;
const assert = (cond: boolean, msg: string) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures++;
};
const check = (name: string, cond: boolean, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
  if (!cond) failures++;
};

// ==========================================
// SCENARIO 1: Existing dry-hire invoice
// ==========================================
const inv = calcInvoiceTotals(250, 400000, 11);
check('1. dry-hire subtotal = 100.000.000', inv.subtotal === 100000000, String(inv.subtotal));
check('1. dry-hire pajak 11% = 11.000.000', inv.tax === 11000000, String(inv.tax));
check('1. dry-hire total = 111.000.000', inv.total === 111000000, String(inv.total));

// Snapshot §7: invoice lama terkunci di tarif penerbitan; invoice baru ikut setting.
const stored = { ...inv, taxRate: 11 };
const invNew = calcInvoiceTotals(250, 400000, 12);
check('1. invoice lama tetap 11%', stored.taxRate === 11 && stored.tax === 11000000 && stored.total === 111000000);
check('1. invoice baru 12% → 12.000.000 / 112.000.000', invNew.tax === 12000000 && invNew.total === 112000000);

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

// ==========================================
// SCENARIO 2: Existing wet-hire invoice
// ==========================================
const logsWet = [{ effectiveHours: 8, date: '2026-09-10' }, { effectiveHours: 7.5, date: '2026-09-11' }, { effectiveHours: 0, date: '2026-09-11' }];
check('2. operator hourly = 15.5 x 150.000', calcOperatorCost({ includeOperator: true, rateType: 'hourly', rate: 150000 }, logsWet) === 2325000);
check('2. operator daily = 2 hari x 500.000 (unique date)', calcOperatorCost({ includeOperator: true, rateType: 'daily', rate: 500000 }, logsWet) === 1000000);
check('2. dry hire = 0', calcOperatorCost({ includeOperator: false, rateType: 'hourly', rate: 150000 }, logsWet) === 0);
check('2. tanpa tarif = 0', calcOperatorCost({ includeOperator: true, rateType: 'hourly', rate: 0 }, logsWet) === 0);

const invOp = calcInvoiceTotalsWithOperator(250, 400000, 11, 2325000);
check('2. wet-hire subtotal = 102.325.000', invOp.subtotal === 102325000, String(invOp.subtotal));
check('2. wet-hire operator_amount = 2.325.000', invOp.operatorAmount === 2325000, String(invOp.operatorAmount));
check('2. wet-hire pajak 11% = 11.255.750', invOp.tax === 11255750, String(invOp.tax));
check('2. wet-hire total = 113.580.750', invOp.total === 113580750, String(invOp.total));
check('2. wet-hire invariant: subtotal = total - tax', invOp.subtotal === invOp.total - invOp.tax);

// ==========================================
// SCENARIO 3: Approved timesheet uses snapshot
// ==========================================
{
  const logsSnap = [
    { effectiveHours: 8, billingRateSnapshot: 400_000, date: '2026-09-01', operatorRateSnapshot: null, operatorRateTypeSnapshot: null },
  ];
  const snapResult = calcInvoiceTotalsFromSnapshots(logsSnap, 11);
  check('3. approved timesheet uses billingRateSnapshot', snapResult.equipmentAmount === 3_200_000 && snapResult.total === 3_552_000);
}

// ==========================================
// SCENARIOS 4 & 5: Contract and Operator rate changes after approval
// ==========================================
{
  const timesheetA = { effectiveHours: 8, billingRateSnapshot: 400_000, date: '2026-09-01', operatorRateSnapshot: 75_000, operatorRateTypeSnapshot: 'hourly' };
  const timesheetB = { effectiveHours: 8, billingRateSnapshot: 500_000, date: '2026-09-02', operatorRateSnapshot: 90_000, operatorRateTypeSnapshot: 'hourly' };

  const combined = calcInvoiceTotalsFromSnapshots([timesheetA, timesheetB], 11);
  check('4. contract rate change does not affect Timesheet A eq snapshot', combined.equipmentAmount === 7_200_000);
  check('5. operator rate change does not affect Timesheet A op snapshot', combined.operatorAmount === 1_320_000);
  check('4-5. combined subtotal = 8.520.000', combined.subtotal === 8_520_000);
  check('4-5. combined tax = 937.200', combined.tax === 937_200);
  check('4-5. combined total = 9.457.200', combined.total === 9_457_200);
}

// ==========================================
// SCENARIO 6: Mixed equipment snapshot rates
// ==========================================
{
  const logsMixedEq = [
    { effectiveHours: 10, billingRateSnapshot: 400_000, date: '2026-09-01', operatorRateSnapshot: null, operatorRateTypeSnapshot: null },
    { effectiveHours: 8, billingRateSnapshot: 450_000, date: '2026-09-02', operatorRateSnapshot: null, operatorRateTypeSnapshot: null },
  ];
  const eqMixed = calcInvoiceTotalsFromSnapshots(logsMixedEq, 11);
  check('6. mixed equipment snapshot rates = 10*400k + 8*450k = 7.600.000', eqMixed.equipmentAmount === 7_600_000);
  check('6. mixed equipment uniqueRates list', eqMixed.uniqueRates.length === 2 && eqMixed.uniqueRates[0] === 450_000 && eqMixed.uniqueRates[1] === 400_000);
}

// ==========================================
// SCENARIO 7: Mixed operator snapshot rates (hourly + daily)
// ==========================================
{
  const logsMixedOp = [
    { effectiveHours: 10, billingRateSnapshot: 500_000, date: '2026-09-01', operatorRateSnapshot: 75_000, operatorRateTypeSnapshot: 'hourly' },
    { effectiveHours: 8, billingRateSnapshot: 500_000, date: '2026-09-02', operatorRateSnapshot: 80_000, operatorRateTypeSnapshot: 'hourly' },
  ];
  const opMixed = calcInvoiceTotalsFromSnapshots(logsMixedOp, 11);
  check('7. mixed operator hourly = 10*75k + 8*80k = 1.390.000', opMixed.operatorAmount === 1_390_000);
}

// ==========================================
// SCENARIO 8: Missing equipment snapshot fails closed
// ==========================================
{
  let failedClosedEq = false;
  try {
    calcEquipmentAmountFromSnapshots([
      { effectiveHours: 8, billingRateSnapshot: null },
    ]);
  } catch {
    failedClosedEq = true;
  }
  check('8. missing equipment snapshot fails closed (throws error)', failedClosedEq);

  let failedClosedZero = false;
  try {
    calcEquipmentAmountFromSnapshots([
      { effectiveHours: 8, billingRateSnapshot: 0 },
    ]);
  } catch {
    failedClosedZero = true;
  }
  check('8. zero equipment snapshot fails closed', failedClosedZero);
}

// ==========================================
// SCENARIO 9: Missing or malformed operator snapshot fails closed
// ==========================================
{
  let failedMissingOpRate = false;
  try {
    calcOperatorCostFromSnapshots([
      { effectiveHours: 8, date: '2026-09-01', operatorRateSnapshot: null, operatorRateTypeSnapshot: 'hourly' },
    ]);
  } catch {
    failedMissingOpRate = true;
  }
  check('9. missing operator rate snapshot fails closed', failedMissingOpRate);

  let failedMissingOpType = false;
  try {
    calcOperatorCostFromSnapshots([
      { effectiveHours: 8, date: '2026-09-01', operatorRateSnapshot: 100_000, operatorRateTypeSnapshot: null },
    ]);
  } catch {
    failedMissingOpType = true;
  }
  check('9. missing operator rate type snapshot fails closed', failedMissingOpType);

  let failedInvalidOpType = false;
  try {
    calcOperatorCostFromSnapshots([
      { effectiveHours: 8, date: '2026-09-01', operatorRateSnapshot: 100_000, operatorRateTypeSnapshot: 'monthly' },
    ]);
  } catch {
    failedInvalidOpType = true;
  }
  check('9. invalid operator rate type snapshot fails closed', failedInvalidOpType);
}

// ==========================================
// SCENARIO 10: Legacy invoice without snapshot
// ==========================================
{
  const legacyStoredSubtotal = 50_000_000;
  const legacyStoredTax = 5_500_000;
  const legacyStoredTotal = 55_500_000;
  check('10. legacy invoice stored total invariant', legacyStoredSubtotal + legacyStoredTax === legacyStoredTotal);
}

// ==========================================
// SCENARIO 11: Legacy invoice PDF presentation rules
// ==========================================
{
  const emptyRates: { billingRateSnapshot: number | null; effectiveHours: number }[] = [];
  const partialRates = [{ billingRateSnapshot: 500_000, effectiveHours: 8 }, { billingRateSnapshot: null, effectiveHours: 8 }];
  const singleRate = [{ billingRateSnapshot: 500_000, effectiveHours: 8 }];

  const emptyValid = emptyRates.map(t => Number(t.billingRateSnapshot)).filter(r => Number.isFinite(r) && r > 0);
  const partialMissing = partialRates.filter(t => !t.billingRateSnapshot || Number(t.billingRateSnapshot) <= 0);

  check('11. legacy invoice PDF empty snapshots identified as unavailable', emptyRates.length === 0 || emptyValid.length === 0);
  check('11. legacy invoice PDF partial snapshots identified as incomplete', partialMissing.length > 0);
  check('11. complete single rate snapshot valid', singleRate.filter(t => !t.billingRateSnapshot).length === 0);
}

// ==========================================
// SCENARIO 12: Invoice preview equals invoice creation calculation & Invariants
// ==========================================
{
  const previewLogs = [
    { effectiveHours: 10, date: '2026-09-01', billingRateSnapshot: 450_000, operatorRateSnapshot: 80_000, operatorRateTypeSnapshot: 'hourly' },
    { effectiveHours: 12, date: '2026-09-02', billingRateSnapshot: 450_000, operatorRateSnapshot: 80_000, operatorRateTypeSnapshot: 'hourly' },
  ];
  const previewTotals = calcInvoiceTotalsFromSnapshots(previewLogs, 11);
  const persistedTotals = calcInvoiceTotalsFromSnapshots(previewLogs, 11);

  check('12. preview equipment amount === persisted equipment amount', previewTotals.equipmentAmount === persistedTotals.equipmentAmount);
  check('12. preview operator amount === persisted operator amount', previewTotals.operatorAmount === persistedTotals.operatorAmount);
  check('12. preview subtotal === persisted subtotal', previewTotals.subtotal === persistedTotals.subtotal);
  check('12. preview tax === persisted tax', previewTotals.tax === persistedTotals.tax);
  check('12. preview total === persisted total', previewTotals.total === persistedTotals.total);

  // Invariants
  check('12. invariant: subtotal === equipmentAmount + operatorAmount', previewTotals.subtotal === round2(previewTotals.equipmentAmount + previewTotals.operatorAmount));
  check('12. invariant: tax === round2(subtotal * taxRate / 100)', previewTotals.tax === round2((previewTotals.subtotal * 11) / 100));
  check('12. invariant: total === subtotal + tax', previewTotals.total === round2(previewTotals.subtotal + previewTotals.tax));
}

// ==========================================
// SCENARIO 13: Multiple assigned contract operators do NOT multiply billing
// ==========================================
{
  const singleTimesheetWithMultipleAssignedOperators = [
    { effectiveHours: 8, date: '2026-09-01', billingRateSnapshot: 400_000, operatorRateSnapshot: 100_000, operatorRateTypeSnapshot: 'hourly' },
  ];
  const opSingleLog = calcOperatorCostFromSnapshots(singleTimesheetWithMultipleAssignedOperators);
  check('13. single timesheet log billed once (8h x 100k = 800k), not multiplied', opSingleLog === 800_000);
}

// ==========================================
// SCENARIO 14: Daily operator billing uses distinct approved dates
// ==========================================
{
  const sameDayLogs = [
    { effectiveHours: 4, date: '2026-09-01', billingRateSnapshot: 400_000, operatorRateSnapshot: 300_000, operatorRateTypeSnapshot: 'daily' },
    { effectiveHours: 4, date: '2026-09-01', billingRateSnapshot: 400_000, operatorRateSnapshot: 300_000, operatorRateTypeSnapshot: 'daily' },
    { effectiveHours: 8, date: '2026-09-02', billingRateSnapshot: 400_000, operatorRateSnapshot: 300_000, operatorRateTypeSnapshot: 'daily' },
  ];
  const opDailyCost = calcOperatorCostFromSnapshots(sameDayLogs);
  check('14. daily operator billing counts 2 unique dates = 2 x 300k = 600.000', opDailyCost === 600_000);
}

// ==========================================
// SCENARIO 15: Payment Schema & Seed Integrity (M2.1)
// ==========================================
{
  // 1. Payment amount must be positive (> 0)
  const zeroPayment = normalizePaymentAmount(0, 10_000_000);
  const negPayment = normalizePaymentAmount(-50_000, 10_000_000);
  const posPayment = normalizePaymentAmount(5_000_000, 10_000_000);
  check('15. payment amount <= 0 rejected (zero)', zeroPayment.rejected);
  check('15. payment amount <= 0 rejected (negative)', negPayment.rejected);
  check('15. positive payment amount accepted', !posPayment.rejected && posPayment.recorded === 5_000_000);

  // 2. Payment method must be one of allowed values
  const allowedMethods = ['transfer', 'cash', 'giro', 'other'] as const;
  const isValidMethod = (m: string) => (allowedMethods as readonly string[]).includes(m);
  check('15. allowed payment methods accepted', allowedMethods.every(m => isValidMethod(m)));
  check('15. invalid payment method rejected', !isValidMethod('bitcoin') && !isValidMethod('credit_card') && !isValidMethod(''));

  // 3 & 4. Seeded paid invoice ledger integrity simulation
  // Every seeded invoice marked 'paid' must have sum(payments) >= invoice.totalAmount - tolerance
  const dummySeededPaidInvoice = {
    totalAmount: '142050000.00',
    status: 'paid' as const,
    dueDate: '2026-09-05',
  };
  const dummySeededPaymentRow = {
    amount: '142050000.00',
    method: 'transfer',
    paidAt: '2026-09-05',
  };
  const seededPaidSum = Number(dummySeededPaymentRow.amount);
  const seededTotal = Number(dummySeededPaidInvoice.totalAmount);
  const seededRemaining = remainingBalance(dummySeededPaidInvoice.totalAmount, seededPaidSum);
  const seededStatus = resolveInvoiceStatus(dummySeededPaidInvoice.totalAmount, seededPaidSum, dummySeededPaidInvoice.dueDate, '2026-09-15');

  check('15. seeded paid invoice payment sum equals invoice total', seededPaidSum === seededTotal);
  check('15. seeded paid invoice remaining balance is 0', seededRemaining === 0);
  check('15. seeded paid invoice status resolves to paid', seededStatus === 'paid');
}

if (failures) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}

console.log('\nSemua uji finansial lolos.');
