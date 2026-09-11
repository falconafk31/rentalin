import { requireUser, createAuthClient, isConfigured } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
  if (!file.type.startsWith('image/')) return Response.json({ message: 'Hanya berkas gambar yang diizinkan.' }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return Response.json({ message: 'Ukuran foto maksimal 5 MB.' }, { status: 400 });
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60);
  const path = `handovers/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safe}`;
  const supabase = await createAuthClient();
  const { error } = await supabase.storage.from('bast-photos').upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false });
  if (error) return Response.json({ message: 'Unggahan gagal. Coba lagi.' }, { status: 500 });
  await logAudit({ actorId: user.id, actorName: user.fullName, action: 'upload', entity: 'bast', entityId: path, summary: `Mengunggah foto BAST: ${safe} (${Math.max(1, Math.round(file.size / 1024))} KB)` });
  return Response.json({ path });
}
