// Kesalahan Media API — satu bentuk respons untuk semua endpoint (doc §34).
// `code` = kode teknis untuk log server / penanganan client; `message` =
// Bahasa Indonesia untuk pengguna (detail teknis tetap di log).

export type MediaErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'MEDIA_NOT_FOUND'
  | 'ENTITY_NOT_FOUND'
  | 'INVALID_REQUEST'
  | 'INVALID_FILE_TYPE'
  | 'FILE_TOO_LARGE'
  | 'INVALID_IMAGE_SIGNATURE'
  | 'MEDIA_NOT_PENDING'
  | 'UPLOAD_FAILED'
  | 'STORAGE_UNAVAILABLE';

export class MediaError extends Error {
  readonly code: MediaErrorCode;
  readonly status: number;
  constructor(code: MediaErrorCode, message: string, status = 400) {
    super(message);
    this.name = 'MediaError';
    this.code = code;
    this.status = status;
  }
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}

export function errorResponse(err: MediaError, corsHeaders: Record<string, string>): Response {
  return json({ error: { code: err.code, message: err.message } }, err.status, corsHeaders);
}

export function unknownError(corsHeaders: Record<string, string>): Response {
  return json({ error: { code: 'STORAGE_UNAVAILABLE', message: 'Layanan media sedang tidak tersedia. Coba lagi beberapa saat.' } }, 503, corsHeaders);
}
