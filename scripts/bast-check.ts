// Uji regresi M4.1 (siklus hidup & snapshot historis BAST) — wajib lolos CI.
// Jalankan: node scripts/bast-check.ts  (atau npx tsx scripts/bast-check.ts)
// Mengimpor helper ASLI dari src/lib/bast.ts — kode yang sama yang dipakai
// Server Action saveRecord/changeStatus dan PDF /api/documents, bukan duplikat.
import { readFileSync } from 'node:fs';
import {
  BAST_TYPES, BAST_STATUSES, BAST_DEFAULT_STATUS,
  BAST_HISTORY_UNAVAILABLE, BAST_RATE_HISTORY_UNAVAILABLE,
  BAST_IMMUTABLE_FIELDS, BAST_CONTENT_FIELDS,
  BAST_FINAL_LOCK_MESSAGE, BAST_ALREADY_FINAL_MESSAGE,
  BAST_DUPLICATE_NUMBER_MESSAGE, BAST_DUPLICATE_TYPE_MESSAGE, BAST_DUPLICATE_FALLBACK_MESSAGE,
  isBastType, isBastStatus, isBastEditable, canFinalizeBast, assertBastContentKeys,
  buildBastSnapshotValues, readBastSnapshot, bastSnapshotRows, bastClientName, validateBastDate,
  isUniqueViolation, classifyBastUniqueError, bastDuplicateMessage,
} from '../src/lib/bast.ts';
import { isUserAuthorizedForBastPhoto } from '../src/lib/fleet-history-helpers.ts';

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

// ==========================================
// 13. Invarian urutan lock: edit BAST draf vs revisi kontrak (M4.1 follow-up)
// ==========================================
// CATATAN JUJUR: ini uji INVARIAN STATIS atas kode sumber (bentuk lock di
// src/app/actions.ts), BUKAN uji konkurensi PostgreSQL — skrip ini tidak
// membuka koneksi DB dan tidak memalsukan uji transaksi paralel.
// Invarian yang dijaga: baris KONTRAK dikunci FOR UPDATE di jalur EDIT BAST
// draf SEBELUM validasi tanggal, sehingga reviseContract() (yang juga
// mengunci kontrak) tidak dapat commit di antara validasi dan UPDATE:
// "BAST draft date validation must use a locked contract row."
const actionsSource = readFileSync(new URL('../src/app/actions.ts', import.meta.url), 'utf8');
const EDIT_MARKER = '// LOCK ORDER (M4.1 follow-up): handovers -> contracts.';
const CREATE_MARKER = '// LOCK ORDER (M4.1 follow-up): contracts -> handovers (insert baris baru).';

const editAt = actionsSource.indexOf(EDIT_MARKER);
const createAt = actionsSource.indexOf(CREATE_MARKER);
check('13. penanda urutan lock jalur EDIT BAST draf ada', editAt > -1);
check('13. penanda urutan lock jalur CREATE BAST ada', createAt > -1);

// Potong blok edit agar tidak meminjam lock dari blok create.
const editEnd = createAt > editAt && editAt > -1 ? createAt : actionsSource.length;
const editBlock = editAt > -1 ? actionsSource.slice(editAt, Math.min(editAt + 2000, editEnd)) : '';
const editHandoverLock = editBlock.indexOf('from(s.handovers)');
const editContractLock = editBlock.indexOf('from(s.contracts)');
const editValidate = editBlock.indexOf('validateBastDate(');
check('13. edit: baris BAST dikunci sebelum baris kontrak (handovers -> contracts)',
  editHandoverLock > -1 && editContractLock > -1 && editHandoverLock < editContractLock);
check('13. edit: dua lock FOR UPDATE (BAST + kontrak) di transaksi yang sama',
  (editBlock.split(".for('update')").length - 1) === 2);
check('13. edit: kontrak dikunci SEBELUM validasi tanggal (tidak ada jendela stale)',
  editContractLock > -1 && editValidate > -1 && editContractLock < editValidate);
check('13. edit: validasi tanggal memakai kontrak terkunci, bukan salinan sebelum lock',
  editBlock.indexOf('const [contract]=await tx.select().from(s.contracts)') > -1
  && editBlock.indexOf('const dateErr=validateBastDate(') > -1);

