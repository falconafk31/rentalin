import 'server-only';
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
      try { items.forEach(({name,value,options}) => store.set(name,value,options)); }
      catch { /* Refreshed by proxy. */ }
    },
  } },
 );
}
export async function requireUser(roles?: string[]) {
 if (isPreview()) return {id:demoId, fullName:'Aditya Pratama',role:'admin',email:'aditya@heavyops.id',preview:true};
 if (!isConfigured()) redirect('/login');
 const auth = await createAuthClient();
 const {data:{user}} = await auth.auth.getUser();
 if (!user) redirect('/login');
 const [profile] = await db.select().from(profiles).where(eq(profiles.id,user.id));
 if (!profile || !['admin','operations','operator','finance'].includes(profile.role)) throw new Error('Profil pengguna belum terdaftar. Hubungi administrator.');
 if (roles && !roles.includes(profile.role)) throw new Error('Anda tidak memiliki izin untuk melakukan tindakan ini.');
 return {...profile,email:user.email || '',preview:false};
}
