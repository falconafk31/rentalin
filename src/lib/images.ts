// Validasi gambar server-side (TASK-1B Finding 2). Klaim client —
// file.type, file.name, ekstensi — bisa dipalsukan, sehingga fungsi ini
// menginspeksi MAGIC BYTES aktual. Hanya raster aman: JPEG, PNG, WebP.
// GIF/SVG/HTML ditolak (tak dibutuhkan aplikasi). Pure, tanpa dependensi.

export type ImageKind = 'jpeg' | 'png' | 'webp';
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const CONTENT_TYPE: Record<ImageKind, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/** Deteksi jenis gambar dari signature biner; null bila tak dikenal. */
export function detectImageKind(bytes: Uint8Array): ImageKind | null {
  if (bytes.length < 12) return null;
  // JPEG: FF D8 FF (SOI + awal marker pertama)
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A (8-byte signature penuh)
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return 'png';
  // WebP: "RIFF" + 4-byte ukuran + "WEBP"
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return 'webp';
  return null;
}

export type ImageValidation = { kind: ImageKind; contentType: string } | { error: string };

/**
 * Validasi unggahan: ukuran + isi biner. Content-Type hasil deteksi
 * (bukan klaim client) yang wajib dipakai saat menyimpan ke Storage.
 */
export function validateImageUpload(bytes: Uint8Array): ImageValidation {
  if (bytes.length > MAX_IMAGE_BYTES) return { error: 'Ukuran foto maksimal 5 MB.' };
  const kind = detectImageKind(bytes);
  if (!kind) return { error: 'Berkas bukan gambar JPEG, PNG, atau WebP yang valid.' };
  return { kind, contentType: CONTENT_TYPE[kind] };
}
