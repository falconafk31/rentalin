// Uji temuan PM TASK-1B (Finding 2, 3, 4) — wajib lolos sebelum merge.
// Jalankan: node scripts/task1b-check.ts   (Node 22.18+, tanpa flag/build)
// Mengimpor util ASLI (bukan duplikat logika). E2E penuh Supabase+DB
// nyata berjalan di staging — lihat docs/tasks/TASK-1B-PM-REVIEW-FIXES.md.
import { validateImageUpload, detectImageKind, MAX_IMAGE_BYTES } from '../src/lib/images.ts';
import type { ImageValidation } from '../src/lib/images.ts';
import { withFallback } from '../src/lib/resilient.ts';

let failures = 0;
const check = (name: string, cond: boolean, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
  if (!cond) failures++;
};
const acceptedAs = (v: ImageValidation, ct: string) => !('error' in v) && v.contentType === ct;
const rejected = (v: ImageValidation) => 'error' in v;

// --- Finding 2: validasi magic bytes aktual ---
const buf = (head: number[], len = 32) => {
  const b = new Uint8Array(len);
  b.set(head.slice(0, len));
  return b;
};
const bytesOf = (s: string) => [...s].map((c) => c.charCodeAt(0));
const jpeg = buf([0xff, 0xd8, 0xff, 0xe0]);
const png = buf([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const webp = buf([0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);

check('JPEG valid → diterima sebagai image/jpeg', acceptedAs(validateImageUpload(jpeg), 'image/jpeg'));
check('PNG valid → diterima sebagai image/png', acceptedAs(validateImageUpload(png), 'image/png'));
check('WebP valid → diterima sebagai image/webp', acceptedAs(validateImageUpload(webp), 'image/webp'));
check('.exe diganti .jpg (MZ) → ditolak', rejected(validateImageUpload(buf([0x4d, 0x5a, 0x90, 0x00]))));
check('biner acak samaran .png → ditolak', rejected(validateImageUpload(buf([0x00, 0x01, 0x02, 0x03, 0xde, 0xad, 0xbe, 0xef]))));
check('HTML (<html) → ditolak', rejected(validateImageUpload(buf(bytesOf('<html>')))));
check('SVG (<svg) → ditolak', rejected(validateImageUpload(buf(bytesOf('<svg ')))));
check('GIF89a → ditolak (tak dibutuhkan)', rejected(validateImageUpload(buf(bytesOf('GIF89a')))));
check('PNG palsu (4 byte awal saja benar) → ditolak', rejected(validateImageUpload(buf([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x00, 0x00]))));
check('header terpotong (<12 byte) → ditolak', detectImageKind(new Uint8Array([0xff, 0xd8, 0xff])) === null);
const huge = new Uint8Array(MAX_IMAGE_BYTES + 1);
huge.set([0xff, 0xd8, 0xff, 0xe0]);
const hugeRes = validateImageUpload(huge);
check('lebih dari 5 MB → ditolak (pesan ukuran)', rejected(hugeRes) && hugeRes.error.includes('5 MB'));

// --- Finding 3: mekanisme best-effort tak pernah throw ---
const ok1 = await withFallback(async () => 'Aditya', 'fb', 't');
check('audit sukses → nilai dipakai', ok1 === 'Aditya');
const ok2 = await withFallback(async () => { throw new Error('connection refused'); }, 'user@x.id', 't');
check('DB gagal async → fallback, tak throw', ok2 === 'user@x.id');
const ok3 = await withFallback(() => { throw new Error('DATABASE_URL is required'); }, 'user@y.id', 't');
check('DB gagal sync (mode Proxy db) → fallback, tak throw', ok3 === 'user@y.id');

// --- Finding 4: simulasi predikat 0016 (cerminan eksak SQL, nilai bulat) ---
type Inv = { n: string; total: number | null; tax: number | null; sub: number | null; rate: number | null };
const baseBad = (i: Inv) =>
  i.total === null || i.tax === null || i.total < 0 || i.tax < 0 || i.tax > i.total;
const snapBad = (i: Inv) =>
  i.sub === null || i.rate === null || i.sub !== i.total! - i.tax! || i.rate < 0 || i.rate > 100;
// Formula backfill 0014 (untuk data waras): subtotal = total-pajak; tarif = pajak/subtotal*100.
const backfill = (total: number, tax: number) => {
  const sub = total - tax;
  return { sub, rate: sub === 0 ? 0 : Math.round((tax / sub) * 100 * 100) / 100 };
};
const normal: Inv = { n: 'INV-11%', total: 111000000, tax: 11000000, sub: 100000000, rate: 11 };
const zeroTax: Inv = { n: 'INV-0%', total: 50000000, tax: 0, sub: 50000000, rate: 0 };
check('invoice 11% normal → lolos both checks', !baseBad(normal) && !snapBad(normal));
check('invoice pajak-nol → lolos (rate 0 sah)', !baseBad(zeroTax) && !snapBad(zeroTax));
check('backfill 0014 untuk 11% → {100jt, 11}', (() => { const b = backfill(111000000, 11000000); return b.sub === 100000000 && b.rate === 11; })());
check('backfill 0014 untuk pajak-nol → {50jt, 0}', (() => { const b = backfill(50000000, 0); return b.sub === 50000000 && b.rate === 0; })());
check('pajak > total → TERDETEKSI (migrasi raise, bukan repair)',
  baseBad({ n: 'X', total: 100000, tax: 150000, sub: -50000, rate: -300 }));
check('total negatif → TERDETEKSI', baseBad({ n: 'X', total: -50, tax: 0, sub: -50, rate: 0 }));
check('pajak null → TERDETEKSI', baseBad({ n: 'X', total: 100000, tax: null, sub: null, rate: null }));
check('snapshot tak cocok (sub≠total-pajak) → TERDETEKSI',
  !baseBad({ n: 'X', total: 111000000, tax: 11000000, sub: 99999999, rate: 11 }) &&
  snapBad({ n: 'X', total: 111000000, tax: 11000000, sub: 99999999, rate: 11 }));
check('tarif 150% (snapshot korup manual) → TERDETEKSI',
  !baseBad({ n: 'X', total: 100000, tax: 11000, sub: 89000, rate: 150 }) &&
  snapBad({ n: 'X', total: 100000, tax: 11000, sub: 89000, rate: 150 }));
check('subtotal null → TERDETEKSI', snapBad({ n: 'X', total: 100000, tax: 11000, sub: null, rate: 11 }));

if (failures) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('\nSemua uji TASK-1B lolos.');
