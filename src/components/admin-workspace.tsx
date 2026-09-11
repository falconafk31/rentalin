'use client';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Search, ShieldX, UsersRound, ScrollText, UserPlus, LoaderCircle, CircleCheck, TriangleAlert, X, Pencil, Ban, UserCheck, Check } from 'lucide-react';
import { Button } from './ui/button';
import { updateUserRole, inviteUser, updateUserProfile, setUserBanned } from '@/app/actions';
import { labels, dateTimeLabel } from '@/lib/format';
import { Badge } from './overview';
import type { UsersData, AuditData } from '@/lib/data';

export function AccessDenied() {
  return (
    <div className="module-page page-enter">
      <div className="page-heading"><div><div className="eyebrow"><span />AKSES TERBATAS</div><h1>Tidak Diizinkan</h1><p>Halaman ini hanya dapat diakses oleh Administrator.</p></div></div>
      <section className="panel"><div className="empty-state"><span><ShieldX size={26} /></span><h3>Akses ditolak</h3><p>Hubungi administrator bila Anda membutuhkan akses ini.</p></div></section>
    </div>
  );
}

const actionLabels: Record<string, string> = {
  create: 'Membuat', update: 'Mengubah', delete: 'Menghapus', approve: 'Menyetujui', reject: 'Menolak',
  pay: 'Pembayaran', complete: 'Menyelesaikan', revise: 'Merevisi', reset: 'Mereset', role: 'Ubah peran', invite: 'Mengundang', cron: 'Otomatis', login: 'Masuk', logout: 'Keluar', upload: 'Mengunggah foto',
};
const entityLabels: Record<string, string> = {
  fleet: 'Armada', clients: 'Klien', contracts: 'Kontrak', timesheets: 'Timesheet', bast: 'BAST',
  invoices: 'Invoice', settings: 'Pengaturan', profiles: 'Pengguna', database: 'Database',
};

