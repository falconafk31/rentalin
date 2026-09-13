// Akses Supabase dari Worker — autentikasi + otorisasi.
//
// Prinsip (doc §4/§7): Worker TIDAK memegang kredensial DB dan TIDAK menulis
// ke PostgreSQL. Auth token pengguna divalidasi via GoTrue (`/auth/v1/user`),
// role + data entity/read media melalui Supabase Data API (RLS-terlindungi,
// policy-nya di migration 0003/0004/0012/0023). SUPABASE_PUBLISHABLE_KEY
// adalah kunci publik — boleh jadi var, bukan secret.

export type WorkerUser = { id: string; role: string };

export type MediaRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  category: string;
  object_key: string;
  mime_type: string;
  size_bytes: number;
  status: string;
};

export type Env = {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  BUCKET_NAME: string;
  ENVIRONMENT: string;
  ALLOWED_ORIGINS: string;
  UPLOAD_TTL_SECONDS: string;
  READ_TTL_SECONDS: string;
  MAX_UPLOAD_BYTES: string;
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
};

const APP_ROLES = ['admin', 'operations', 'operator', 'finance'];
const UPLOAD_ROLES = ['admin', 'operations', 'operator'];
const DELETE_ROLES = ['admin', 'operations'];

// Matriks otorisasi (doc §22) — basis; policy final mengikuti model Rentalin.
export const ROLES: Record<'read' | 'upload' | 'delete', string[]> = {
  read: APP_ROLES,
  upload: UPLOAD_ROLES,
  delete: DELETE_ROLES,
};

type AuthedError = Error & { code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'STORAGE_UNAVAILABLE' };

const authError = (code: AuthedError['code'], message: string): AuthedError =>
  Object.assign(new Error(message), { code }) as AuthedError;

async function dataApi(url: string, token: string, timeoutMs = 6000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { apikey: Env.SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
    });
  } catch {
    throw authError('STORAGE_UNAVAILABLE', 'Layanan Supabase tidak dapat dihubungi.');
  } finally {
    clearTimeout(timer);
  }
}

// Referensi env dibaca sekali di handler (bukan closure per pemanggil) —
// tetap tipe-aman dan mudah diuji.
export let Env: Env = {
  SUPABASE_URL: '',
  SUPABASE_PUBLISHABLE_KEY: '',
  BUCKET_NAME: '',
  ENVIRONMENT: '',
  ALLOWED_ORIGINS: '',
  UPLOAD_TTL_SECONDS: '',
  READ_TTL_SECONDS: '',
  MAX_UPLOAD_BYTES: '',
  R2_ACCOUNT_ID: '',
  R2_ACCESS_KEY_ID: '',
  R2_SECRET_ACCESS_KEY: '',
};

/** Validasi access token Supabase (GoTrue) — 200 = sesi valid. */
export async function verifyUser(token: string): Promise<string> {
  const res = await dataApi(`${Env.SUPABASE_URL}/auth/v1/user`, token);
  if (!res.ok) throw authError('UNAUTHORIZED', 'Sesi tidak valid. Silakan masuk kembali.');
  const body = (await res.json()) as { id?: string };
  if (!body.id) throw authError('UNAUTHORIZED', 'Sesi tidak valid. Silakan masuk kembali.');
  return body.id;
}

/** Role dari tabel `profiles` via Data API (RLS: user membaca profilnya sendiri). */
export async function fetchRole(token: string, userId: string): Promise<string> {
  const url = `${Env.SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=role`;
  const res = await dataApi(url, token);
  if (!res.ok) throw authError('UNAUTHORIZED', 'Profil pengguna tidak valid.');
  const rows = (await res.json()) as { role?: string }[];
  const role = rows[0]?.role;
  if (!role || !APP_ROLES.includes(role)) throw authError('UNAUTHORIZED', 'Profil pengguna tidak valid.');
  return role;
}

/** Token → pengguna + role terotorisasi untuk operasi `needed` (doc §22). */
export async function authenticate(token: string, needed: 'read' | 'upload' | 'delete'): Promise<WorkerUser> {
  const id = await verifyUser(token);
  const role = await fetchRole(token, id);
  if (!ROLES[needed].includes(role)) throw authError('FORBIDDEN', 'Anda tidak memiliki izin untuk media ini.');
  return { id, role };
}

/** Media row via Data API (SELECT-only; tulis dilakukan aplikasi Next.js). */
export async function loadMediaRow(token: string, mediaId: string): Promise<MediaRow | null> {
  const url = `${Env.SUPABASE_URL}/rest/v1/media_files?id=eq.${encodeURIComponent(mediaId)}&select=*`;
  const res = await dataApi(url, token);
  if (res.status === 404) return null;
  if (!res.ok) throw authError('STORAGE_UNAVAILABLE', 'Metadata media tidak dapat dibaca.');
  const rows = (await res.json()) as MediaRow[];
  return rows[0] ?? null;
}

/** Entity bisnis harus ada sebelum media dilewatkan (fleet.id / handovers.id). */
export async function entityExists(token: string, entityType: string, entityId: string): Promise<boolean> {
  const table = entityType === 'fleet' ? 'fleet' : entityType === 'bast' ? 'handovers' : null;
  if (!table) return false;
  const url = `${Env.SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(entityId)}&select=id&limit=1`;
  const res = await dataApi(url, token);
  if (!res.ok) throw authError('STORAGE_UNAVAILABLE', 'Data unit tidak dapat dibaca.');
  const rows = (await res.json()) as { id: string }[];
  return rows.length > 0;
}
