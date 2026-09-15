/**
 * Aturan siklus hidup & snapshot historis BAST (M4.1, migrasi 0027).
 *
 * Modul PURE — tanpa DB, `server-only`, atau I/O — sehingga dapat diuji
 * langsung oleh `scripts/bast-check.ts` (dijalankan CI) dan dipakai bersama
 * oleh Server Action (`src/app/actions.ts`) dan PDF (`/api/documents`).
 *
 * Dua aturan inti yang tidak boleh dilanggar fitur berikutnya:
 * 1. SIKLUS HIDUP: `draft` -> `final` satu arah. Final = beku (immutable).
 * 2. FAIL-CLOSED: snapshot NULL (baris warisan pra-0027) TIDAK PERNAH
 *    diganti data kontrak/klien/unit live — pola identik M1.3 (migrasi 0026).
 */

export type BastType = 'mobilization' | 'demobilization';
export type BastStatus = 'draft' | 'final';

export const BAST_TYPES = ['mobilization', 'demobilization'] as const;
export const BAST_STATUSES = ['draft', 'final'] as const;

/** Status awal setiap BAST baru — satu-satunya sumber kebenaran. */
export const BAST_DEFAULT_STATUS: BastStatus = 'draft';

/** Pesan aman bila snapshot historis tidak tersedia (fail-closed). */
export const BAST_HISTORY_UNAVAILABLE = 'Data historis tidak tersedia';
export const BAST_RATE_HISTORY_UNAVAILABLE = 'Data tarif historis tidak tersedia';

/** Ditolak saat mencoba mengubah BAST yang sudah `final`. */
export const BAST_FINAL_LOCK_MESSAGE = 'BAST yang sudah difinalkan tidak dapat diubah.';
/** Ditolak saat finalisasi diulang atau dari status selain `draft`. */
export const BAST_ALREADY_FINAL_MESSAGE = 'BAST ini sudah difinalkan.';

// Pesan bisnis untuk pelanggaran unique BAST (M4.2 / F5). Constraint DB
// (`handovers_document_number_key`, `handovers_contract_type_unique`) tetap
// otoritas final; pesan ini hanya UX aman tanpa teks mentah PostgreSQL.
export const BAST_DUPLICATE_NUMBER_MESSAGE = 'Nomor BAST untuk jenis dokumen tersebut sudah digunakan. Gunakan nomor yang berbeda.';
export const BAST_DUPLICATE_TYPE_MESSAGE = 'BAST untuk jenis serah terima ini sudah ada pada kontrak tersebut.';
export const BAST_DUPLICATE_FALLBACK_MESSAGE = 'Data serah terima sudah terdaftar. Periksa kembali isian Anda.';

export type BastUniqueKind = 'documentNumber' | 'contractType' | 'other';

/**
 * Klasifikasikan error PostgreSQL unique violation (23505) ke pesan bisnis.
 * Selalu dipanggil dari Server Action setelah constraint menolak INSERT —
 * pre-check SELECT tetap ada hanya sebagai UX awal, BUKAN mekanisme koreksi
 * (TOCTOU tetap dimenangkan constraint DB).
 */
export function isUniqueViolation(error: unknown): boolean {
  const e = error as null | { code?: string; cause?: { code?: string } };
  if (!e || typeof e !== 'object') return false;
  return e.code === '23505' || e.cause?.code === '23505';
}

export function classifyBastUniqueError(error: unknown): BastUniqueKind {
  const pick = (obj: unknown): string => {
    if (!obj || typeof obj !== 'object') return '';
    const o = obj as { constraint?: unknown; constraintName?: unknown; detail?: unknown; message?: unknown };
    return [o.constraint, o.constraintName, o.detail, o.message].filter((v) => typeof v === 'string').join(' ').toLowerCase();
  };
  const e = error as { cause?: unknown };
  const hay = `${pick(error)} ${pick(e?.cause)}`;
  if (hay.includes('document_number')) return 'documentNumber';
  if (hay.includes('contract_id') && hay.includes('type')) return 'contractType';
  if (hay.includes('handovers_contract_type_unique')) return 'contractType';
  if (hay.includes('handovers_document_number_key') || hay.includes('document_number_key')) return 'documentNumber';
  return 'other';
}

