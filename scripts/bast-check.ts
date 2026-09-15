// Uji regresi M4.1 (siklus hidup & snapshot historis BAST) — wajib lolos CI.
// Jalankan: node scripts/bast-check.ts  (atau npx tsx scripts/bast-check.ts)
// Mengimpor helper ASLI dari src/lib/bast.ts — kode yang sama yang dipakai
// Server Action saveRecord/changeStatus dan PDF /api/documents, bukan duplikat.
import {
  BAST_TYPES, BAST_STATUSES, BAST_DEFAULT_STATUS,
  BAST_HISTORY_UNAVAILABLE, BAST_RATE_HISTORY_UNAVAILABLE,
  BAST_IMMUTABLE_FIELDS, BAST_CONTENT_FIELDS,
  BAST_FINAL_LOCK_MESSAGE, BAST_ALREADY_FINAL_MESSAGE,
  isBastType, isBastStatus, isBastEditable, canFinalizeBast, assertBastContentKeys,
  buildBastSnapshotValues, readBastSnapshot, bastSnapshotRows, bastClientName, validateBastDate,
} from '../src/lib/bast.ts';

let failures = 0;
const check = (name: string, cond: boolean, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
  if (!cond) failures++;
};
const throws = (fn: () => void): boolean => { try { fn(); return false; } catch { return true; } };

// ==========================================
// 1. Status awal & kosakata siklus hidup
// ==========================================
check('1. status awal BAST adalah draft', BAST_DEFAULT_STATUS === 'draft', BAST_DEFAULT_STATUS);
check('1. kosakata status tepat draft,final', BAST_STATUSES.join(',') === 'draft,final', BAST_STATUSES.join(','));
check('1. isBastStatus menerima draft & final', isBastStatus('draft') && isBastStatus('final'));
check('1. status di luar draft/final ditolak', !isBastStatus('approved') && !isBastStatus('archived'));
check('1. kosakata jenis tepat mobilization,demobilization', BAST_TYPES.join(',') === 'mobilization,demobilization');
check('1. jenis serah terima tak dikenal ditolak', !isBastType('relocation'));

// ==========================================
// 2. Tanggal BAST di dalam periode kontrak
// ==========================================
const period = { contractStart: '2026-01-01', contractEnd: '2026-12-31' };
check('2. tanggal di tengah periode kontrak diterima',
  validateBastDate({ ...period, date: '2026-06-15', type: 'mobilization' }) === null);
check('2. tanggal tepat pada batas periode diterima (inklusif)',
  validateBastDate({ ...period, date: '2026-01-01', type: 'mobilization' }) === null
  && validateBastDate({ ...period, date: '2026-12-31', type: 'demobilization' }) === null);

// ==========================================
// 3. Tanggal sebelum kontrak dimulai
// ==========================================
const beforeStart = validateBastDate({ ...period, date: '2025-12-31', type: 'mobilization' });
check('3. tanggal sebelum mulai kontrak ditolak', beforeStart !== null, beforeStart || '-');
check('3. pesan menunjuk tanggal mulai kontrak', (beforeStart || '').includes('sebelum tanggal mulai kontrak'));

// ==========================================
// 4. Tanggal setelah kontrak selesai
// ==========================================
const afterEnd = validateBastDate({ ...period, date: '2027-01-01', type: 'mobilization' });
check('4. tanggal setelah akhir kontrak ditolak', afterEnd !== null, afterEnd || '-');
check('4. pesan menunjuk tanggal selesai kontrak', (afterEnd || '').includes('setelah tanggal selesai kontrak'));
// ==========================================
// 5. Demobilisasi tidak boleh sebelum mobilisasi
// ==========================================
const demobTooEarly = validateBastDate({
  ...period, date: '2026-03-01', type: 'demobilization', mobilizationDate: '2026-03-10',
});
check('5. demobilisasi sebelum mobilisasi ditolak', demobTooEarly !== null, demobTooEarly || '-');
check('5. pesan menunjuk urutan mobilisasi', (demobTooEarly || '').includes('sebelum tanggal mobilisasi'));

// ==========================================
// 6. Urutan valid mobilisasi -> demobilisasi
// ==========================================
check('6. demobilisasi setelah mobilisasi diterima',
  validateBastDate({ ...period, date: '2026-04-01', type: 'demobilization', mobilizationDate: '2026-03-10' }) === null);
check('6. demobilisasi pada hari yang sama dengan mobilisasi diterima',
  validateBastDate({ ...period, date: '2026-03-10', type: 'demobilization', mobilizationDate: '2026-03-10' }) === null);
check('6. mobilisasi tanpa demobilisasi tetap sah (pasangan tidak wajib ada)',
  validateBastDate({ ...period, date: '2026-02-01', type: 'mobilization', mobilizationDate: null }) === null);
check('6. mengubah mobilisasi melewati demobilisasi yang sudah ada ditolak',
  validateBastDate({ ...period, date: '2026-04-10', type: 'mobilization', demobilizationDate: '2026-04-01' }) !== null);

