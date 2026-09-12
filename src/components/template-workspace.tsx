'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Save, Send, History, Eye, CircleCheck, TriangleAlert, X } from 'lucide-react';
import { Button } from './ui/button';
import { saveTemplateDraft, publishTemplate, rollbackTemplate } from '@/app/actions';
import { dateTimeLabel } from '@/lib/format';
import type { DocumentTemplate, TemplateKind } from '@/lib/data';

const KIND_LABEL: Record<TemplateKind, string> = {
  sph: 'SPH',
  bast: 'BAST',
  invoice: 'Invoice',
  perjanjian: 'Perjanjian',
};

const KIND_DESC: Record<TemplateKind, string> = {
  sph: 'Kalimat pembuka dan catatan Surat Penawaran Harga.',
  bast: 'Kalimat pembuka mobilisasi/demobilisasi dan catatan BAST. Boleh 2+ halaman bila teks panjang.',
  invoice: 'Kalimat pembuka dan catatan Faktur Tagihan.',
  perjanjian: 'Isi PASAL 1–6 Surat Perjanjian Sewa.',
};

const BLOCK_LABEL: Record<string, string> = {
  intro: 'Kalimat pembuka',
  intro_mobilisasi: 'Pembuka mobilisasi',
  intro_demobilisasi: 'Pembuka demobilisasi',
  notes: 'Catatan dan ketentuan',
  footer_text: 'Teks footer verifikasi',
  pasal_1: 'PASAL 1 — Objek sewa',
  pasal_2: 'PASAL 2 — Jangka waktu',
  pasal_3: 'PASAL 3 — Harga dan pembayaran',
  pasal_4: 'PASAL 4 — Hak dan kewajiban',
  pasal_5: 'PASAL 5 — Kerusakan dan kehilangan',
  pasal_6: 'PASAL 6 — Penyelesaian perselisihan',
};

const VAR_LIST = ['nomor_dokumen','nama_klien','tanggal_dokumen','periode_sewa','tarif_per_jam','jatuh_tempo','total_tagihan','kota','nama_signer','jabatan_signer','nama_pic_klien','daftar_checklist'];

export type TemplatesData = Record<TemplateKind, { published: DocumentTemplate | null; history: DocumentTemplate[] }>;

function blocksOf(t: DocumentTemplate | null): [string, string][] {
  if (!t || !t.content || typeof t.content !== 'object' || Array.isArray(t.content)) return [];
  return (Object.entries(t.content) as [string, unknown][])
    .filter(([, v]) => typeof v === 'string')
    .map(([k, v]) => [k, v as string]);
}

