import 'server-only';
import { cache } from 'react';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { profiles } from '@/db/schema';
import { eq } from 'drizzle-orm';
export const demoId = '00000000-0000-4000-a000-000000000001';
export const isConfigured = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY));
export const isPreview = () => !isConfigured() && !process.env.VERCEL;
export async function createAuthClient() {
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
    { cookies: {
      getAll: () => store.getAll(),
      setAll: (items) => {
        try { items.forEach(({ name, value, options }) => store.set(name, value, options)); }
        catch { /* Refreshed by proxy. */ }
      },
    } },
  );
}

export type SessionUser = { id: string; fullName: string; role: string; email: string; preview: boolean };

// getCurrentUser dibungkus React cache(): sebelumnya layout + page masing-masing
// memanggil requireUser() → verifikasi Supabase + SELECT profiles 2× per request.
// Dengan cache, identik dalam satu request → query hanya 1× (dedup per request).
export const getCurrentUser = cache(async (): Promise<SessionUser> => {
  if (isPreview()) return { id: demoId, fullName: 'Aditya Pratama', role: 'admin', email: 'aditya@heavyops.id', preview: true };
  if (!isConfigured()) redirect('/login');
  const auth = await createAuthClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) redirect('/login');
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!profile || !['admin', 'operations', 'operator', 'finance'].includes(profile.role)) throw new Error('Profil pengguna belum terdaftar. Hubungi administrator.');
  return { id: profile.id, fullName: profile.fullName, role: profile.role, email: user.email || '', preview: false };
});

export async function requireUser(roles?: string[]) {
  const user = await getCurrentUser();
  if (roles && !roles.includes(user.role)) throw new Error('Anda tidak memiliki izin untuk melakukan tindakan ini.');
  return user;
}