// ==========================================
// 7. Snapshot diambil dari record server (bukan input klien)
// ==========================================
const snapshot = buildBastSnapshotValues({
  clientName: '  PT Contoh Jaya  ', unitCode: 'EXC-001', unitModel: 'Komatsu PC200-8', ratePerHour: '350000',
});
check('7. nama klien snapshot dirapikan dari record server', snapshot.clientNameSnapshot === 'PT Contoh Jaya', String(snapshot.clientNameSnapshot));
check('7. kode unit & model snapshot terisi', snapshot.unitCodeSnapshot === 'EXC-001' && snapshot.unitModelSnapshot === 'Komatsu PC200-8');
check('7. tarif snapshot tersimpan numerik (2 desimal)', snapshot.rateAtHandover === '350000.00', String(snapshot.rateAtHandover));
const emptySnapshot = buildBastSnapshotValues({});
check('7. sumber kosong menghasilkan NULL, bukan tebakan',
  emptySnapshot.clientNameSnapshot === null && emptySnapshot.unitCodeSnapshot === null
  && emptySnapshot.unitModelSnapshot === null && emptySnapshot.rateAtHandover === null);
check('7. tarif 0 / negatif menjadi NULL (bukan snapshot palsu)',
  buildBastSnapshotValues({ ratePerHour: '0' }).rateAtHandover === null
  && buildBastSnapshotValues({ ratePerHour: -5 }).rateAtHandover === null);

// ==========================================
// 8. Snapshot warisan NULL = fail-closed (tanpa fallback data live)
// ==========================================
const legacy = { clientNameSnapshot: null, unitCodeSnapshot: null, unitModelSnapshot: null, rateAtHandover: null };
const legacyRows = bastSnapshotRows(legacy, (rate) => `Rp${rate}`);
check('8. baris unit warisan menampilkan pesan aman',
  legacyRows[0].value === BAST_HISTORY_UNAVAILABLE && legacyRows[1].value === BAST_HISTORY_UNAVAILABLE, legacyRows[0].value);
check('8. baris tarif warisan menampilkan pesan aman',
  legacyRows[2].value === BAST_RATE_HISTORY_UNAVAILABLE, legacyRows[2].value);
check('8. nama klien warisan menampilkan pesan aman', bastClientName(legacy) === BAST_HISTORY_UNAVAILABLE);
check('8. snapshot lengkap ditandai complete & nilainya dipakai apa adanya',
  readBastSnapshot(snapshot).complete && bastSnapshotRows(snapshot, (rate) => `Rp${rate}`)[0].value === 'EXC-001');
check('8. tarif 0 pada baris warisan tidak dianggap snapshot sah', readBastSnapshot({ rateAtHandover: '0' }).rate === null);
// ==========================================
// 9. Status final tidak dapat diubah
// ==========================================
check('9. final tidak dapat diubah', isBastEditable('final') === false);
check('9. draft masih dapat diubah', isBastEditable('draft') === true);
check('9. status warisan/tak dikenal tidak otomatis editable', !isBastEditable(null) && !isBastEditable('archived'));
check('9. pesan kunci final tersedia di UI/Server Action', BAST_FINAL_LOCK_MESSAGE.length > 0);

// ==========================================
// 10. contractId / type / documentNumber immutable
// ==========================================
check('10. field konten bebas dari field immutable',
  BAST_CONTENT_FIELDS.every((f) => !(BAST_IMMUTABLE_FIELDS as readonly string[]).includes(f)));
check('10. contractId, type, documentNumber termasuk immutable',
  ['contractId', 'type', 'documentNumber'].every((f) => (BAST_IMMUTABLE_FIELDS as readonly string[]).includes(f)));
check('10. field konten tetap memuat date/notes/photoUrls',
  ['date', 'notes', 'photoUrls'].every((f) => (BAST_CONTENT_FIELDS as readonly string[]).includes(f)));
check('10. guard menolak contractId dari form', throws(() => assertBastContentKeys({ contractId: 'x' })));
check('10. guard menolak type dari form', throws(() => assertBastContentKeys({ type: 'mobilization' })));
check('10. guard menolak documentNumber dari form', throws(() => assertBastContentKeys({ documentNumber: 'BAST/2026/001' })));
check('10. guard menolak status dari form', throws(() => assertBastContentKeys({ status: 'final' })));
check('10. guard meloloskan field konten yang sah', !throws(() => assertBastContentKeys({ date: '2026-06-15', notes: 'ok', photoUrls: [] })));

// ==========================================
// 11. Finalisasi hanya dari draft
// ==========================================
check('11. finalisasi sah dari draft', canFinalizeBast('draft') === true);
check('11. status NULL (pra-migrasi terbaca) tidak dapat difinalkan otomatis', canFinalizeBast(null) === false);

// ==========================================
// 12. Finalisasi ulang ditolak
// ==========================================
check('12. finalisasi ulang ditolak', canFinalizeBast('final') === false);
check('12. status tak dikenal tidak dapat difinalkan', canFinalizeBast('archived') === false);
check('12. pesan finalisasi ulang tersedia', BAST_ALREADY_FINAL_MESSAGE.length > 0);

if (failures) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}

console.log('\nSemua uji BAST (M4.1) lolos.');