export function TemplatesWorkspace({ data, canWrite }: { data: TemplatesData; canWrite: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ success: boolean; message: string } | null>(null);
  const [kind, setKind] = useState<TemplateKind>('sph');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const entry = data[kind];
  const publishedBlocks = blocksOf(entry.published);

  const insertVar = (name: string) => setBody(b => `${b}{{${name}}}`);

  const run = (fn: () => Promise<{ success: boolean; message: string }>) => startTransition(async () => {
    try {
      const r = await fn();
      setToast(r);
      if (r.success) { setTitle(''); setBody(''); router.refresh(); }
    } catch { setToast({ success: false, message: 'Koneksi gagal. Silakan coba kembali.' }); }
  });

  const saveDraft = () => {
    let content: Record<string, string>;
    try { content = JSON.parse(body || '{}'); }
    catch { setToast({ success: false, message: 'Isi harus JSON valid, contoh: {"notes": "teks..."}.' }); return; }
    run(() => saveTemplateDraft(kind, title || KIND_LABEL[kind], JSON.stringify(content)));
  };

  return (
    <div>
      <div className="table-tabs" style={{ padding: 0, marginBottom: 16 }}>
        {(Object.keys(KIND_LABEL) as TemplateKind[]).map(k => (
          <button key={k} className={kind === k ? 'active' : ''} onClick={() => { setKind(k); setTitle(''); setBody(''); }}>
            {KIND_LABEL[k]}
            <span>v{entry && k === kind ? (data[k].published?.version ?? 0) : (data[k].published?.version ?? 0)}</span>
          </button>
        ))}
      </div>
      <div className="info-callout" style={{ marginBottom: 16 }}>
        <FileText size={17} />
        <p><b>{KIND_LABEL[kind]}.</b> {KIND_DESC[kind]} Gunakan variabel {`{{nama_klien}}`} agar nilai terisi otomatis dari dokumen.</p>
      </div>

      {entry.published ? (
        <div className="summary-box" style={{ marginBottom: 16 }}>
          <h4>Tayang: v{entry.published.version} · {entry.published.title}</h4>
          {publishedBlocks.map(([k, v]) => (
            <div key={k} style={{ alignItems: 'flex-start' }}>
              <span>{BLOCK_LABEL[k] || k}</span>
              <b style={{ fontWeight: 400, textAlign: 'right', maxWidth: '65%' }}>{v.slice(0, 160)}{v.length > 160 ? '…' : ''}</b>
            </div>
          ))}
          <div><span>Terbit</span><b>{dateTimeLabel(entry.published.publishedAt || entry.published.createdAt)}</b></div>
        </div>
      ) : (
        <div className="info-callout" style={{ marginBottom: 16 }}>
          <TriangleAlert size={17} />
          <p>Belum ada template tayang untuk {KIND_LABEL[kind]}. PDF memakai teks bawaan aplikasi sampai versi pertama diterbitkan.</p>
        </div>
      )}

      {canWrite && (
        <section className="panel" style={{ padding: 20, marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, marginBottom: 6 }}>Draf baru v{(entry.published?.version ?? 0) + 1}</h2>
          <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>Tulis isi sebagai JSON per blok. Contoh BAST: {`{"intro_mobilisasi": "teks...", "notes": "teks..."}`}</p>
          <label className="form-field" style={{ marginBottom: 12 }}>
            <span>Judul versi</span>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder={`${KIND_LABEL[kind]} — revisi teks`} maxLength={120} />
          </label>
          <label className="form-field" style={{ marginBottom: 12 }}>
            <span>Isi template (JSON)</span>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={8} placeholder='{"notes": "Teks catatan dengan {{nama_klien}}..."}' style={{ fontFamily: 'monospace', fontSize: 13 }} />
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            {VAR_LIST.map(v => (
              <button key={v} type="button" className="button button-outline button-sm" onClick={() => insertVar(v)} title={`Sisipkan {{${v}}}`}>
                {`{{${v}}}`}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button disabled={pending || !body.trim()} onClick={saveDraft}>
              {pending ? 'Menyimpan…' : <><Save size={16} />Simpan Draf</>}
            </Button>
            <a className="button button-outline" href={`/api/documents/${kind === 'sph' || kind === 'perjanjian' ? kind : kind}/preview`} target="_blank" rel="noreferrer" title="Pratinjau PDF contoh">
              <Eye size={16} />Pratinjau
            </a>
          </div>
        </section>
      )}

      <section className="panel" style={{ padding: 20 }}>
        <h2 style={{ fontSize: 15, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <History size={17} />Riwayat versi ({entry.history.length})
        </h2>
        {!entry.history.length && <p className="muted" style={{ fontSize: 13 }}>Belum ada versi tersimpan.</p>}
        {entry.history.map(h => (
          <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: '1px solid var(--border)', fontSize: 13 }}>
            <span className={`status-badge ${h.status === 'published' ? 'status-paid' : h.status === 'draft' ? 'status-draft' : 'status-pending'}`}>
              v{h.version} · {h.status === 'published' ? 'Tayang' : h.status === 'draft' ? 'Draf' : 'Arsip'}
            </span>
            <span style={{ flex: 1 }}>{h.title}<small className="cell-sub">{dateTimeLabel(h.createdAt)}</small></span>
            {canWrite && h.status === 'draft' && (
              <button className="button button-outline button-sm" disabled={pending} onClick={() => run(() => publishTemplate(h.id))}>
                <Send size={14} />Terbitkan
              </button>
            )}
            {canWrite && h.status !== 'published' && (
              <button className="button button-outline button-sm" disabled={pending} onClick={() => run(() => rollbackTemplate(kind, h.version))}>
                Rollback
              </button>
            )}
          </div>
        ))}
      </section>

      {toast && (
        <div className={`toast ${toast.success ? 'toast-success' : 'toast-error'}`} role="status">
          {toast.success ? <CircleCheck size={20} /> : <TriangleAlert size={20} />}
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} aria-label="Tutup pemberitahuan"><X size={16} /></button>
        </div>
      )}
    </div>
  );
}