export function bastDuplicateMessage(kind: BastUniqueKind): string {
  if (kind === 'documentNumber') return BAST_DUPLICATE_NUMBER_MESSAGE;
  if (kind === 'contractType') return BAST_DUPLICATE_TYPE_MESSAGE;
  return BAST_DUPLICATE_FALLBACK_MESSAGE;
}

// ---------------------------------------------------------------------------
// Field immutable vs field isi (M4.1 §6)
// ---------------------------------------------------------------------------
// kontrak/jenis/nomor dokumen — plus snapshot & status — TIDAK PERNAH boleh
// ditulis dari form/klien. Dipakai sebagai guard runtime `assertBastContentKeys`.
export const BAST_IMMUTABLE_FIELDS = [
  'id', 'contractId', 'type', 'documentNumber', 'status',
  'clientNameSnapshot', 'unitCodeSnapshot', 'unitModelSnapshot', 'rateAtHandover', 'createdAt',
] as const;

// Field isi yang boleh ditulis ulang SELAMA status masih `draft`.
export const BAST_CONTENT_FIELDS = [
  'date', 'engine', 'hydraulics', 'tracks', 'oil', 'fuel', 'battery', 'lights', 'brakes',
  'bucket', 'cabin', 'safety', 'documents', 'notes', 'photoUrls',
] as const;

export function isBastType(value: string): value is BastType {
  return (BAST_TYPES as readonly string[]).includes(value);
}

export function isBastStatus(value: string): value is BastStatus {
  return (BAST_STATUSES as readonly string[]).includes(value);
}

/**
 * Guard runtime: tolak nilai form yang menyelundupkan field immutable.
 * Pengaman server-side — UI yang men-disable input BUKAN jaminan (M4.1 §6).
 */
export function assertBastContentKeys(values: Record<string, unknown>): void {
  for (const key of BAST_IMMUTABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      throw new Error(`Field BAST "${key}" tidak dapat diubah setelah BAST dibuat.`);
    }
  }
}

// ---------------------------------------------------------------------------
// Siklus hidup
// ---------------------------------------------------------------------------
/** Hanya `draft` yang boleh diubah; `final` beku selamanya (satu arah). */
export function isBastEditable(status: string | null | undefined): boolean {
  return status === 'draft';
}

/** Finalisasi hanya sah dari `draft` — finalisasi ulang selalu ditolak. */
export function canFinalizeBast(status: string | null | undefined): boolean {
  return status === 'draft';
}
// ---------------------------------------------------------------------------
// Snapshot historis
// ---------------------------------------------------------------------------
function normalizeText(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed ? trimmed : null;
}

