import { NextResponse } from 'next/server';
import { createAuthClient } from '@/lib/auth';

// Menukar `code` dari tautan email Supabase (reset sandi / undangan) menjadi
// sesi, lalu meneruskan ke halaman tujuan yang aman (path lokal saja).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') || '/dashboard';
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
  if (code) {
    try {
      const supabase = await createAuthClient();
      await supabase.auth.exchangeCodeForSession(code);
    } catch {
      return NextResponse.redirect(new URL('/login', url.origin));
    }
  }
  return NextResponse.redirect(new URL(safeNext, url.origin));
}
