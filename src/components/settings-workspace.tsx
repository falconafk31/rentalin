'use client';
import { useCallback, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Building2, ShieldCheck, TriangleAlert, Info, Save, LoaderCircle, Trash2, CircleCheck, X } from 'lucide-react';
import { Button } from './ui/button';
import { Modal } from './ui/dialog';
import { saveRecord, resetDatabase } from '@/app/actions';
import { labels } from '@/lib/format';
import type { SettingsData } from '@/lib/data';

// F1 (audit rute settings): halaman Pengaturan (profil perusahaan) dipisah dari
// ModuleWorkspace menjadi rute statis /dashboard/settings + komponen sendiri.
// F6 (audit rute settings): CATATAN KONSEP — "pengaturan perusahaan"
// (company_settings: kop surat, bank, penandatangan, PPN) DAN "pengaturan akun
// per-pengguna" (identitas/role/email user yang sedang login) adalah DUA konsep
// berbeda yang saat ini masih digabung di halaman ini: panel "Keamanan & Akses"
// menampilkan akun user, sisanya adalah data perusahaan. Pengingat untuk
// developer berikutnya: bila kelak ada pengaturan akun per-user, pisahkan ke
// halaman/loader sendiri — jangan menambah field baru ke company_settings.

export function SettingsWorkspace({ data }: { data: SettingsData }) {
  const router = useRouter();
  // Halaman ini admin-only (guard di loader getSettingsData), jadi canWrite
  // selalu true — dipertahankan untuk paritas form lama (disabled={!canWrite}).
  const canWrite = data.user.role === 'admin';
  const [toast, setToast] = useState<{ success: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [formErrors, setFormErrors] = useState<Record<string, string> | null>(null);
  const [resetOpen, setResetOpen] = useState(false);

  const act = useCallback((fn: () => Promise<{ success: boolean; message: string }>) => startTransition(async () => {
    try {
      const result = await fn();
      setToast(result);
      if (result.success) router.refresh();
    } catch { setToast({ success: false, message: 'Koneksi gagal. Silakan coba kembali.' }); router.refresh(); }
  }), [router]);

  const submit = useCallback((e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setFormErrors(null);
    startTransition(async () => {
      try {
        const result = await saveRecord('settings', form);
        setToast(result);
        if (!result.success) setFormErrors(result.fieldErrors || null);
        else router.refresh();
      } catch { setToast({ success: false, message: 'Data tidak dapat disimpan. Silakan coba kembali.' }); }
    });
  }, [router]);

  const resetAll = useCallback(async (phrase: string) => {
    const r = await resetDatabase(phrase);
    if (r.success) setResetOpen(false);
    return r;
  }, []);
  const confirmReset = useCallback((phrase: string) => act(() => resetAll(phrase)), [act, resetAll]);

  return (
    <div className="module-page page-enter">
      <div className="page-heading">
        <div>
          <div className="eyebrow"><span />RUANG KERJA OPERASIONAL</div>
          <h1>Pengaturan</h1>
          <p>Kelola profil perusahaan dan informasi yang digunakan pada dokumen.</p>
        </div>
      </div>
      <div className="table-tabs" style={{ marginBottom: 20 }}>
        <Link className="active" href="/dashboard/settings">Perusahaan</Link>
        <Link href="/dashboard/settings/templates">Template PDF</Link>
      </div>
      <div className="settings-grid">
        <section className="panel settings-panel">
          <div className="panel-header">
            <div><h2>Profil Perusahaan</h2><p>Informasi ini ditampilkan pada kepala surat, blok tanda tangan, dan dokumen PDF (SPH, BAST, Invoice).</p></div>
            <Building2 size={23} className="muted" />
          </div>
          <form onSubmit={submit}>
            <div className="form-grid">
              <label className="form-field span-2"><span>Nama Perusahaan <i>*</i></span><input name="companyName" required defaultValue={data.settings.companyName} disabled={!canWrite} />{formErrors?.companyName && <small className="field-error">{formErrors.companyName}</small>}</label>
              <label className="form-field span-2"><span>Alamat Perusahaan <i>*</i></span><textarea name="address" required defaultValue={data.settings.address} disabled={!canWrite} />{formErrors?.address && <small className="field-error">{formErrors.address}</small>}</label>
              <label className="form-field"><span>Surel Perusahaan <i>*</i></span><input type="email" name="email" required defaultValue={data.settings.email} disabled={!canWrite} />{formErrors?.email && <small className="field-error">{formErrors.email}</small>}</label>
              <label className="form-field"><span>Nomor Telepon <i>*</i></span><input name="phone" required defaultValue={data.settings.phone} disabled={!canWrite} />{formErrors?.phone && <small className="field-error">{formErrors.phone}</small>}</label>
              <label className="form-field"><span>Nama Penandatangan</span><input name="signerName" defaultValue={data.settings.signerName} disabled={!canWrite} placeholder="Nama lengkap penandatangan dokumen" /></label>
              <label className="form-field"><span>Jabatan Penandatangan</span><input name="signerTitle" defaultValue={data.settings.signerTitle} disabled={!canWrite} placeholder="Contoh: Manajer Operasional" /></label>
              <label className="form-field"><span>NPWP Perusahaan</span><input name="npwp" defaultValue={data.settings.npwp} disabled={!canWrite} placeholder="Contoh: 01.234.567.8-901.000" />{formErrors?.npwp ? <small className="field-error">{formErrors.npwp}</small> : <small className="cell-sub">Blok identitas PIHAK PERTAMA di perjanjian.</small>}</label>
              <label className="form-field"><span>No. KTP Penandatangan</span><input name="signerKtp" defaultValue={data.settings.signerKtp} disabled={!canWrite} placeholder="16 digit sesuai KTP" />{formErrors?.signerKtp ? <small className="field-error">{formErrors.signerKtp}</small> : <small className="cell-sub">Identitas wakil PIHAK PERTAMA di perjanjian.</small>}</label>
              <label className="form-field"><span>Nama Bank</span><input name="bankName" defaultValue={data.settings.bankName} disabled={!canWrite} placeholder="Contoh: BCA" /></label>
              <label className="form-field"><span>Nama Pemilik Rekening</span><input name="bankAccountName" defaultValue={data.settings.bankAccountName} disabled={!canWrite} placeholder="Sesuai buku rekening" /></label>
              <label className="form-field"><span>Nomor Rekening</span><input name="bankAccountNumber" defaultValue={data.settings.bankAccountNumber} disabled={!canWrite} placeholder="Nomor rekening penerima pembayaran" />{formErrors?.bankAccountNumber ? <small className="field-error">{formErrors.bankAccountNumber}</small> : <small className="cell-sub">Dipakai di PASAL 3 perjanjian &amp; info bayar invoice.</small>}</label>
              <label className="form-field"><span>Kota Penandatanganan <i>*</i></span><input name="city" required maxLength={100} defaultValue={data.settings.city} disabled={!canWrite} placeholder="Contoh: Jakarta" />{formErrors?.city ? <small className="field-error">{formErrors.city}</small> : <small className="cell-sub">Muncul di baris &quot;Kota, tanggal&quot; dokumen PDF.</small>}</label>
              <label className="form-field"><span>Zona Waktu Dokumen <i>*</i></span><select name="timezone" defaultValue={data.settings.timezone} disabled={!canWrite}>{(['WIB', 'WITA', 'WIT'] as const).map(z => <option key={z} value={z}>{labels[z]}</option>)}</select>{formErrors?.timezone ? <small className="field-error">{formErrors.timezone}</small> : <small className="cell-sub">Kalender &quot;hari ini&quot; untuk badge jatuh tempo & tanggal dokumen.</small>}</label>
              <label className="form-field"><span>Tarif PPN (%) <i>*</i></span><input name="ppnRate" type="number" required min={0} max={100} step="0.01" defaultValue={data.settings.ppnRate} disabled={!canWrite} />{formErrors?.ppnRate ? <small className="field-error">{formErrors.ppnRate}</small> : <small className="cell-sub">Berlaku untuk invoice baru; invoice lama tidak berubah.</small>}</label>
              <label className="form-field"><span>Ambang Peringatan Dokumen (hari) <i>*</i></span><input name="expiryWarningDays" type="number" required min={1} max={180} step={1} defaultValue={data.settings.expiryWarningDays} disabled={!canWrite} />{formErrors?.expiryWarningDays ? <small className="field-error">{formErrors.expiryWarningDays}</small> : <small className="cell-sub">SIKO/asuransi dalam rentang ini ikut badge peringatan.</small>}</label>
            </div>
            {canWrite && <div className="form-footer"><Button disabled={pending}>{pending ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />}Simpan Perubahan</Button></div>}
          </form>
        </section>
        <section className="panel account-panel">
          <span className="account-shield"><ShieldCheck size={25} /></span>
          <h2>Keamanan &amp; Akses</h2>
          <p>Akun Anda memiliki hak akses <b>{labels[data.user.role]}</b>.</p>
          <div className="account-details">
            <span>Nama pengguna<b>{data.user.fullName}</b></span>
            <span>Surel<b>{data.user.email}</b></span>
            <span>Autentikasi<b>{data.user.preview ? 'Mode pratinjau lokal' : 'Supabase Auth'}</b></span>
          </div>
          <div className="info-callout"><Info size={17} /><p>{data.user.preview ? 'Data demonstrasi tersimpan pada basis data lokal. Autentikasi wajib dikonfigurasi sebelum penerapan produksi.' : 'Perubahan peran pengguna hanya dapat dilakukan oleh administrator basis data.'}</p></div>
        </section>
        {data.user.role === 'admin' && (
          <section className="panel account-panel">
            <span className="account-shield"><TriangleAlert size={25} /></span>
            <h2>Zona Berbahaya</h2>
            <p>Hapus <b>seluruh data operasional</b> (armada, klien, kontrak, timesheet, BAST, invoice, pembayaran) setelah masa testing. Akun pengguna dan profil perusahaan dipertahankan.</p>
            <div className="account-details"><span>Operasi ini<b>tidak dapat dibatalkan</b></span></div>
            <Button variant="destructive" onClick={() => setResetOpen(true)}><Trash2 size={16} />Reset Database</Button>
          </section>
        )}
      </div>
      {resetOpen && <ResetModal pending={pending} onOpenChange={v => { if (!v && !pending) setResetOpen(false); }} onCancel={() => setResetOpen(false)} onReset={confirmReset} />}
      {toast && <div className={`toast ${toast.success ? 'toast-success' : 'toast-error'}`} role="status">{toast.success ? <CircleCheck size={20} /> : <TriangleAlert size={20} />}<span>{toast.message}</span><button onClick={() => setToast(null)} aria-label="Tutup pemberitahuan"><X size={16} /></button></div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal reset database — frasa konfirmasi lokal, parent tidak ikut render.
// Dipindah dari module-workspace.tsx bersama halaman Pengaturan (F1).
// ---------------------------------------------------------------------------
function ResetModal({ pending, onOpenChange, onCancel, onReset }: {
  pending: boolean; onOpenChange: (v: boolean) => void; onCancel: () => void; onReset: (phrase: string) => void;
}) {
  const [phrase, setPhrase] = useState('');
  return (
    <Modal open onOpenChange={onOpenChange} title="Reset Database" description="Seluruh data operasional (armada, klien, kontrak, timesheet, BAST, invoice, pembayaran) akan dihapus permanen. Akun pengguna dan profil perusahaan dipertahankan. Ketik HAPUS SEMUA DATA untuk melanjutkan.">
      <div className="form-grid">
        <label className="form-field span-2"><span>Konfirmasi penghapusan <i>*</i></span><input value={phrase} onChange={e => setPhrase(e.target.value)} placeholder="HAPUS SEMUA DATA" /></label>
      </div>
      <div className="form-footer">
        <Button variant="outline" onClick={onCancel} disabled={pending}>Batal</Button>
        <Button variant="destructive" disabled={pending || phrase !== 'HAPUS SEMUA DATA'} onClick={() => onReset(phrase)}>{pending ? <LoaderCircle size={16} className="spin" /> : <Trash2 size={16} />}Hapus Semua Data</Button>
      </div>
    </Modal>
  );
}
