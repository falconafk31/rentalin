import { requireUser, createAuthClient, isConfigured } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { validateImageUpload, MAX_IMAGE_BYTES } from '@/lib/images';
import { db } from '@/db';
import * as s from '@/db/schema';
import { sql, eq } from 'drizzle-orm';
import { isUserAuthorizedForBastPhoto } from '@/lib/fleet-history-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET: Mengambil signed URL sementara untuk pratinjau thumbnail foto BAST privat.
// Query: ?path=handovers/...
// Otorisasi Level Entitas Komprehensif:
// 1. Otentikasi pengguna
// 2. Validasi format path
// 3. Resolusi entitas BAST & kontrak terkait di database
// 4. Verifikasi bahwa pengguna berhak mengakses entitas dokumen BAST tersebut
// 5. Pembuatan signed URL privat bertenggat waktu
export async function GET(request: Request) {
  let user: { id: string; role: string };
  try {
    user = await requireUser(['admin', 'operations', 'operator', 'finance']);
  } catch (error) {
    if (((error as Error).message || '').includes('NEXT_REDIRECT')) throw error;
    return Response.json({ message: 'Anda tidak memiliki izin.' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const path = searchParams.get('path');
  if (!path || !path.startsWith('handovers/')) {
    return Response.json({ message: 'Path foto tidak valid.' }, { status: 400 });
  }

  // 1. Resolve owning handover entity & contract
  const [handover] = await db
    .select({
      id: s.handovers.id,
      contractId: s.handovers.contractId,
      photoUrls: s.handovers.photoUrls,
    })
    .from(s.handovers)
    .where(sql`${path} = ANY(${s.handovers.photoUrls})`)
    .limit(1);

  if (!handover) {
    return Response.json({ message: 'Foto tidak terdaftar pada dokumen BAST mana pun.' }, { status: 404 });
  }

  // 2. Ambil profil operator yang ditugaskan pada kontrak untuk otorisasi level operator
  let assignedOperatorProfileIds: string[] = [];
  if (user.role === 'operator') {
    const assigned = await db
      .select({ profileId: s.operators.profileId })
      .from(s.contractOperators)
      .innerJoin(s.operators, eq(s.operators.id, s.contractOperators.operatorId))
      .where(eq(s.contractOperators.contractId, handover.contractId));
    assignedOperatorProfileIds = assigned
      .map((a) => a.profileId)
      .filter((p): p is string => Boolean(p));
  }

  // 3. Verifikasi otorisasi entitas
  const isAuthorized = isUserAuthorizedForBastPhoto(
    path,
    user,
    {
      id: handover.id,
      contractId: handover.contractId,
      photoUrls: handover.photoUrls,
      assignedOperatorProfileIds,
    }
  );

  if (!isAuthorized) {
    return Response.json({ message: 'Anda tidak memiliki izin mengakses foto BAST ini.' }, { status: 403 });
  }

  if (!isConfigured()) {
    return Response.json({ message: 'Storage belum dikonfigurasi (mode pratinjau).' }, { status: 503 });
  }

  try {
    const supabase = await createAuthClient();
    const { data, error } = await supabase.storage.from('bast-photos').createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) {
      return Response.json({ message: 'Foto tidak ditemukan pada penyimpanan.' }, { status: 404 });
    }
    // Redirect langsung ke signed URL yang aman
    return Response.redirect(data.signedUrl, 307);
  } catch {
    return Response.json({ message: 'Gagal memuat foto.' }, { status: 500 });
  }
}

// Unggah satu foto lampiran BAST ke bucket privat `bast-photos`.
// Body: multipart FormData { file }. Mengembalikan { path } untuk disimpan
// ke handovers.photo_urls saat BAST dibuat. Maks 5 MB, hanya gambar.
export async function POST(request: Request) {
  let user: { id: string; fullName: string };
  try {
    user = await requireUser(['admin', 'operations', 'operator']);
  } catch (error) {
    if (((error as Error).message || '').includes('NEXT_REDIRECT')) throw error;
    return Response.json({ message: 'Anda tidak memiliki izin.' }, { status: 403 });
  }
  if (!isConfigured()) {
    return Response.json({ message: 'Storage belum dikonfigurasi (mode pratinjau).' }, { status: 503 });
  }
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return Response.json({ message: 'Berkas tidak ditemukan.' }, { status: 400 });
  if (file.size > MAX_IMAGE_BYTES) return Response.json({ message: 'Ukuran foto maksimal 5 MB.' }, { status: 400 });
  // Klaim MIME client tak dipercaya: validasi magic bytes aktual (Finding 2).
  const bytes = new Uint8Array(await file.arrayBuffer());
  const valid = validateImageUpload(bytes);
  if ('error' in valid) return Response.json({ message: valid.error }, { status: 400 });
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60);
  const path = `handovers/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safe}`;
  const supabase = await createAuthClient();
  const { error } = await supabase.storage.from('bast-photos').upload(path, bytes, { contentType: valid.contentType, upsert: false });
  if (error) return Response.json({ message: 'Unggahan gagal. Coba lagi.' }, { status: 500 });
  await logAudit({ actorId: user.id, actorName: user.fullName, action: 'upload', entity: 'bast', entityId: path, summary: `Mengunggah foto BAST: ${safe} (${Math.max(1, Math.round(file.size / 1024))} KB)` });
  return Response.json({ path });
}