// ---------------------------------------------------------------------------
// Manajemen pengguna & peran (admin). Daftar dari profiles; undang via email
// bila service-role tersedia, kalau tidak fallback ke template SQL.
// ---------------------------------------------------------------------------
export function UsersWorkspace({ data, banned }: { data: UsersData; banned: Record<string, boolean> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ success: boolean; message: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const run = (fn: () => Promise<{ success: boolean; message: string }>) => startTransition(async () => {
    try {
      const r = await fn();
      setToast(r);
      if (r.success) router.refresh();
    } catch { setToast({ success: false, message: 'Koneksi gagal. Silakan coba kembali.' }); }
  });
  return (
    <div className="module-page page-enter">
      <div className="page-heading">
        <div><div className="eyebrow"><span />ADMINISTRASI</div><h1>Pengguna &amp; Peran</h1><p>Kelola hak akses akun internal dan undang anggota baru.</p></div>
      </div>
      <div className="settings-grid">
        <section className="panel module-table-panel" style={{ marginTop: 0 }}>
          <div className="table-toolbar" style={{ borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontWeight: 600 }}><UsersRound size={18} />{data.profiles.length} akun terdaftar</div>
          </div>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Nama Pengguna</th><th>Peran Akses</th><th>Status</th><th>Bergabung</th><th>Tindakan</th></tr></thead>
              <tbody>
                {data.profiles.map(p => (
                  <tr key={p.id}>
                    <td>{editingId === p.id ? (
                      <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input value={draftName} onChange={e => setDraftName(e.target.value)} maxLength={100} aria-label="Nama lengkap" style={{ border: '1px solid #e2e6eb', borderRadius: 6, minHeight: 33, padding: '6px 9px', fontSize: 14, width: 150 }} />
                        <button className="icon-button green" title="Simpan nama" aria-label="Simpan nama" disabled={pending} onClick={() => { const form = new FormData(); form.set('id', p.id); form.set('fullName', draftName); setEditingId(null); run(() => updateUserProfile(form)); }}><Check size={16} /></button>
                        <button className="icon-button" title="Batal" aria-label="Batal mengubah nama" onClick={() => setEditingId(null)}><X size={16} /></button>
                      </span>
                    ) : (<><b>{p.fullName}</b>{p.id === data.user.id && <small className="cell-sub">Anda</small>}</>)}</td>
                    <td>
                      <label className="small-select">
                        <select value={p.role} disabled={pending} onChange={e => {
                          const form = new FormData();
                          form.set('id', p.id);
                          form.set('role', e.target.value);
                          run(() => updateUserRole(form));
                        }} aria-label={`Peran ${p.fullName}`}>
                          {['admin', 'operations', 'operator', 'finance'].map(r => <option key={r} value={r}>{labels[r]}</option>)}
                        </select>
                      </label>
                    </td>
                    <td><Badge status={banned[p.id] ? 'banned' : 'active'} /></td>
                    <td>{dateTimeLabel(p.createdAt)}</td>
                    <td>
                      <div className="row-actions">
                        <button className="icon-button" title={`Ubah nama ${p.fullName}`} aria-label={`Ubah nama ${p.fullName}`} disabled={pending} onClick={() => { setEditingId(p.id); setDraftName(p.fullName); }}><Pencil size={15} />Ubah</button>
                        {p.id !== data.user.id && (banned[p.id]
                          ? <button className="icon-button green" title={`Aktifkan ${p.fullName}`} aria-label={`Aktifkan ${p.fullName}`} disabled={pending} onClick={() => { const form = new FormData(); form.set('id', p.id); form.set('banned', '0'); run(() => setUserBanned(form)); }}><UserCheck size={15} />Aktifkan</button>
                          : <button className="icon-button danger-icon" title={`Nonaktifkan ${p.fullName}`} aria-label={`Nonaktifkan ${p.fullName}`} disabled={pending} onClick={() => { if (!confirm(`Nonaktifkan akun ${p.fullName}? Pengguna tidak bisa masuk hingga diaktifkan kembali.`)) return; const form = new FormData(); form.set('id', p.id); form.set('banned', '1'); run(() => setUserBanned(form)); }}><Ban size={15} />Nonaktifkan</button>)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.profiles.length && <div className="empty-state"><span><UsersRound size={26} /></span><h3>Belum ada pengguna</h3><p>Undang anggota pertama lewat formulir di samping.</p></div>}
          </div>
        </section>
        <section className="panel account-panel">
          <span className="account-shield"><UserPlus size={25} /></span>
          <h2>Undang Anggota</h2>
          <p>Undangan dikirim via surel. Profil &amp; peran dibuat otomatis saat undangan diterima.</p>
          <form style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 16 }} onSubmit={e => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            run(() => inviteUser(form));
          }}>
            <label className="form-field"><span>Nama Lengkap <i>*</i></span><input name="fullName" required placeholder="Nama anggota baru" /></label>
            <label className="form-field"><span>Surel <i>*</i></span><input type="email" name="email" required placeholder="nama@perusahaan.co.id" /></label>
            <label className="form-field"><span>Peran <i>*</i></span><select name="role" defaultValue="operator">{['admin', 'operations', 'operator', 'finance'].map(r => <option key={r} value={r}>{labels[r]}</option>)}</select></label>
            <Button disabled={pending}>{pending ? <LoaderCircle size={16} className="spin" /> : <UserPlus size={16} />}Kirim Undangan</Button>
          </form>
          <div className="info-callout" style={{ marginTop: 20 }}><ScrollText size={17} /><p>Butuh cara manual? Lihat <b>supabase/templates/provision_user.sql</b> di repositori.</p></div>
        </section>
      </div>
      {toast && <div className={`toast ${toast.success ? 'toast-success' : 'toast-error'}`} role="status">{toast.success ? <CircleCheck size={20} /> : <TriangleAlert size={20} />}<span>{toast.message}</span><button onClick={() => setToast(null)} aria-label="Tutup pemberitahuan"><X size={16} /></button></div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Log audit (admin, read-only, 200 terbaru).
// ---------------------------------------------------------------------------
export function AuditWorkspace({ data }: { data: AuditData }) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return data.auditLogs.filter(l => !q || `${l.actorName} ${l.summary} ${l.entity} ${l.action}`.toLowerCase().includes(q));
  }, [data.auditLogs, query]);
  return (
    <div className="module-page page-enter">
      <div className="page-heading">
        <div><div className="eyebrow"><span />ADMINISTRASI</div><h1>Log Audit</h1><p>Jejak 200 aktivitas terakhir — siapa melakukan apa dan kapan.</p></div>
      </div>
      <section className="panel module-table-panel" style={{ marginTop: 0 }}>
        <div className="table-toolbar">
          <label className="table-search">
            <Search size={17} />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Cari pelaku, aksi, atau ringkasan..." aria-label="Cari log audit" />
            {query && <button onClick={() => setQuery('')} aria-label="Hapus pencarian"><X size={14} /></button>}
          </label>
        </div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Waktu</th><th>Pelaku</th><th>Aksi</th><th>Entitas</th><th>Ringkasan</th></tr></thead>
            <tbody>
              {filtered.map(l => (
                <tr key={l.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{dateTimeLabel(l.createdAt)}</td>
                  <td><b>{l.actorName}</b></td>
                  <td>{actionLabels[l.action] || l.action}</td>
                  <td>{entityLabels[l.entity] || l.entity}</td>
                  <td style={{ whiteSpace: 'normal', minWidth: 280 }}>{l.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && <div className="empty-state"><span><Search size={26} /></span><h3>{query ? 'Tidak ditemukan' : 'Belum ada aktivitas'}</h3><p>{query ? 'Coba kata kunci lain.' : 'Aktivitas tercatat otomatis mulai sekarang.'}</p></div>}
        </div>
        <div className="table-footer"><span>Menampilkan {filtered.length} dari {data.auditLogs.length} log</span></div>
      </section>
    </div>
  );
}
