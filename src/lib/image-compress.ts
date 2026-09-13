'use client';
// ---------------------------------------------------------------------------
// Kompresi gambar sisi klien (docs/media-architecture.md §5/§29/§30):
// resize ≤ 1600px → konversi WebP (quality ≈ 80, turunkan bila perlu) →
// target ≤ 2 MB. Tanpa dependensi baru: canvas native browser.
//
// Client-side validation BUKAN security boundary — Worker memvalidasi ulang
// (ukuran, MIME, magic bytes) di upload-url & completion (doc §6).
// ---------------------------------------------------------------------------

export const MEDIA_MAX_DIMENSION = 1600;
export const MEDIA_INPUT_MAX_BYTES = 10 * 1024 * 1024;
export const MEDIA_UPLOAD_MAX_BYTES = 2 * 1024 * 1024;

export type CompressedImage = {
  blob: Blob;
  mimeType: 'image/webp' | 'image/jpeg';
  width: number;
  height: number;
  size: number;
};

export class MediaClientError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'MediaClientError';
    this.code = code;
  }
}

const QUALITY_STEPS = [0.8, 0.72, 0.64, 0.55, 0.45];

const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

export async function compressImage(file: File): Promise<CompressedImage> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
    throw new MediaClientError('INVALID_FILE_TYPE', 'Hanya berkas gambar JPEG, PNG, atau WebP yang didukung.');
  }
  if (file.size > MEDIA_INPUT_MAX_BYTES) {
    throw new MediaClientError('FILE_TOO_LARGE', 'Ukuran foto maksimal 10 MB.');
  }

  const bitmap = await createImageBitmap(file).catch(() => {
    throw new MediaClientError('INVALID_FILE_TYPE', 'Gambar tidak dapat dibaca. Pilih berkas lain.');
  });
  try {
    const scale = Math.min(1, MEDIA_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new MediaClientError('UPLOAD_FAILED', 'Browser tidak mendukung pemrosesan gambar.');
    ctx.drawImage(bitmap, 0, 0, width, height);

    // WebP utama; fallback JPEG bila canvas browser tidak bisa meng-encode
    // WebP (toBlob → null). Uji setiap langkah quality hingga ≤ 2 MB.
    let fallback: Blob | null = null;
    for (const quality of QUALITY_STEPS) {
      const webp = await canvasToBlob(canvas, 'image/webp', quality);
      if (webp) {
        if (webp.size <= MEDIA_UPLOAD_MAX_BYTES) return { blob: webp, mimeType: 'image/webp', width, height, size: webp.size };
        if (!fallback || webp.size < fallback.size) fallback = webp;
      }
      const jpeg = await canvasToBlob(canvas, 'image/jpeg', quality);
      if (jpeg) {
        if (jpeg.size <= MEDIA_UPLOAD_MAX_BYTES) return { blob: jpeg, mimeType: 'image/jpeg', width, height, size: jpeg.size };
        if (!fallback || jpeg.size < fallback.size) fallback = jpeg;
      }
    }
    if (fallback) {
      throw new MediaClientError('FILE_TOO_LARGE', 'Foto tetap melebihi 2 MB setelah dikompres. Pilih foto lain.');
    }
    throw new MediaClientError('INVALID_FILE_TYPE', 'Gambar tidak dapat diproses oleh browser.');
  } finally {
    bitmap.close();
  }
}

// ---------------------------------------------------------------------------
// PUT langsung ke presigned URL R2 dengan progress (doc §14 langkah 7 & §32).
// XMLHttpRequest dipakai karena fetch() browser tak memberi progress upload.
// ---------------------------------------------------------------------------
export function putToPresignedUrl(
  uploadUrl: string,
  blob: Blob,
  contentType: string,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    // Content-Type & Content-Length ikut ditandatangani Worker — kirim persis.
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) onProgress(Math.round((ev.loaded / ev.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error('Unggahan ke penyimpanan gagal. Periksa jaringan lalu coba lagi.'));
    };
    xhr.onerror = () => reject(new Error('Koneksi terputus saat unggah. Periksa jaringan lalu coba lagi.'));
    xhr.ontimeout = () => reject(new Error('Unggahan melebihi batas waktu. Coba lagi.'));
    xhr.timeout = 120_000;
    xhr.send(blob);
  });
}
