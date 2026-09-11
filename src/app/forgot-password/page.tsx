'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { ArrowLeft, LoaderCircle, MailCheck, TriangleAlert } from 'lucide-react';
import { BrandMark } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { requestPasswordReset } from '@/app/actions';

export default function ForgotPasswordPage() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  return (
    <main className="verify-page">
      <div className="brand"><BrandMark /><div className="brand-copy"><div>HEAVY<span>OPS</span><span className="brand-dot">.</span></div><small>Pemulihan Akses</small></div></div>
      <section className="panel verify-card" style={{ textAlign: 'left' }}>
        <h1>Lupa kata sandi?</h1>
        <p>Masukkan surel akun Anda. Kami akan mengirim tautan untuk membuat kata sandi baru.</p>
        <form style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 18 }} onSubmit={e => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          setResult(null);
          startTransition(async () => setResult(await requestPasswordReset(form)));
        }}>
          <label className="form-field"><span>Alamat Surel</span><input type="email" name="email" required placeholder="nama@perusahaan.co.id" autoComplete="email" /></label>
          {result && <div className={result.success ? 'info-callout' : 'login-error'} role={result.success ? 'status' : 'alert'}>{result.success ? <MailCheck size={17} /> : <TriangleAlert size={17} />}<p>{result.message}</p></div>}
          <Button disabled={pending}>{pending && <LoaderCircle size={17} className="spin" />}{pending ? 'Mengirim...' : 'Kirim Tautan Reset'}</Button>
        </form>
        <div style={{ marginTop: 22, textAlign: 'center' }}><Link className="text-link" href="/login"><ArrowLeft size={14} />Kembali ke halaman masuk</Link></div>
      </section>
    </main>
  );
}
