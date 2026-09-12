// Validasi media — pure, tanpa dependensi (doc §6/§28).
// Client-side validation BUKAN security boundary: klaim MIME/ukuran dari
// client divalidasi ulang di sini DAN pada isi biner aktual saat completion.

export type ImageKind = 'jpeg' | 'png' | 'webp';

const KIND_BY_MIME: Record<string, ImageKind> = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const MIME_BY_KIND: Record<ImageKind, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

// Deteksi jenis gambar dari signature biner (magic bytes) — identik logikanya
// dengan src/lib/images.ts di aplikasi (sumber kebenaran bersama).
export function detectImageKind(bytes: Uint8Array): ImageKind | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return 'png';
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return 'webp';
  return null;
}

export const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isAllowedMime(mime: string): mime is string {
  return Object.prototype.hasOwnProperty.call(KIND_BY_MIME, mime);
}

export function mimeForKind(kind: ImageKind): string {
  return MIME_BY_KIND[kind];
}

export function kindForMime(mime: string): ImageKind {
  return KIND_BY_MIME[mime];
}

export type EntityCategoryPair = { entityTypes: string[]; categoriesByEntity: Record<string, string[]> };

// Pair entity↔category (doc §9/§10) — divalidasi di sini DAN di constraint
// database (media_files_category_valid).
export const ENTITY_CATEGORIES: EntityCategoryPair = {
  entityTypes: ['fleet', 'bast'],
  categoriesByEntity: {
    fleet: ['cover', 'gallery'],
    bast: ['engine', 'hydraulics', 'tracks', 'general'],
  },
};

export function isValidPair(entityType: string, category: string): boolean {
  const cats = ENTITY_CATEGORIES.categoriesByEntity[entityType];
  return !!cats && cats.includes(category);
}

/**
 * Object key wajib persis `{entityType}/{entityId}/{category}/{mediaId}{ext}`
 * (doc §28 — filename asli TIDAK boleh menjadi key). Ekstensi mengikuti
 * MIME aktual, bukan klaim client.
 */
export function expectedObjectKey(
  entityType: string,
  entityId: string,
  category: string,
  mediaId: string,
  mimeType: string,
): string {
  return `${entityType}/${entityId}/${category}/${mediaId}${EXT_BY_MIME[mimeType] ?? ''}`;
}