function normalizeRate(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Sumber snapshot: SELALU baris database server (bukan input klien). */
export interface BastSnapshotSource {
  clientName?: string | null;
  unitCode?: string | null;
  unitModel?: string | null;
  ratePerHour?: string | number | null;
}

export interface BastSnapshotValues {
  clientNameSnapshot: string | null;
  unitCodeSnapshot: string | null;
  unitModelSnapshot: string | null;
  rateAtHandover: string | null;
}

/**
 * Bangun nilai snapshot dari record server (klien, unit, kontrak) yang sudah
 * divalidasi. Nilai tak layak (kosong / tarif <= 0) menjadi NULL — bukan
 * ditebak — supaya fail-closed terpenuhi.
 */
export function buildBastSnapshotValues(source: BastSnapshotSource): BastSnapshotValues {
  const rate = normalizeRate(source.ratePerHour);
  return {
    clientNameSnapshot: normalizeText(source.clientName),
    unitCodeSnapshot: normalizeText(source.unitCode),
    unitModelSnapshot: normalizeText(source.unitModel),
    rateAtHandover: rate === null ? null : rate.toFixed(2),
  };
}

export interface BastSnapshotFields {
  clientNameSnapshot?: string | null;
  unitCodeSnapshot?: string | null;
  unitModelSnapshot?: string | null;
  rateAtHandover?: string | number | null;
}

export interface BastSnapshot {
  clientName: string | null;
  unitCode: string | null;
  unitModel: string | null;
  rate: number | null;
  /** true hanya bila keempat snapshot historis lengkap. */
  complete: boolean;
}

/** Baca snapshot apa adanya — tidak pernah menyentuh data live. */
export function readBastSnapshot(handover: BastSnapshotFields): BastSnapshot {
  const clientName = normalizeText(handover.clientNameSnapshot);
  const unitCode = normalizeText(handover.unitCodeSnapshot);
  const unitModel = normalizeText(handover.unitModelSnapshot);
  const rate = normalizeRate(handover.rateAtHandover);
  return { clientName, unitCode, unitModel, rate, complete: Boolean(clientName && unitCode && unitModel && rate) };
}
/**
 * Baris informasi unit untuk PDF BAST, seluruhnya dari snapshot.
 * - Kode unit/model/tarif: pesan aman bila NULL (TIDAK memakai data live).
 * - "Kategori" sengaja tidak ditampilkan lagi untuk BAST: kategori unit bukan
 *   bagian snapshot (M4.1 §1), sehingga menampilkannya berarti mengklaim data
 *   live pada dokumen historis.
 */
export function bastSnapshotRows(
  handover: BastSnapshotFields,
  formatRate: (rate: number) => string,
): { label: string; value: string }[] {
  const snapshot = readBastSnapshot(handover);
  return [
    { label: 'Kode unit alat berat', value: snapshot.unitCode ?? BAST_HISTORY_UNAVAILABLE },
    { label: 'Merek / model', value: snapshot.unitModel ?? BAST_HISTORY_UNAVAILABLE },
    { label: 'Tarif sewa saat serah terima', value: snapshot.rate === null ? BAST_RATE_HISTORY_UNAVAILABLE : formatRate(snapshot.rate) },
  ];
}

/** Nama klien historis untuk PIHAK KEDUA — fail-closed, tanpa fallback live. */
export function bastClientName(handover: BastSnapshotFields): string {
  return readBastSnapshot(handover).clientName ?? BAST_HISTORY_UNAVAILABLE;
}

// ---------------------------------------------------------------------------
// Validasi tanggal (M4.1 §3 & §4)
// ---------------------------------------------------------------------------
export interface BastDateInput {
  /** Tanggal BAST (YYYY-MM-DD), sudah lolos validasi format. */
  date: string;
  /** Rentang kontrak (YYYY-MM-DD). */
  contractStart: string;
  contractEnd: string;
  type: BastType;
  /** Tanggal mobilisasi pasangan (dipakai saat membuat/mengubah demobilisasi). */
  mobilizationDate?: string | null;
  /** Tanggal demobilisasi pasangan (dipakai saat mengubah mobilisasi). */
  demobilizationDate?: string | null;
}

/**
 * Validasi tanggal BAST terhadap periode kontrak dan urutan
 * mobilisasi <= demobilisasi. Mengembalikan pesan error, atau `null` bila sah.
 * Perbandingan memakai format ISO (YYYY-MM-DD) yang urut secara leksikografis.
 */
export function validateBastDate(input: BastDateInput): string | null {
  const { date, contractStart, contractEnd, type } = input;
  const mobilizationDate = normalizeText(input.mobilizationDate);
  const demobilizationDate = normalizeText(input.demobilizationDate);

  if (contractStart && date < contractStart) {
    return 'Tanggal serah terima tidak boleh sebelum tanggal mulai kontrak.';
  }
  if (contractEnd && date > contractEnd) {
    return 'Tanggal serah terima tidak boleh setelah tanggal selesai kontrak.';
  }
  if (type === 'demobilization' && mobilizationDate && date < mobilizationDate) {
    return 'Tanggal demobilisasi tidak boleh sebelum tanggal mobilisasi.';
  }
  if (type === 'mobilization' && demobilizationDate && date > demobilizationDate) {
    return 'Tanggal mobilisasi tidak boleh setelah tanggal demobilisasi.';
  }
  return null;
}