// Test automated: Validasi integritas data & formula utilisasi Fleet History sesuai PR #26 Final Correction Pass
// Mengimpor helper murni langsung dari kode produksi: src/lib/fleet-history-helpers.ts & src/lib/finance.ts
// Jalankan: node scripts/fleet-history-check.ts
import {
  calcTotalHmUsed,
  calcApprovedWorkDays,
  calcFleetUtilization,
  calcPaginationParams,
  isUserAuthorizedForBastPhoto,
} from '../src/lib/fleet-history-helpers.ts';
import { calcOperatorCost, calcInvoiceTotalsWithOperator } from '../src/lib/finance.ts';

let failures = 0;
const check = (name: string, cond: boolean, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
  if (!cond) failures++;
};

console.log('--- 1. HM TERPAKAI: IMPORT DARI PRODUKSI (calcTotalHmUsed) ---');
// Uji A: Interval valid tidak menggunakan max-min global
const sampleIntervals = [
  { startHm: 1000, endHm: 1008 }, // 8 HM
  { startHm: 1020, endHm: 1028 }, // 8 HM
];
const hm1 = calcTotalHmUsed(sampleIntervals);
check('HM Terpakai: 1000->1008 (8) + 1020->1028 (8) = 16 HM (bukan 28)', hm1 === 16, `${hm1} HM`);

// Interval dengan input string desimal & invalid interval
const sampleIntervals2 = [
  { startHm: '50.5', endHm: '58.5' }, // 8 HM
  { startHm: '100', endHm: '90' },    // Invalid (end < start) => diabaikan
  { startHm: '-5', endHm: '10' },     // Invalid (start < 0) => diabaikan
];
const hm2 = calcTotalHmUsed(sampleIntervals2);
check('HM Terpakai: mengabaikan start negatif & end < start', hm2 === 8, `${hm2} HM`);

console.log('\n--- 2. STATUS SEMANTIK UTILISASI: IMPORT DARI PRODUKSI (calcApprovedWorkDays & calcFleetUtilization) ---');
const mixedStatusLogs = [
  { date: '2026-03-01', status: 'approved' },
  { date: '2026-03-02', status: 'approved' },
  { date: '2026-03-03', status: 'approved' },
  { date: '2026-03-04', status: 'pending' },  // tidak boleh dihitung
  { date: '2026-03-05', status: 'rejected' }, // tidak boleh dihitung
];
const approvedDays = calcApprovedWorkDays(mixedStatusLogs);
check('WorkDays hanya menghitung timesheet status approved: 3 hari (bukan 5)', approvedDays === 3, `${approvedDays} hari`);

const pendingOnly = calcApprovedWorkDays([{ date: '2026-03-01', status: 'pending' }]);
check('Pending only => approved workDays = 0', pendingOnly === 0, `${pendingOnly} hari`);

const rejectedOnly = calcApprovedWorkDays([{ date: '2026-03-01', status: 'rejected' }]);
check('Rejected only => approved workDays = 0', rejectedOnly === 0, `${rejectedOnly} hari`);

// Formula Utilisasi
check('Utilisasi 60% (3 hari kerja dari 5 hari kontrak)', calcFleetUtilization(3, 5) === 60);
check('Utilisasi cap 100% jika workDays > contractDays', calcFleetUtilization(35, 30) === 100);
check('Utilisasi 0% jika contractDays <= 0', calcFleetUtilization(5, 0) === 0);
check('Utilisasi 0% jika workDays <= 0', calcFleetUtilization(0, 30) === 0);

console.log('\n--- 3. PAGINASI SERVER-SIDE: IMPORT DARI PRODUKSI (calcPaginationParams) ---');
const p1 = calcPaginationParams({ totalRecords: 45, page: 1, pageSize: 10 });
check('Halaman 1: page=1, offset=0, limit=10, totalPages=5', p1.page === 1 && p1.offset === 0 && p1.limit === 10 && p1.totalPages === 5);

const p2 = calcPaginationParams({ totalRecords: 45, page: 2, pageSize: 10 });
check('Halaman 2: page=2, offset=10, limit=10, totalPages=5', p2.page === 2 && p2.offset === 10 && p2.limit === 10);

const pOverflow = calcPaginationParams({ totalRecords: 45, page: 99, pageSize: 10 });
check('Halaman melebihi batas diclamp ke totalPages (halaman 5)', pOverflow.page === 5 && pOverflow.offset === 40);

