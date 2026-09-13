import 'server-only';
import { createAuthClient, isConfigured, isPreview } from '@/lib/auth';

// ---------------------------------------------------------------------------
// Klien Media API (Cloudflare Worker) — server-only (docs/media-architecture.md).
// Server Action memanggil Worker dengan access token pengguna (Worker
// memvalidasi ulang sesi + role). Kredensial R2 TIDAK PERNAH lewat sini —
// hanya URL publik Worker (MEDIA_API_URL) yang dibutuhkan di Next.js.
// ---------------------------------------------------------------------------

export const isMediaConfigured = () => !isPreview() && isConfigured() && Boolean(process.env.MEDIA_API_URL);

export class MediaApiError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'MediaApiError';
    this.code = code;
  }
}

// Pesan pengguna (Bahasa Indonesia, doc §34); kode teknis tetap di `code`.
const FALLBACK_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: 'Sesi tidak valid. Silakan masuk kembali.',
  FORBIDDEN: 'Anda tidak memiliki izin untuk media ini.',
  MEDIA_NOT_FOUND: 'Foto tidak ditemukan.',
  ENTITY_NOT_FOUND: 'Unit tidak ditemukan.',
  INVALID_REQUEST: 'Permintaan tidak valid. Muat ulang halaman.',
  INVALID_FILE_TYPE: 'Jenis berkas tidak didukung (hanya JPEG, PNG, atau WebP).',
  FILE_TOO_LARGE: 'Ukuran foto melebihi batas.',
  INVALID_IMAGE_SIGNATURE: 'Berkas tidak valid. Unggah ulang foto.',
  MEDIA_NOT_PENDING: 'Media ini sudah diproses. Muat ulang halaman.',
  UPLOAD_FAILED: 'Unggahan ke penyimpanan gagal. Coba lagi.',
  STORAGE_UNAVAILABLE: 'Penyimpanan media sedang tidak tersedia. Coba lagi beberapa saat.',
};

const localize = (code: string, msg?: string) =>
  msg || FALLBACK_MESSAGES[code] || 'Terjadi kesalahan pada layanan media. Coba lagi.';

const mediaBase = () => (process.env.MEDIA_API_URL ?? '').replace(/\/+$/, '');

async function accessToken(): Promise<string> {
  const auth = await createAuthClient();
  const { data: { session } } = await auth.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new MediaApiError('UNAUTHORIZED', 'Sesi tidak valid. Silakan masuk kembali.');
  return token;
}

async function call<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const base = mediaBase();
  if (!base) throw new MediaApiError('STORAGE_UNAVAILABLE', 'Fitur foto belum tersedia (layanan media belum dikonfigurasi).');
  const token = await accessToken();
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method,
      cache: 'no-store',
      // Fail-soft: Worker lambat/mati tidak boleh menggantung rendering
      // halaman (doc §46) — caller menelan error per item bila perlu.
      signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new MediaApiError('STORAGE_UNAVAILABLE', 'Layanan media tidak dapat dihubungi. Coba lagi.');
  }
  if (res.ok) return (await res.json()) as T;
  let code = res.status === 401 ? 'UNAUTHORIZED' : res.status === 403 ? 'FORBIDDEN' : 'UPLOAD_FAILED';
  let msg: string | undefined;
  try {
    const b = (await res.json()) as { error?: { code?: string; message?: string } };
    if (b?.error?.code) {
      code = b.error.code;
      msg = b.error.message;
    }
  } catch {
    /* respons non-JSON — pakai kode status */
  }
  throw new MediaApiError(code, localize(code, msg));
}

export type MediaUploadTicket = { uploadUrl: string; objectKey: string; mediaId: string; expiresAt: string };

export type MediaUploadRequest = {
  mediaId: string;
  entityType: 'fleet' | 'bast';
  entityId: string;
  category: string;
  mimeType: string;
  size: number;
  objectKey: string;
};

export function requestMediaUploadUrl(req: MediaUploadRequest): Promise<MediaUploadTicket> {
  return call<MediaUploadTicket>('POST', '/media/upload-url', req);
}

export function completeMediaUpload(mediaId: string): Promise<{ ok: boolean }> {
  return call<{ ok: boolean }>('POST', '/media/complete', { mediaId });
}

export function getMediaSignedUrl(mediaId: string): Promise<{ url: string; expiresAt: string }> {
  return call<{ url: string; expiresAt: string }>('GET', `/media/${encodeURIComponent(mediaId)}`);
}

export function deleteMediaObject(mediaId: string): Promise<{ ok: boolean }> {
  return call<{ ok: boolean }>('DELETE', `/media/${encodeURIComponent(mediaId)}`);
}
