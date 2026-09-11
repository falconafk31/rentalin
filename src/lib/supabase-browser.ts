import { createBrowserClient } from '@supabase/ssr';

// Klien Supabase sisi browser — hanya dipakai halaman reset sandi ( sesi dari
// tautan email perlu ditukar di browser setelah /auth/callback ).
export function createBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
  );
}
