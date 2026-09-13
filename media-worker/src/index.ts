// Rentalin Media API — Cloudflare Worker (docs/media-architecture.md §38).
//
// Endpoint MVP:
//   POST   /media/upload-url  → presigned PUT (doc §16)
//   POST   /media/complete    → verifikasi object + metadata (doc §17)
//   GET    /media/:id         → signed GET ber-TTL pendek (doc §21)
//   DELETE /media/:id         → hapus object R2 (doc §19)
//   GET    /health            → liveness
//
// Alur upload (doc §14/§15): Next.js (Server Action) memanggil upload-url
// dengan access token pengguna → Worker memvalidasi user/role/entity/
// category/ukuran/MIME/object-key → presigned PUT → browser PUT langsung ke
// R2 (binary TIDAK melewati Vercel) → Next.js memanggil complete → metadata
// (media_files) ditulis aplikasi ke Supabase PostgreSQL.

import { json, errorResponse, unknownError, MediaError } from './errors';
import { Env, authenticate, loadMediaRow, entityExists } from './supabase';
import {
  detectImageKind,
  isAllowedMime,
  isValidPair,
  expectedObjectKey,
  uuidRe,
} from './validate';
import { presignPut, presignGet, headObject, fetchPrefixBytes, deleteObject } from './r2';

type HttpEnv = Env;

const MAX_UPLOAD_FALLBACK = 2 * 1024 * 1024;

function corsHeaders(env: HttpEnv, request: Request): Record<string, string> {
  const origin = request.headers.get('origin') || '';
  const allowed = env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean);
  const out: Record<string, string> = {};
  if (origin && allowed.includes(origin)) {
    out['access-control-allow-origin'] = origin;
    out['vary'] = 'Origin';
  }
  return out;
}

function bearerToken(request: Request): string {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new MediaError('UNAUTHORIZED', 'Sesi tidak valid. Silakan masuk kembali.', 401);
  return token;
}

async function readBody<T>(request: Request): Promise<T> {
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    throw new MediaError('INVALID_REQUEST', 'Permintaan tidak valid. Muat ulang halaman.', 400);
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new MediaError('INVALID_REQUEST', 'Permintaan tidak valid. Muat ulang halaman.', 400);
  }
}

const num = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) ? v : null);

// ---------------------------------------------------------------------------
// POST /media/upload-url (doc §16)
// ---------------------------------------------------------------------------
type UploadUrlBody = {
  mediaId?: unknown;
  entityType?: unknown;
  entityId?: unknown;
  category?: unknown;
  mimeType?: unknown;
  size?: unknown;
  objectKey?: unknown;
};