const createEnd = createAt > -1 ? actionsSource.indexOf('\n    });', createAt) : -1;
const createBlock = createAt > -1 ? actionsSource.slice(createAt, createEnd > createAt ? createEnd : createAt + 1500) : '';
check('13. create: kontrak dikunci FOR UPDATE sebelum validasi tanggal',
  createBlock.indexOf('from(s.contracts)') > -1
  && createBlock.indexOf('from(s.contracts)') < createBlock.indexOf('validateBastDate('));
check('13. create: hanya satu lock FOR UPDATE (baris BAST lama tidak dikunci -> tanpa siklus)',
  (createBlock.split(".for('update')").length - 1) === 1);

// ==========================================
// 14. F5: 23505 unique violation -> pesan bisnis Indonesia yang aman (M4.2)
// ==========================================
// CATATAN JUJUR: uji perilaku murni atas helper klasifikasi
// (isUniqueViolation/classifyBastUniqueError/bastDuplicateMessage) —
// otoritas final tetap constraint DB di produksi. Blok catch INSERT di
// saveRecord('bast') dijaga invarian sumber pada §15.
check('14. kode 23505 dikenali sebagai unique violation', isUniqueViolation({ code: '23505' }));
check('14. kode 23505 via cause (driver postgres) dikenali', isUniqueViolation({ cause: { code: '23505' } }));
check('14. kode non-unique bukan unique violation', !isUniqueViolation({ code: '23503' }) && !isUniqueViolation(null) && !isUniqueViolation({}));
check('14. constraint nomor dokumen diklasifikasi documentNumber',
  classifyBastUniqueError({ constraint: 'handovers_document_number_key' }) === 'documentNumber'
  && classifyBastUniqueError({ detail: 'Key (document_number)=(BAST/2026/001) already exists.' }) === 'documentNumber');
check('14. constraint (contract_id,type) diklasifikasi contractType',
  classifyBastUniqueError({ constraint: 'handovers_contract_type_unique' }) === 'contractType'
  && classifyBastUniqueError({ message: 'duplicate key value violates unique constraint "handovers_contract_type_unique"' }) === 'contractType');
check('14. error tak dikenal jatuh ke kategori other', classifyBastUniqueError({ code: '23505' }) === 'other');
check('14. pesan duplikat nomor sesuai UX yang disepakati',
  bastDuplicateMessage('documentNumber') === BAST_DUPLICATE_NUMBER_MESSAGE
  && bastDuplicateMessage('documentNumber').includes('Nomor BAST')
  && !/duplicate|unique|constraint|23505/i.test(bastDuplicateMessage('documentNumber')));
check('14. pesan duplikat jenis menunjuk kontrak, bukan teks PG mentah',
  bastDuplicateMessage('contractType') === BAST_DUPLICATE_TYPE_MESSAGE
  && !/duplicate|unique|constraint|23505/i.test(bastDuplicateMessage('contractType')));
check('14. pesan fallback generik tetap tersedia', bastDuplicateMessage('other') === BAST_DUPLICATE_FALLBACK_MESSAGE);

// ==========================================
// 15. F5/F6/F8: invarian sumber jalur BAST (otorisasi + 23505 + foto) (M4.2)
// ==========================================
const PHOTO_GET_MARKER = '// M4.2/F6: hanya empat role internal menurut model peran (0004/0012).';
const PHOTO_PATH_MARKER = '// M4.2/F6: tolak traversal/null-byte/non-string sebelum query DB.';
const PHOTO_POST_MARKER = '// M4.2/F6: finance tidak boleh mengunggah foto (selaras 0012: tulis hanya';
const BAST_CATCH_MARKER = '// M4.2/F5: bila INSERT ditolak constraint unique (TOCTOU dua create';
const apiPhotosSource = readFileSync(new URL('../src/app/api/bast-photos/route.ts', import.meta.url), 'utf8');
const docPdfSource = readFileSync(new URL('../src/app/api/documents/[kind]/[id]/route.ts', import.meta.url), 'utf8');

check('15. blok catch 23505 INSERT BAST ada di saveRecord',
  actionsSource.indexOf(BAST_CATCH_MARKER) > -1
  && actionsSource.indexOf('isUniqueViolation(insertError)') > -1
  && actionsSource.indexOf('bastDuplicateMessage(classifyBastUniqueError(insertError))') > -1);
check('15. pre-check duplikat tetap UX-only (komentar otoritas constraint)',
  actionsSource.indexOf('otoritas final tetap constraint DB') > -1
  && actionsSource.indexOf('handovers_contract_type_unique') > -1);