const pUnderflow = calcPaginationParams({ totalRecords: 45, page: -5, pageSize: 10 });
check('Halaman negatif diclamp ke halaman 1', pUnderflow.page === 1 && pUnderflow.offset === 0);

console.log('\n--- 4. BAST PHOTO ENTITY-LEVEL AUTHORIZATION: IMPORT DARI PRODUKSI (isUserAuthorizedForBastPhoto) ---');
const mockHandover = {
  id: 'handover-uuid-1',
  contractId: 'contract-uuid-1',
  photoUrls: [
    'handovers/1726000000-photo1.jpg',
    'handovers/1726000000-photo2.jpg',
  ],
  assignedOperatorProfileIds: ['user-operator-assigned'],
};

// 1. Registered photo + internal authorized role (admin, operations, finance) => ALLOWED
check(
  '1. Admin dapat mengakses foto BAST terdaftar',
  isUserAuthorizedForBastPhoto('handovers/1726000000-photo1.jpg', { id: 'user-admin', role: 'admin' }, mockHandover)
);
check(
  '1b. Operations dapat mengakses foto BAST terdaftar',
  isUserAuthorizedForBastPhoto('handovers/1726000000-photo1.jpg', { id: 'user-ops', role: 'operations' }, mockHandover)
);
check(
  '1c. Finance dapat mengakses foto BAST terdaftar',
  isUserAuthorizedForBastPhoto('handovers/1726000000-photo1.jpg', { id: 'user-fin', role: 'finance' }, mockHandover)
);

// 2. Operator yang ditugaskan pada kontrak => ALLOWED
check(
  '2a. Operator yang ditugaskan pada kontrak berhak mengakses foto',
  isUserAuthorizedForBastPhoto(
    'handovers/1726000000-photo1.jpg',
    { id: 'user-operator-assigned', role: 'operator' },
    mockHandover
  )
);

// 2b. Operator lain yang TIDAK ditugaskan pada kontrak => DENIED
check(
  '2b. Operator TIDAK ditugaskan pada kontrak ditolak mengakses foto',
  !isUserAuthorizedForBastPhoto(
    'handovers/1726000000-photo1.jpg',
    { id: 'user-operator-stranger', role: 'operator' },
    mockHandover
  )
);

// 2c. Role sembarang / unauthorized => DENIED
check(
  '2c. Role sembarang / tamu ditolak mengakses foto',
  !isUserAuthorizedForBastPhoto(
    'handovers/1726000000-photo1.jpg',
    { id: 'user-guest', role: 'guest' },
    mockHandover
  )
);

// 3. Unregistered guessed path => DENIED
check(
  '3. Path tebakan yang tidak terdaftar pada BAST ini ditolak',
  !isUserAuthorizedForBastPhoto(
    'handovers/9999999999-evil-guess.jpg',
    { id: 'user-admin', role: 'admin' },
    mockHandover
  )
);

// 4. Non-handovers path => DENIED
check(
  '4. Path di luar prefix handovers/ ditolak',
  !isUserAuthorizedForBastPhoto(
    'fleet/photos/cover.jpg',
    { id: 'user-admin', role: 'admin' },
    mockHandover
  )
);

console.log('\n--- 5. SEMANTIK FINANSIAL & ROLE GATING (calcOperatorCost & calcInvoiceTotalsWithOperator) ---');
const logs = [
  { effectiveHours: 10, date: '2026-03-01' },
  { effectiveHours: 10, date: '2026-03-02' },
];
const hourlyBilled = calcOperatorCost(
  { includeOperator: true, rateType: 'hourly', rate: 150000 },
  logs
);
check('Operator Amount (hourly): 20 jam x 150.000 = 3.000.000', hourlyBilled === 3000000);

const invTotals = calcInvoiceTotalsWithOperator(20, 350000, 11, hourlyBilled);
check('Total tagihan invoice (totalAmount) termasuk PPN: 11.100.000', invTotals.total === 11100000);

// Catatan metodologi pengujian
console.log('\n[Catatan Metodologi Pengujian]:');
console.log('Helper murni diuji langsung dari kode produksi. Pengujian database nyata diuji via CI staging environment.');

if (failures) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('\nSemua uji perbaikan Final PR #26 lolos secara komprehensif.');