async function handleUploadUrl(env: HttpEnv, request: Request, token: string): Promise<Response> {
  const body = await readBody<UploadUrlBody>(request);
  const { mediaId, entityType, entityId, category, mimeType, objectKey } = body;
  if (
    typeof mediaId !== 'string' || typeof entityType !== 'string' || typeof entityId !== 'string' ||
    typeof category !== 'string' || typeof mimeType !== 'string' || typeof objectKey !== 'string'
  ) {
    throw new MediaError('INVALID_REQUEST', 'Permintaan tidak valid. Muat ulang halaman.', 400);
  }
  const size = num(body.size);
  const maxBytes = Number(env.MAX_UPLOAD_BYTES) > 0 ? Number(env.MAX_UPLOAD_BYTES) : MAX_UPLOAD_FALLBACK;
  if (size === null || size < 1 || size > maxBytes) {
    throw new MediaError('FILE_TOO_LARGE', 'Ukuran foto melebihi batas.', 400);
  }
  if (!isAllowedMime(mimeType)) {
    throw new MediaError('INVALID_FILE_TYPE', 'Jenis berkas tidak didukung (hanya JPEG, PNG, atau WebP).', 400);
  }
  if (!isValidPair(entityType, category)) {
    throw new MediaError('INVALID_REQUEST', 'Kategori media tidak valid untuk jenis ini.', 400);
  }
  if (!uuidRe.test(mediaId) || !uuidRe.test(entityId)) {
    throw new MediaError('INVALID_REQUEST', 'Permintaan tidak valid. Muat ulang halaman.', 400);
  }
  // Object key di-enforce persis (doc §28) — tak boleh nama berkas user.
  if (objectKey !== expectedObjectKey(entityType, entityId, category, mediaId, mimeType)) {
    throw new MediaError('INVALID_REQUEST', 'Lokasi penyimpanan tidak valid. Muat ulang halaman.', 400);
  }
  // Baris metadata harus sudah dibuat aplikasi (status pending) dan cocok.
  const row = await loadMediaRow(token, mediaId);
  if (!row) throw new MediaError('MEDIA_NOT_FOUND', 'Media tidak ditemukan.', 404);
  if (row.status !== 'pending') throw new MediaError('MEDIA_NOT_PENDING', 'Media ini sudah diproses. Muat ulang halaman.', 409);
  if (
    row.entity_type !== entityType || row.entity_id !== entityId || row.category !== category ||
    row.mime_type !== mimeType || Number(row.size_bytes) !== size || row.object_key !== objectKey
  ) {
    throw new MediaError('INVALID_REQUEST', 'Detail media tidak cocok. Muat ulang halaman.', 400);
  }
  if (!(await entityExists(token, entityType, entityId))) {
    throw new MediaError('ENTITY_NOT_FOUND', 'Unit tidak ditemukan.', 404);
  }
  const ttl = Number(env.UPLOAD_TTL_SECONDS) > 0 ? Number(env.UPLOAD_TTL_SECONDS) : 900;
  const uploadUrl = await presignPut(env, objectKey, mimeType, size, ttl);
  return json(
    { uploadUrl, objectKey, mediaId, expiresAt: new Date(Date.now() + ttl * 1000).toISOString() },
    200,
    corsHeaders(env, request),
  );
}

// ---------------------------------------------------------------------------
// POST /media/complete (doc §17)
// ---------------------------------------------------------------------------
async function handleComplete(env: HttpEnv, request: Request, token: string): Promise<Response> {
  const body = await readBody<{ mediaId?: unknown }>(request);
  const mediaId = body.mediaId;
  if (typeof mediaId !== 'string' || !uuidRe.test(mediaId)) {
    throw new MediaError('INVALID_REQUEST', 'Permintaan tidak valid. Muat ulang halaman.', 400);
  }
  const row = await loadMediaRow(token, mediaId);
  if (!row) throw new MediaError('MEDIA_NOT_FOUND', 'Media tidak ditemukan.', 404);
  if (row.status !== 'pending') throw new MediaError('MEDIA_NOT_PENDING', 'Media ini sudah diproses. Muat ulang halaman.', 409);
  // 1) object exists + 2) size sesuai + content-type sesuai…
  const info = await headObject(env, row.object_key);
  if (!info) throw new MediaError('UPLOAD_FAILED', 'Unggahan belum diterima. Coba unggah ulang.', 422);
  if (info.contentLength !== Number(row.size_bytes)) {
    throw new MediaError('UPLOAD_FAILED', 'Ukuran berkas tidak cocok. Coba unggah ulang.', 422);
  }
  if (info.contentType && info.contentType !== row.mime_type) {
    throw new MediaError('INVALID_FILE_TYPE', 'Jenis berkas tidak didukung (hanya JPEG, PNG, atau WebP).', 422);
  }
  // 3) magic bytes aktual (doc §6) — jangan percaya header/extension.
  const prefix = await fetchPrefixBytes(env, row.object_key, 64);
  if (detectImageKind(prefix) === null) {
    throw new MediaError('INVALID_IMAGE_SIGNATURE', 'Berkas tidak valid. Unggah ulang foto.', 422);
  }
  return json({ ok: true }, 200, corsHeaders(env, request));
}