check('15. jalur finalize BAST terkunci role operationRoles (admin/operations)',
  actionsSource.indexOf("module==='bast'&&status==='final'") > -1);
check('15. GET foto BAST memakai daftar role eksplisit (tanpa allow-all)',
  apiPhotosSource.indexOf(PHOTO_GET_MARKER) > -1
  && apiPhotosSource.indexOf("requireUser(['admin', 'operations', 'operator', 'finance'])") > -1);
check('15. GET foto BAST menolak traversal & null-byte sebelum query DB',
  apiPhotosSource.indexOf(PHOTO_PATH_MARKER) > -1
  && apiPhotosSource.indexOf("path.includes('..')") > -1);
check('15. GET foto BAST resolve BAST lewat photoUrls terdaftar + otorisasi entitas',
  apiPhotosSource.indexOf('= ANY(') > -1
  && apiPhotosSource.indexOf('isUserAuthorizedForBastPhoto(') > -1
  && apiPhotosSource.indexOf('createSignedUrl(path, 3600)') > -1);
check('15. POST foto BAST tetap admin/operations/operator (finance ditolak)',
  apiPhotosSource.indexOf(PHOTO_POST_MARKER) > -1
  && apiPhotosSource.indexOf("requireUser(['admin', 'operations', 'operator'])") > -1);
check('15. PDF BAST mensyaratkan login internal (tanpa akses publik)',
  docPdfSource.indexOf('await requireUser()') > -1);
check('15. bucket foto BAST tetap privat (tanpa jalur publik baru)',
  apiPhotosSource.indexOf("from('bast-photos')") > -1
  && apiPhotosSource.indexOf('createSignedUrl') > -1
  && !/makePublic|publicUrl|getPublicUrl/.test(apiPhotosSource));

// ==========================================
// 16. F6/F8: matriks otorisasi foto BAST per role (helper murni)
// ==========================================
const bastCtx = (role: string, assigned: string[]) => ({
  user: { id: 'profil-1', role },
  handover: { id: 'bast-1', contractId: 'ktr-1', photoUrls: ['handovers/foto-a.jpg'], assignedOperatorProfileIds: assigned },
});
check('16. admin/operations/finance boleh membaca foto BAST kontrak mana pun',
  isUserAuthorizedForBastPhoto('handovers/foto-a.jpg', bastCtx('admin', []).user, bastCtx('admin', []).handover)
  && isUserAuthorizedForBastPhoto('handovers/foto-a.jpg', bastCtx('operations', []).user, bastCtx('operations', []).handover)
  && isUserAuthorizedForBastPhoto('handovers/foto-a.jpg', bastCtx('finance', []).user, bastCtx('finance', []).handover));
check('16. operator yang ditugaskan boleh membaca foto kontraknya',
  isUserAuthorizedForBastPhoto('handovers/foto-a.jpg', bastCtx('operator', ['profil-1']).user, bastCtx('operator', ['profil-1']).handover));
check('16. operator tak-tertugas DITOLAK membaca foto kontrak lain',
  !isUserAuthorizedForBastPhoto('handovers/foto-a.jpg', bastCtx('operator', ['profil-9']).user, bastCtx('operator', ['profil-9']).handover)
  && !isUserAuthorizedForBastPhoto('handovers/foto-a.jpg', bastCtx('operator', []).user, bastCtx('operator', []).handover));
check('16. peran di luar model (viewer/tamu) DITOLAK',
  !isUserAuthorizedForBastPhoto('handovers/foto-a.jpg', bastCtx('viewer', ['profil-1']).user, bastCtx('viewer', ['profil-1']).handover)
  && !isUserAuthorizedForBastPhoto('handovers/foto-a.jpg', bastCtx('guest', []).user, bastCtx('guest', []).handover));
check('16. path traversal / prefix salah / foto tak terdaftar DITOLAK',
  !isUserAuthorizedForBastPhoto('handovers/../rahasia.jpg', bastCtx('admin', []).user, bastCtx('admin', []).handover)
  && !isUserAuthorizedForBastPhoto('fleet/foto-a.jpg', bastCtx('admin', []).user, bastCtx('admin', []).handover)
  && !isUserAuthorizedForBastPhoto('handovers/foto-lain.jpg', bastCtx('admin', []).user, bastCtx('admin', []).handover)
  && !isUserAuthorizedForBastPhoto('', bastCtx('admin', []).user, bastCtx('admin', []).handover));
if (failures) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}

console.log('\nSemua uji BAST (M4.1) lolos.');