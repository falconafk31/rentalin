// Test automated: Validasi integritas data & formula utilisasi Fleet History
// Jalankan: node scripts/fleet-history-check.ts
import { calcOperatorCost, calcInvoiceTotalsWithOperator } from '../src/lib/finance.ts';

let failures = 0;
const check = (name: string, cond: boolean, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
  if (!cond) failures++;
};

// 1. Formula Utilisasi: (Work Days / Contract Days) * 100
const calcUtilization = (workDays: number, contractDays: number) => {
  if (contractDays <= 0) return 0;
  return Math.min(100, Math.round((workDays / contractDays) * 100));
};

check('Utilisasi 0 saat tidak ada kontrak', calcUtilization(0, 0) === 0);
check('Utilisasi 67% (20 hari kerja dari 30 hari kontrak)', calcUtilization(20, 30) === 67, `${calcUtilization(20, 30)}%`);
check('Utilisasi 100% (penuh)', calcUtilization(30, 30) === 100);
check('Utilisasi dicap maksimal 100% jika work days > contract days', calcUtilization(35, 30) === 100);

// 2. Stabilitas historis operator cost & snapshot
const mockLogs = [
  { effectiveHours: 8, date: '2026-03-01' },
  { effectiveHours: 7.5, date: '2026-03-02' },
  { effectiveHours: 8, date: '2026-03-02' }, // tanggal sama (beda shift)
];

// Hourly calculation
const costHourly = calcOperatorCost(
  { includeOperator: true, rateType: 'hourly', rate: 100000 },
  mockLogs
);
check('Hourly operator cost: 23.5 jam x 100.000 = 2.350.000', costHourly === 2350000, String(costHourly));

// Daily calculation (distinct dates)
const costDaily = calcOperatorCost(
  { includeOperator: true, rateType: 'daily', rate: 500000 },
  mockLogs
);
check('Daily operator cost: 2 hari kerja x 500.000 = 1.000.000', costDaily === 1000000, String(costDaily));

// Dry hire calculation
const costDry = calcOperatorCost(
  { includeOperator: false, rateType: 'hourly', rate: 100000 },
  mockLogs
);
check('Dry hire operator cost selalu 0', costDry === 0, String(costDry));

// 3. Invoice calculation dengan PPN
const invoiceRes = calcInvoiceTotalsWithOperator(23.5, 350000, 11, costHourly);
// Sewa = 23.5 x 350.000 = 8.225.000
// Operator = 2.350.000
// Subtotal dasar kena pajak = 8.225.000 + 2.350.000 = 10.575.000
// Pajak 11% = 1.163.250
// Total = 11.738.250
check('Invoice Subtotal Sewa: 8.225.000', invoiceRes.subtotal === 8225000, String(invoiceRes.subtotal));
check('Invoice Operator Amount: 2.350.000', invoiceRes.operatorAmount === 2350000, String(invoiceRes.operatorAmount));
check('Invoice Pajak 11%: 1.163.250', invoiceRes.tax === 1163250, String(invoiceRes.tax));
check('Invoice Total: 11.738.250', invoiceRes.total === 11738250, String(invoiceRes.total));

// 4. Role gating simulation check
const testRoleGating = (role: string) => {
  const isFinance = ['admin', 'finance', 'operations'].includes(role);
  return {
    revenue: isFinance ? 10000000 : null,
    operatorCost: isFinance ? 2000000 : null,
  };
};

check('Admin dapat melihat data finansial', testRoleGating('admin').revenue !== null);
check('Finance dapat melihat data finansial', testRoleGating('finance').revenue !== null);
check('Operations dapat melihat data finansial', testRoleGating('operations').revenue !== null);
check('Operator murni TIDAK dapat melihat data finansial (null)', testRoleGating('operator').revenue === null && testRoleGating('operator').operatorCost === null);

if (failures) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('\nSemua uji Fleet History lolos.');
