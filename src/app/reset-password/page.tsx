'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { ArrowLeft, LoaderCircle, CircleCheck, TriangleAlert } from 'lucide-react';
import { BrandMark } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { createBrowser } from '@/lib/supabase-browser';

export default function ResetPasswordPage() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  return (
    <main className="verify-page">
      <div className="brand"><BrandMark /><div className="brand-copy"><div>HEAVY<span>OPS</span><span className="brand-dot">.</span></div><small>Pemulihan Akses</small></div></div>
      <section className="panel verify-card" style={{ textAlign: 'left' }}>
        <h1>Buat kata sandi baru</h1>
        <p>{done ? 'Kata sandi berhasil diperbarui. Silakan masuk dengan kata sandi baru Anda.' : 'Pilih kata sandi baru minimal 6 karakter untuk akun Anda.'}</p>
        {done ? (
          <div style={{ marginTop: 24 }}><Button asChild><Link href="/login">Masuk ke Ruang Kerja</Link></Button></div>
        ) : (
          <form style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 18 }} onSubmit={e => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            const password = String(form.get('password') || '');
            const confirm = String(form.get('confirm') || '');
            if (password.length < 6) { setError('Kata sandi minimal 6 karakter.'); return; }
            if (password !== confirm) { setError('Konfirmasi kata sandi tidak sama.'); return; }
            setError('');
            startTransition(async () => {
              try {
                const { error: err } = await createBrowser().auth.updateUser({ password });
                if (err) setError('Tautan sudah kedaluwarsa atau tidak valid. Minta tautan baru.');
                else setDone(true);
              } catch { setError('Koneksi gagal. Silakan coba kembali.'); }
            });
          }}>
            <label className="form-field"><span>Kata Sandi Baru</span><input type="password" name="password" required minLength={6} autoComplete="new-password" placeholder="Minimal 6 karakter" /></label>
            <label className="form-field"><span>Konfirmasi Kata Sandi</span><input type="password" name="confirm" required minLength={6} autoComplete="new-password" placeholder="Ulangi kata sandi baru" /></label>
            {error && <div className="login-error" role="alert"><TriangleAlert size={17} />{error}</div>}
            <Button disabled={pending}>{pending && <LoaderCircle size={17} className="spin" />}{pending ? 'Menyimpan...' : 'Simpan Kata Sandi'}</Button>
          </form>
        )}
        <div style={{ marginTop: 22, textAlign: 'center' }}><Link className="text-link" href="/login"><ArrowLeft size={14} />Kembali ke halaman masuk</Link></div>
      </section>
    </main>
  );
}
