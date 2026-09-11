import { searchGlobal } from '@/lib/data';
import { requireUser } from '@/lib/auth';
// O-A: pencarian global kini async — client (⌘K) memanggil endpoint ini dengan
// debounce, server menjawab maksimal 7 hasil lewat ILIKE per tabel. Corpus
// penuh tidak lagi dikirim ke browser lewat payload layout.
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireUser();
  } catch (error) {
    if (((error as Error).message || '').includes('NEXT_REDIRECT')) throw error;
    return Response.json({ message: 'Sesi berakhir. Silakan masuk kembali.' }, { status: 401 });
  }
  const q = new URL(request.url).searchParams.get('q') ?? '';
  const results = await searchGlobal(q);
  return Response.json({ results }, { headers: { 'Cache-Control': 'no-store' } });
}