// ---------------------------------------------------------------------------
// GET /media/:id (doc §21) — private read via signed GET ber-TTL pendek.
// ---------------------------------------------------------------------------
async function handleRead(env: HttpEnv, mediaId: string, request: Request, token: string): Promise<Response> {
  if (!uuidRe.test(mediaId)) throw new MediaError('MEDIA_NOT_FOUND', 'Media tidak ditemukan.', 404);
  const row = await loadMediaRow(token, mediaId);
  if (!row || row.status !== 'active') {
    throw new MediaError('MEDIA_NOT_FOUND', 'Media tidak ditemukan.', 404);
  }
  const ttl = Number(env.READ_TTL_SECONDS) > 0 ? Number(env.READ_TTL_SECONDS) : 300;
  const url = await presignGet(env, row.object_key, ttl);
  return json({ url, expiresAt: new Date(Date.now() + ttl * 1000).toISOString() }, 200, corsHeaders(env, request));
}

// ---------------------------------------------------------------------------
// DELETE /media/:id (doc §19) — hapus object; metadata ditandai aplikasi.
// ---------------------------------------------------------------------------
async function handleDelete(env: HttpEnv, mediaId: string, request: Request, token: string): Promise<Response> {
  if (!uuidRe.test(mediaId)) throw new MediaError('MEDIA_NOT_FOUND', 'Media tidak ditemukan.', 404);
  const row = await loadMediaRow(token, mediaId);
  if (!row || row.status === 'deleted') {
    throw new MediaError('MEDIA_NOT_FOUND', 'Media tidak ditemukan.', 404);
  }
  await deleteObject(env, row.object_key);
  return json({ ok: true }, 200, corsHeaders(env, request));
}

// ---------------------------------------------------------------------------
export default {
  async fetch(request: Request, env: HttpEnv): Promise<Response> {
    // Muat env sekali per request (juga untuk dataApi di supabase.ts).
    Object.assign(Env, env);
    const url = new URL(request.url);
    const cors = corsHeaders(env, request);
    try {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            ...cors,
            'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
            'access-control-allow-headers': 'authorization,content-type',
            'access-control-max-age': '86400',
          },
        });
      }
      if (url.pathname === '/health' && request.method === 'GET') {
        return json({ ok: true, env: env.ENVIRONMENT }, 200, cors);
      }
      const mediaPath = url.pathname.startsWith('/media/') ? url.pathname.slice('/media/'.length) : null;
      if (mediaPath !== 'upload-url' && mediaPath !== 'complete' && !uuidRe.test(mediaPath ?? '')) {
        return json({ error: { code: 'INVALID_REQUEST', message: 'Endpoint tidak dikenal.' } }, 404, cors);
      }
      const segment = mediaPath!.toLowerCase();

      const token = bearerToken(request);
      if (segment === 'upload-url') {
        await authenticate(token, 'upload');
        return await handleUploadUrl(env, request, token);
      }
      if (segment === 'complete') {
        await authenticate(token, 'upload');
        return await handleComplete(env, request, token);
      }
      if (request.method === 'GET') {
        await authenticate(token, 'read');
        return await handleRead(env, segment, request, token);
      }
      if (request.method === 'DELETE') {
        await authenticate(token, 'delete');
        return await handleDelete(env, segment, request, token);
      }
      return json({ error: { code: 'INVALID_REQUEST', message: 'Metode tidak didukung.' } }, 405, cors);
    } catch (e) {
      if (e instanceof MediaError) return errorResponse(e, cors);
      const code = (e as { code?: string })?.code;
      if (code === 'UNAUTHORIZED') return errorResponse(new MediaError('UNAUTHORIZED', 'Sesi tidak valid. Silakan masuk kembali.', 401), cors);
      if (code === 'FORBIDDEN') return errorResponse(new MediaError('FORBIDDEN', 'Anda tidak memiliki izin untuk media ini.', 403), cors);
      console.error('[media-api]', e);
      return unknownError(cors);
    }
  },
};
