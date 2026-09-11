'use client';
import { useCallback, useDeferredValue, useEffect, useMemo, useOptimistic, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Plus, ChevronDown, ChevronLeft, ChevronRight, ArrowUpDown, Pencil, Trash2, FileDown, Check, X, TriangleAlert, LoaderCircle, CircleCheck, Building2, Filter, Info, Save, ShieldCheck, Wallet, ImagePlus } from 'lucide-react';
import { EquipmentIcon } from './icons';
import { Button } from './ui/button';
import { Modal } from './ui/dialog';
import { Badge } from './overview';
import { saveRecord, bulkCreateFleet, changeStatus, deleteClient, resetDatabase, reviseContract, recordPayment } from '@/app/actions';
import { money, dateLabel, dateTimeLabel, timeLabel, labels, todayISO, isPastDue, isExpiringSoon } from '@/lib/format';
import type { WorkspaceData } from '@/lib/data';
import { calcInvoiceTotals, remainingBalance } from '@/lib/finance';

const config: Record<string, { title: string; description: string; add: string; singular: string }> = {
  fleet: { title: 'Armada Alat Berat', description: 'Kelola seluruh unit, pantau ketersediaan, dan pastikan kesiapan armada Anda.', add: 'Tambah Unit', singular: 'Unit Alat Berat' },
  clients: { title: 'Data Klien', description: 'Kelola hubungan bisnis dan informasi perusahaan mitra Anda.', add: 'Tambah Klien', singular: 'Klien' },
  contracts: { title: 'Kontrak Sewa', description: 'Kelola kesepakatan sewa, penugasan unit, dan periode kontrak.', add: 'Buat Kontrak', singular: 'Kontrak Sewa' },
  timesheets: { title: 'Timesheet Harian', description: 'Pantau jam kerja alat berat dan kelola persetujuan catatan operator.', add: 'Catat Jam Kerja', singular: 'Catatan Kerja Harian' },
  bast: { title: 'Berita Acara Serah Terima', description: 'Dokumentasikan kondisi unit saat mobilisasi dan demobilisasi.', add: 'Buat BAST', singular: 'Berita Acara Serah Terima' },
  invoices: { title: 'Penagihan', description: 'Terbitkan tagihan dari jam kerja yang disetujui dan pantau pembayaran.', add: 'Buat Invoice', singular: 'Tagihan Sewa' },
  settings: { title: 'Pengaturan', description: 'Kelola profil perusahaan dan informasi yang digunakan pada dokumen.', add: '', singular: '' },
};

const tableMeta: Record<string, { headers: string[]; statuses: string[] }> = {
  fleet: { headers: ['No', 'Unit Alat Berat', 'Kategori / Tahun', 'Lokasi Saat Ini', 'Tarif per Jam', 'Status', 'Tindakan'], statuses: ['available', 'renting', 'maintenance', 'in_transit'] },
  clients: { headers: ['No', 'Perusahaan', 'NPWP', 'Penanggung Jawab', 'Kontak', 'Kontrak', 'Tindakan'], statuses: [] },
  contracts: { headers: ['No', 'Nomor Kontrak', 'Klien / Unit', 'Periode Sewa', 'Tarif per Jam', 'Status', 'Tindakan'], statuses: ['active', 'draft', 'completed'] },
  timesheets: { headers: ['No', 'Tanggal / Kontrak', 'Unit Alat Berat', 'HM Awal → Akhir', 'Jam Efektif', 'Status', 'Persetujuan'], statuses: ['pending', 'approved', 'rejected'] },
  bast: { headers: ['No', 'Nomor Dokumen', 'Kontrak / Klien', 'Tanggal Serah Terima', 'Jenis', 'Kondisi Unit', 'Dokumen'], statuses: ['mobilization', 'demobilization'] },
  invoices: { headers: ['No', 'Nomor Tagihan', 'Klien / Kontrak', 'Total Tagihan', 'Jatuh Tempo', 'Status', 'Tindakan'], statuses: ['unpaid', 'paid', 'overdue', 'partial'] },
  settings: { headers: [], statuses: [] },
};

const bastFields = ['engine', 'hydraulics', 'tracks', 'oil', 'fuel', 'battery', 'lights', 'brakes', 'bucket', 'cabin', 'safety', 'documents'];
const fleetCategories = ['Ekskavator', 'Buldozer', 'Vibro Roller', 'Crane', 'Wheel Loader', 'Motor Grader', 'Dump Truck'];
const bastItems: [string, string, string][] = [['engine', 'Mesin', 'Mesin menyala normal, tidak ada kebocoran atau suara abnormal.'], ['hydraulics', 'Sistem Hidraulik', 'Tekanan stabil, selang dan silinder tanpa rembes.'], ['tracks', 'Rantai / Roda', 'Track shoe / ban, sprocket, dan roller kondisi baik.'], ['oil', 'Oli & Cairan', 'Level oli mesin, coolant, dan oli hidraulik aman.'], ['fuel', 'Bahan Bakar', 'Level BBM tercatat, tutup tangki dan selang baik.'], ['battery', 'Aki & Starter', 'Starter tokcer, terminal aki bersih dan kencang.'], ['lights', 'Lampu & Klakson', 'Lampu kerja, beacon, klakson, dan alarm mundur berfungsi.'], ['brakes', 'Rem & Kemudi', 'Rem dan kemudi responsif, tanpa speleng berlebih.'], ['bucket', 'Bucket / Attachment', 'Bucket / blade, gigi, pin, dan bushing tidak retak.'], ['cabin', 'Kabin & Kaca', 'Kabin / ROPS, jok, sabuk, spion, kaca, dan wiper baik.'], ['safety', 'APAR & P3K', 'APAR, kotak P3K, dan perlengkapan darurat tersedia.'], ['documents', 'SIKO & Dokumen', 'SIKO / SILO, STNK / KIR, dan catatan HM difoto.']];

type EditableRecord = Record<string, string | number | boolean | string[] | Date | null>;
type Row = { id: string; search: string; status: string; category?: string; cells: React.ReactNode[]; raw: EditableRecord };
type FleetRow = WorkspaceData['fleet'][number];
type StatusUpdate = { kind: 'timesheet' | 'invoice' | 'contract'; id: string; status: string };

// Satu collator dipakai bersama — localeCompare per perbandingan membuat
// collator baru dan membuat sort O(n log n) jauh lebih mahal.
const collator = new Intl.Collator('id');
// Ambang peringatan (hari) kini konfigurasi, bukan hardcode 30 — perbandingan
// memakai aritmetika kalender TZ-aman agar tidak geser ±1 hari di WIB.
const isExpiringFleet = (f: Pick<FleetRow, 'sikoExpiry' | 'insuranceExpiry'>, warnDays = 30) =>
  [f.sikoExpiry, f.insuranceExpiry].some(d => isExpiringSoon(d, warnDays));

// Lookup O(1) via Map — sebelumnya setiap baris tabel memanggil .find() di atas
// seluruh koleksi (O(n²) setiap render, dan render terjadi tiap ketikan).
function useLookups(data: WorkspaceData) {
  const fleetById = useMemo(() => new Map(data.fleet.map(f => [f.id, f])), [data.fleet]);
  const clientsById = useMemo(() => new Map(data.clients.map(c => [c.id, c])), [data.clients]);
  const contractsById = useMemo(() => new Map(data.contracts.map(c => [c.id, c])), [data.contracts]);
  const contractsByClient = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of data.contracts) m.set(c.clientId, (m.get(c.clientId) || 0) + 1);
    return m;
  }, [data.contracts]);
  const getUnit = useCallback((id: string) => fleetById.get(id), [fleetById]);
  const getClient = useCallback((id: string) => clientsById.get(id), [clientsById]);
  const getContract = useCallback((id: string) => contractsById.get(id), [contractsById]);
  return { getUnit, getClient, getContract, contractsByClient };
}

function PdfLink({ kind, id }: { kind: string; id: string }) {
  return <a className="icon-button" href={`/api/documents/${kind}/${id}`} target="_blank" rel="noreferrer" title="Unduh dokumen PDF" aria-label="Unduh dokumen PDF"><FileDown size={17} />Unduh</a>;
}

export function ModuleWorkspace({ module, data: sourceData, initialQuery = '', initialStatus = 'all', initialOpen = false, expiringOnly = false }: { module: string; data: WorkspaceData; initialQuery?: string; initialStatus?: string; initialOpen?: boolean; expiringOnly?: boolean }) {
  const router = useRouter();
  // Optimistic UI (O-B): aksi status langsung tercermin di tabel, lalu
  // disinkronkan ulang dari server (act me-refresh baik sukses maupun gagal).
  const [data, applyStatus] = useOptimistic(sourceData, (prev: WorkspaceData, u: StatusUpdate) => {
    if (u.kind === 'timesheet') return { ...prev, timesheets: prev.timesheets.map(t => t.id === u.id ? { ...t, status: u.status } : t) };
    if (u.kind === 'invoice') return { ...prev, invoices: prev.invoices.map(i => i.id === u.id ? { ...i, status: u.status } : i) };
    if (u.kind === 'contract') {
      const target = prev.contracts.find(x => x.id === u.id);
      return {
        ...prev,
        contracts: prev.contracts.map(x => x.id === u.id ? { ...x, status: u.status } : x),
        fleet: target ? prev.fleet.map(f => f.id === target.unitId ? { ...f, status: 'available' } : f) : prev.fleet,
      };
    }
    return prev;
  });
  const ppnRate = Number(sourceData.settings.ppnRate ?? 11);
  const warnDays = Number(sourceData.settings.expiryWarningDays ?? 30) || 30;
  const c = config[module];
  const { headers, statuses } = tableMeta[module];
  const { getUnit, getClient, getContract, contractsByClient } = useLookups(data);
  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState(initialStatus);
  const [category, setCategory] = useState('all');
  const [open, setOpen] = useState(initialOpen);
  const [editing, setEditing] = useState<EditableRecord | null>(null);
  const [toast, setToast] = useState<{ success: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [page, setPage] = useState(1);
  const [sortDir, setSortDir] = useState<0 | 1 | -1>(0);
  const [confirm, setConfirm] = useState<{ title: string; text: string; action: () => Promise<{ success: boolean; message: string }>; optimistic?: StatusUpdate } | null>(null);
  const [onlyExpiry, setOnlyExpiry] = useState(expiringOnly);
  const [resetOpen, setResetOpen] = useState(false);
  const [bulk, setBulk] = useState(false);
  const [revising, setRevising] = useState<EditableRecord | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string> | null>(null);
  const [paying, setPaying] = useState<WorkspaceData['invoices'][number] | null>(null);

  // Nilai pencarian yang dipakai untuk filter/menunda render daftar sampai
  // browser idle — kolom input tetap responsif walau data besar.
  const deferredQuery = useDeferredValue(query);

  const fleetGroups = useMemo(() => Array.from(data.fleet.reduce((m, f) => {
    const k = `${f.brandModel} · ${f.category}`;
    m.set(k, (m.get(k) || 0) + 1);
    return m;
  }, new Map<string, number>())).sort((a, b) => b[1] - a[1]).slice(0, 6), [data.fleet]);
  const expiring = useMemo(() => data.fleet.filter(f => isExpiringFleet(f, warnDays)), [data.fleet, warnDays]);
  const paymentsByInvoice = useMemo(() => {
    const m = new Map<string, { paid: number; count: number }>();
    for (const p of data.payments) {
      const cur = m.get(p.invoiceId) || { paid: 0, count: 0 };
      cur.paid += Number(p.amount);
      cur.count += 1;
      m.set(p.invoiceId, cur);
    }
    return m;
  }, [data.payments]);
  const fleetCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of data.fleet) m.set(f.status, (m.get(f.status) || 0) + 1);
    return m;
  }, [data.fleet]);
  const invoiceTotals = useMemo(() => {
    const all = data.invoices.reduce((a, i) => a + Number(i.totalAmount), 0);
    const collected = data.payments.reduce((a, p) => a + Number(p.amount), 0);
    return {
      all,
      paid: data.invoices.filter(i => i.status === 'paid'),
      unpaid: data.invoices.filter(i => i.status !== 'paid'),
      collected,
      receivable: all - collected,
    };
  }, [data.invoices, data.payments]);
  const pendingTimesheets = useMemo(() => data.timesheets.filter(t => t.status === 'pending').length, [data.timesheets]);
  const fleetCategoryOptions = useMemo(() => Array.from(new Set(data.fleet.map(f => f.category))), [data.fleet]);

  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 5500); return () => clearTimeout(t); } }, [toast]);

  // Sinkronisasi props URL → state saat navigasi terjadi pada komponen yang sama.
  // Pola "adjust state during render" (dokumentasi React) — pengganti anti-pattern
  // useEffect+setState yang ditandai aturan react-hooks/set-state-in-effect.
  const [syncedProps, setSyncedProps] = useState({ initialQuery, initialStatus, expiringOnly });
  if (syncedProps.initialQuery !== initialQuery || syncedProps.initialStatus !== initialStatus || syncedProps.expiringOnly !== expiringOnly) {
    setSyncedProps({ initialQuery, initialStatus, expiringOnly });
    setQuery(initialQuery); setStatus(initialStatus); setOnlyExpiry(expiringOnly); setPage(1);
  }

  const operational = ['admin', 'operations'].includes(data.user.role);
  const canWrite = module === 'invoices' ? ['admin', 'finance'].includes(data.user.role) : module === 'settings' ? data.user.role === 'admin' : module === 'timesheets' ? ['admin', 'operations', 'operator'].includes(data.user.role) : operational;

  const act = useCallback((fn: () => Promise<{ success: boolean; message: string }>) => startTransition(async () => {
    try {
      const result = await fn();
      setToast(result);
      if (result.success) setConfirm(null);
      router.refresh();
    } catch { setToast({ success: false, message: 'Koneksi gagal. Silakan coba kembali.' }); router.refresh(); }
  }), [router]);

  const edit = useCallback((record: EditableRecord) => { setEditing(record); setRevising(null); setBulk(false); setFormErrors(null); setOpen(true); }, []);
  const startRevise = useCallback((contract: EditableRecord) => { setRevising(contract); setEditing(null); setBulk(false); setFormErrors(null); setOpen(true); }, []);
  const askStatus = useCallback((id: string, next: string) => setConfirm({
    title: next === 'paid' ? 'Konfirmasi Pelunasan' : next === 'completed' ? 'Selesaikan Kontrak' : next === 'approved' ? 'Setujui Catatan Kerja' : 'Tolak Catatan Kerja',
    text: next === 'paid' ? 'Pastikan pembayaran telah diterima sebelum menandai tagihan sebagai lunas.' : next === 'completed' ? 'Kontrak akan diselesaikan dan unit akan kembali tersedia untuk disewakan.' : 'Status catatan akan diperbarui. Pastikan jam kerja dan keterangan telah diperiksa.',
    action: () => changeStatus(module, id, next),
    optimistic: module === 'timesheets' ? { kind: 'timesheet', id, status: next } : module === 'invoices' ? { kind: 'invoice', id, status: next } : module === 'contracts' ? { kind: 'contract', id, status: next } : undefined,
  }), [module]);

  // Baris tabel di-memo: mengetik di kolom pencarian TIDAK membangun ulang
  // seluruh JSX baris — hanya filter (yang di-defer) yang dihitung ulang.
  const rows: Row[] = useMemo(() => {
    if (module === 'fleet') {
      return data.fleet.filter(f => !onlyExpiry || isExpiringFleet(f, warnDays)).map(f => ({
        id: f.id, search: `${f.unitCode} ${f.brandModel} ${f.category} ${f.currentLocation}`, status: f.status, category: f.category, raw: f,
        cells: [
          <div className="unit-cell" key="unit"><span className="unit-icon"><EquipmentIcon /></span><span><b>{f.brandModel}</b><small>{f.unitCode}{isExpiringFleet(f, warnDays) && <TriangleAlert size={12} className="amber-text" />}</small></span></div>,
          <div key="category">{f.category}<small className="cell-sub">Tahun {f.year}</small></div>,
          f.currentLocation || '—', money(f.hourlyRate), <Badge status={f.status} key="status" />,
          canWrite ? <div className="row-actions" key="edit"><button className="icon-button" aria-label={`Ubah ${f.unitCode}`} title="Ubah unit" onClick={() => edit(f)}><Pencil size={15} />Ubah</button></div> : <span key="read">—</span>,
        ],
      }));
    }
    if (module === 'clients') {
      return data.clients.map(client => ({
        id: client.id, search: `${client.companyName} ${client.picName} ${client.picEmail}`, status: 'all', raw: client,
        cells: [
          <div className="unit-cell" key="company"><span className="unit-icon blue"><Building2 size={21} /></span><span><b>{client.companyName}</b><small>{client.address}</small></span></div>,
          client.npwp || '—', client.picName,
          <div key="contact">{client.picPhone || '—'}<small className="cell-sub">{client.picEmail}</small></div>,
          `${contractsByClient.get(client.id) || 0} kontrak`,
          canWrite ? <div className="row-actions" key="actions"><button className="icon-button" onClick={() => edit(client)} aria-label={`Ubah ${client.companyName}`} title="Ubah data klien"><Pencil size={15} />Ubah</button><button className="icon-button danger-icon" aria-label={`Hapus ${client.companyName}`} title="Hapus data klien" onClick={() => setConfirm({ title: 'Hapus Data Klien', text: `Apakah Anda yakin ingin menghapus ${client.companyName}? Klien yang memiliki kontrak tidak dapat dihapus.`, action: () => deleteClient(client.id) })}><Trash2 size={15} />Hapus</button></div> : null,
        ],
      }));
    }
    if (module === 'contracts') {
      return data.contracts.map(contract => ({
        id: contract.id, search: `${contract.contractNumber} ${getClient(contract.clientId)?.companyName} ${getUnit(contract.unitId)?.unitCode}`, status: contract.status, raw: contract,
        cells: [
          <div key="number"><b className="document-number">{contract.contractNumber}</b><small className="cell-sub">Dibuat {dateTimeLabel(contract.createdAt)}</small></div>,
          <div key="client"><b>{getClient(contract.clientId)?.companyName}</b><small className="cell-sub">{getUnit(contract.unitId)?.unitCode} · {getUnit(contract.unitId)?.brandModel}</small></div>,
          <div key="dates">{dateLabel(contract.startDate)}<small className="cell-sub">s.d. {dateLabel(contract.endDate)}</small></div>,
          money(contract.ratePerHour), <Badge key="status" status={contract.status} />,
          <div className="row-actions" key="actions"><PdfLink kind="sph" id={contract.id} />{canWrite && contract.status === 'active' && <button className="icon-button" aria-label="Revisi kontrak" title="Revisi kontrak" onClick={() => startRevise(contract as unknown as EditableRecord)}><Pencil size={15} />Revisi</button>}{canWrite && contract.status === 'active' && <button className="icon-button green" aria-label="Selesaikan kontrak" title="Selesaikan kontrak" onClick={() => askStatus(contract.id, 'completed')}><CircleCheck size={17} />Selesai</button>}</div>,
        ],
      }));
    }
    if (module === 'timesheets') {
      return data.timesheets.map(t => ({
        id: t.id, search: `${t.date} ${getContract(t.contractId)?.contractNumber} ${getUnit(t.unitId)?.unitCode}`, status: t.status, raw: t,
        cells: [
          <div key="date"><b>{dateLabel(t.date)}</b><small className="cell-sub">{getContract(t.contractId)?.contractNumber} · {timeLabel(t.createdAt)}</small></div>,
          <div key="unit">{getUnit(t.unitId)?.brandModel}<small className="cell-sub">{getUnit(t.unitId)?.unitCode}</small></div>,
          `${Number(t.startHm).toLocaleString('id-ID')} → ${Number(t.endHm).toLocaleString('id-ID')}`,
          <div key="hours"><b>{Number(t.effectiveHours).toLocaleString('id-ID')} jam</b><small className="cell-sub">Kerusakan: {Number(t.breakdownHours)} jam</small></div>,
          <Badge key="status" status={t.status} />,
          operational && t.status === 'pending' ? <div className="row-actions" key="actions"><button className="approve-button" disabled={pending} onClick={() => askStatus(t.id, 'approved')}><Check size={14} />Setujui</button><button className="reject-button" disabled={pending} onClick={() => askStatus(t.id, 'rejected')} title="Tolak catatan" aria-label="Tolak catatan"><X size={15} />Tolak</button></div> : <span className="muted" key="processed">{t.invoiceId ? 'Sudah ditagihkan' : '—'}</span>,
        ],
      }));
    }
    if (module === 'bast') {
      return data.handovers.map(h => {
        const raw = h as unknown as Record<string, boolean>;
        const ok = bastFields.every(k => raw[k]);
        return {
          id: h.id, search: `${h.documentNumber} ${getContract(h.contractId)?.contractNumber}`, status: h.type, raw: h,
          cells: [
            <div key="number"><b className="document-number">{h.documentNumber}</b><small className="cell-sub">Dicatat {dateTimeLabel(h.createdAt)}{h.photoUrls.length > 0 && ` · ${h.photoUrls.length} foto`}</small></div>,
            <div key="contract">{getContract(h.contractId)?.contractNumber}<small className="cell-sub">{getClient(getContract(h.contractId)?.clientId || '')?.companyName}</small></div>,
            dateLabel(h.date), <Badge key="type" status={h.type} />,
            <span key="condition" className={ok ? 'green' : 'amber-text'}>{ok ? 'Seluruh komponen baik' : 'Perlu perhatian'}</span>,
            <div className="row-actions" key="doc"><PdfLink kind="bast" id={h.id} /></div>,
          ],
        };
      });
    }
    if (module === 'invoices') {
      return data.invoices.map(i => {
        const paid = paymentsByInvoice.get(i.id)?.paid || 0;
        const remaining = remainingBalance(i.totalAmount, paid);
        const displayStatus = i.status !== 'paid' && isPastDue(i.dueDate) ? 'overdue' : i.status;
        return {
          id: i.id, search: `${i.invoiceNumber} ${getClient(getContract(i.contractId)?.clientId || '')?.companyName}`, status: displayStatus, raw: i,
          cells: [
            <div key="number"><b className="document-number">{i.invoiceNumber}</b><small className="cell-sub">Terbit {dateLabel(i.issueDate)} · {timeLabel(i.createdAt)}</small></div>,
            <div key="client">{getClient(getContract(i.contractId)?.clientId || '')?.companyName}<small className="cell-sub">{getContract(i.contractId)?.contractNumber}</small></div>,
            <div key="amount"><b>{money(i.totalAmount)}</b><small className="cell-sub">Termasuk PPN {Number(i.taxRate ?? ppnRate)}%{i.status !== 'paid' && paid > 0 && ` · Dibayar ${money(paid)}`}{i.status !== 'paid' && ` · Sisa ${money(remaining)}`}</small></div>,
            dateLabel(i.dueDate), <Badge key="status" status={displayStatus} />,
            <div className="row-actions" key="actions">{['admin', 'finance', 'operations'].includes(data.user.role) && <PdfLink kind="invoice" id={i.id} />}{canWrite && <button className="icon-button green" aria-label={i.status === 'paid' ? `Riwayat pembayaran ${i.invoiceNumber}` : `Catat pembayaran ${i.invoiceNumber}`} title={i.status === 'paid' ? 'Riwayat pembayaran' : 'Catat pembayaran'} onClick={() => setPaying(i)}><Wallet size={16} />{i.status === 'paid' ? 'Riwayat' : 'Bayar'}</button>}</div>,
          ],
        };
      });
    }
    return [];
  }, [module, data, contractsByClient, getUnit, getClient, getContract, canWrite, operational, onlyExpiry, pending, edit, askStatus, startRevise, ppnRate, paymentsByInvoice, warnDays]);

  const filtered = useMemo(() => {
    const q = deferredQuery.toLowerCase();
    return rows
      .filter(r => (status === 'all' || r.status === status) && (category === 'all' || r.category === category) && r.search.toLowerCase().includes(q))
      .sort((a, b) => sortDir === 0 ? 0 : sortDir * collator.compare(a.search, b.search));
  }, [rows, status, category, deferredQuery, sortDir]);

  const statusCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.status, (m.get(r.status) || 0) + 1);
    return m;
  }, [rows]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / 8));
  const currentPage = Math.min(page, pageCount);
  const visible = useMemo(() => filtered.slice((currentPage - 1) * 8, currentPage * 8), [filtered, currentPage]);

  const submit = useCallback((e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setFormErrors(null);
    startTransition(async () => {
      try {
        const result = (module === 'contracts' && revising) ? await reviseContract(form) : (module === 'fleet' && bulk && !editing) ? await bulkCreateFleet(form) : await saveRecord(module, form);
        setToast(result);
        if (!result.success) setFormErrors(result.fieldErrors || null);
        if (result.success) {
          setOpen(false); setEditing(null); setRevising(null); setBulk(false);
          router.refresh();
          if (initialOpen && module === 'timesheets') router.push('/dashboard/timesheets');
        }
      } catch { setToast({ success: false, message: 'Data tidak dapat disimpan. Silakan coba kembali.' }); }
    });
  }, [module, revising, bulk, editing, initialOpen, router]);

  const submitPayment = useCallback(async (form: FormData) => {
    const result = await recordPayment(form);
    setToast(result);
    if (result.success) { setPaying(null); router.refresh(); }
    return result;
  }, [router]);

  const closeRecordModal = useCallback(() => { setOpen(false); setEditing(null); setRevising(null); setFormErrors(null); }, []);
  const guardRecordModal = useCallback((v: boolean) => { if (!pending) setOpen(v); }, [pending]);
  const resetAll = useCallback(async (phrase: string) => {
    const r = await resetDatabase(phrase);
    if (r.success) setResetOpen(false);
    return r;
  }, []);
  const confirmReset = useCallback((phrase: string) => act(() => resetAll(phrase)), [act, resetAll]);

  const sortLabel = sortDir === 1 ? 'A–Z' : sortDir === -1 ? 'Z–A' : 'Urutkan';
  const tabAllLabel = module === 'fleet' ? 'unit' : module === 'clients' ? 'klien' : 'data';
  const searchPlaceholder = module === 'fleet' ? 'kode unit, merek, atau lokasi' : module === 'clients' ? 'nama perusahaan atau penanggung jawab' : 'nomor dokumen atau unit';

  return (
    <div className="module-page page-enter">
      <div className="page-heading">
        <div>
          <div className="eyebrow"><span />RUANG KERJA OPERASIONAL</div>
          <h1>{c.title}</h1>
          <p>{c.description}</p>
        </div>
        {canWrite && module !== 'settings' && (
          <div style={{ display: 'flex', gap: 8, paddingTop: 14 }}>
            {module === 'fleet' && <Button variant="outline" onClick={() => { setEditing(null); setRevising(null); setBulk(true); setFormErrors(null); setOpen(true); }}><Plus size={17} />Tambah Banyak</Button>}
            <Button onClick={() => { setEditing(null); setRevising(null); setBulk(false); setFormErrors(null); setOpen(true); }}><Plus size={17} />{c.add}</Button>
          </div>
        )}
      </div>

      {module === 'fleet' && (
        <>
          <div className="module-stats">
            {['available', 'renting', 'maintenance', 'in_transit'].map(st => (
              <button onClick={() => { setStatus(st); setPage(1); }} key={st} className={status === st ? 'selected' : ''}>
                <Badge status={st} /><strong>{fleetCounts.get(st) || 0}<small>unit</small></strong>
              </button>
            ))}
          </div>
          {fleetGroups.length > 0 && <div className="info-callout"><Info size={19} /><p><b>Komposisi armada: </b>{fleetGroups.map(([k, n]) => `${k} (${n})`).join(' · ')}</p></div>}
          {expiring.length > 0 && (
            <button className="expiry-banner" onClick={() => { setOnlyExpiry(!onlyExpiry); setPage(1); }}>
              <TriangleAlert size={20} />
              <div><b>{expiring.length} unit memerlukan pembaruan dokumen</b><span>SIKO atau asuransi berakhir dalam {warnDays} hari. Segera jadwalkan perpanjangan.</span></div>
              <span className="expiry-link">{onlyExpiry ? 'Tampilkan semua unit' : 'Periksa dokumen'}<ChevronRight size={16} /></span>
            </button>
          )}
        </>
      )}

      {module === 'invoices' && (
        <div className="invoice-stats">
          <div><span>Total Nilai Tagihan</span><strong>{money(invoiceTotals.all)}</strong><small>Seluruh periode · termasuk PPN</small></div>
          <div><span>Pembayaran Diterima</span><strong className="green">{money(invoiceTotals.collected)}</strong><small>{invoiceTotals.paid.length} tagihan lunas</small></div>
          <div><span>Piutang Belum Lunas</span><strong className="orange-text">{money(invoiceTotals.receivable)}</strong><small>{invoiceTotals.unpaid.length} tagihan menunggu pembayaran</small></div>
        </div>
      )}

      {module === 'timesheets' && <div className="info-callout"><Info size={19} /><p><b>{pendingTimesheets} catatan menunggu persetujuan.</b> Hanya jam kerja yang disetujui yang dapat ditagihkan kepada klien.</p></div>}

      {module === 'settings' ? (
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
      ) : (
        <section className="panel module-table-panel">
          <div className="table-tabs">
            <button className={status === 'all' ? 'active' : ''} onClick={() => { setStatus('all'); setPage(1); }}>Semua {tabAllLabel}<span>{rows.length}</span></button>
            {statuses.map(st => <button className={status === st ? 'active' : ''} key={st} onClick={() => { setStatus(st); setPage(1); }}>{labels[st]}<span>{statusCounts.get(st) || 0}</span></button>)}
          </div>
          <div className="table-toolbar">
            <label className="table-search">
              <Search size={17} />
              <input value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} placeholder={`Cari ${searchPlaceholder}...`} aria-label="Cari data" />
              {query && <button onClick={() => setQuery('')} aria-label="Hapus pencarian"><X size={14} /></button>}
            </label>
            <div>
              {module === 'fleet' && (
                <label className="small-select">
                  <Filter size={14} />
                  <select value={category} onChange={e => { setCategory(e.target.value); setPage(1); }} aria-label="Filter kategori">
                    <option value="all">Semua kategori</option>
                    {fleetCategoryOptions.map(cat => <option key={cat}>{cat}</option>)}
                  </select>
                  <ChevronDown size={13} />
                </label>
              )}
              <Button variant="outline" size="sm" onClick={() => setSortDir(d => d === 0 ? 1 : d === 1 ? -1 : 0)} title={sortDir === 0 ? 'Urutkan A–Z' : sortDir === 1 ? 'Urutkan Z–A' : 'Kembalikan urutan awal'}><ArrowUpDown size={14} />{sortLabel}</Button>
            </div>
          </div>
          <div className="table-scroll">
            <table>
              <thead><tr>{headers.map((h, i) => <th key={i} className={i === 0 ? 'col-no' : undefined}>{h}</th>)}</tr></thead>
              <tbody>{visible.map((r, idx) => <tr key={r.id}><td className="col-no">{(currentPage - 1) * 8 + idx + 1}</td>{r.cells.map((cell, i) => <td key={i}>{cell}</td>)}</tr>)}</tbody>
            </table>
            {!visible.length && (
              <div className="empty-state">
                <span><Search size={26} /></span>
                <h3>{query || status !== 'all' ? 'Data tidak ditemukan' : 'Belum ada data'}</h3>
                <p>{query || status !== 'all' ? 'Coba ubah kata kunci atau filter pencarian Anda.' : 'Tambahkan data pertama untuk memulai operasional.'}</p>
                <Button variant="outline" onClick={() => { setQuery(''); setStatus('all'); setCategory('all'); setOnlyExpiry(false); }}>Atur Ulang Filter</Button>
              </div>
            )}
          </div>
          <div className="table-footer">
            <span>Menampilkan {filtered.length ? (currentPage - 1) * 8 + 1 : 0}–{Math.min(currentPage * 8, filtered.length)} dari {filtered.length} data</span>
            <div className="pagination">
              <button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} aria-label="Halaman sebelumnya"><ChevronLeft size={16} /></button>
              {Array.from({ length: pageCount }, (_, i) => <button key={i} className={currentPage === i + 1 ? 'active' : ''} onClick={() => setPage(i + 1)}>{i + 1}</button>)}
              <button disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)} aria-label="Halaman berikutnya"><ChevronRight size={16} /></button>
            </div>
          </div>
        </section>
      )}

      {/* Modal hanya di-mount saat terbuka: state ketikan di dalam form (HM,
          prefix bulk, dsb.) hidup di komponen anak sehingga TIDAK me-render
          ulang tabel di belakangnya. */}
      {open && (
        <RecordModal
          module={module} data={data} editing={editing} revising={revising} bulk={bulk}
          pending={pending} canWrite={canWrite} formErrors={formErrors} ppnRate={ppnRate}
          onOpenChange={guardRecordModal} onCancel={closeRecordModal} onSubmit={submit}
        />
      )}

      {paying && <PaymentsModal invoice={paying} payments={data.payments} onClose={() => setPaying(null)} onPay={submitPayment} />}

      <Modal open={!!confirm} onOpenChange={v => { if (!v && !pending) setConfirm(null); }} title={confirm?.title || 'Konfirmasi'} description={confirm?.text}>
        <div className="form-footer">
          <Button variant="outline" onClick={() => setConfirm(null)} disabled={pending}>Batal</Button>
          <Button disabled={pending} onClick={() => { if (confirm?.optimistic) applyStatus(confirm.optimistic); if (confirm) act(confirm.action); }}>{pending ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}Konfirmasi</Button>
        </div>
      </Modal>

      {resetOpen && <ResetModal pending={pending} onOpenChange={v => { if (!v && !pending) setResetOpen(false); }} onCancel={() => setResetOpen(false)} onReset={confirmReset} />}

      {toast && <div className={`toast ${toast.success ? 'toast-success' : 'toast-error'}`} role="status">{toast.success ? <CircleCheck size={20} /> : <TriangleAlert size={20} />}<span>{toast.message}</span><button onClick={() => setToast(null)} aria-label="Tutup pemberitahuan"><X size={16} /></button></div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal tambah/ubah — komponen terpisah dengan state ketikan lokal.
// Mengetik di sini hanya me-render ulang form, bukan halaman kerja.
// ---------------------------------------------------------------------------
function RecordModal({ module, data, editing, revising, bulk, pending, canWrite, formErrors, ppnRate, onOpenChange, onCancel, onSubmit }: {
  module: string; data: WorkspaceData; editing: EditableRecord | null; revising: EditableRecord | null; bulk: boolean;
  pending: boolean; canWrite: boolean; formErrors: Record<string, string> | null; ppnRate: number;
  onOpenChange: (v: boolean) => void; onCancel: () => void; onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  const c = config[module];
  const warnDays = Number(data.settings.expiryWarningDays ?? 30) || 30;
  const ferr = (n: string) => formErrors?.[n] ? <small className="field-error">{formErrors[n]}</small> : null;
  const { getUnit, getClient } = useLookups(data);
  const [contractId, setContractId] = useState('');
  const [meter, setMeter] = useState({ start: 0, end: 0, breakdown: 0 });
  const [catCustom, setCatCustom] = useState(false);
  const [bPrefix, setBPrefix] = useState('EXC');
  const [bStart, setBStart] = useState(1);
  const [bCount, setBCount] = useState(5);

  const fleetCats = useMemo(() => Array.from(new Set([...fleetCategories, ...data.fleet.map(f => f.category)])), [data.fleet]);
  const selectedContract = useMemo(() => data.contracts.find(x => x.id === contractId), [data.contracts, contractId]);
  const billable = useMemo(() => data.timesheets.filter(t => t.contractId === contractId && t.status === 'approved' && !t.invoiceId).reduce((a, t) => a + Number(t.effectiveHours), 0), [data.timesheets, contractId]);
  const totals = useMemo(() => calcInvoiceTotals(billable, Number(selectedContract?.ratePerHour || 0), ppnRate), [billable, selectedContract, ppnRate]);
  const subtotal = totals.subtotal;
  const revisionHistory = useMemo(() => revising ? data.revisions.filter(r => r.contractId === String(revising.id || '')) : [], [data.revisions, revising]);
  const latestReason = useMemo(() => revisionHistory.slice().sort((a, b) => b.revisionNumber - a.revisionNumber)[0]?.reason || '', [revisionHistory]);

  const title = `${revising ? 'Revisi' : editing ? 'Ubah' : module === 'fleet' && bulk ? 'Tambah Banyak' : module === 'fleet' || module === 'clients' ? 'Tambah' : 'Buat'} ${c.singular}`;

  const field = (name: string, label: string, type = 'text', required = true, extra?: Record<string, string | number>) => (
    <label className="form-field" key={name}>
      <span>{label}{required && <i> *</i>}</span>
      <input name={name} type={type} required={required} defaultValue={editing?.[name] != null ? String(editing[name]) : type === 'date' && required ? todayISO() : undefined} {...extra} />
      {ferr(name)}
    </label>
  );

  const contractOptions = useMemo(() => data.contracts
    .filter(x => module === 'invoices' || x.status === 'active')
    .map(x => <option key={x.id} value={x.id}>{x.contractNumber} — {getClient(x.clientId)?.companyName} ({getUnit(x.unitId)?.unitCode})</option>),
    [data.contracts, module, getClient, getUnit]);

  const selectContract = (
    <label className="form-field span-2">
      <span>Kontrak Sewa <i>*</i></span>
      <select name="contractId" required defaultValue="" onChange={e => setContractId(e.target.value)}>
        <option value="" disabled>Pilih kontrak sewa</option>
        {contractOptions}
      </select>
      {ferr('contractId')}
    </label>
  );

  return (
    <Modal open onOpenChange={onOpenChange} title={title} description="Isian bertanda * wajib dilengkapi. Periksa kembali data sebelum menyimpan." wide>
      <form onSubmit={onSubmit}>
        <input type="hidden" name="id" value={String(editing?.id || revising?.id || '')} />
        <div className="form-grid">
          {module === 'fleet' && (bulk && !editing) ? (
            <>
              <label className="form-field"><span>Prefix Kode <i>*</i></span><input name="prefix" required defaultValue={bPrefix} maxLength={10} onChange={e => setBPrefix(e.target.value.toUpperCase())} placeholder="EXC" />{ferr('prefix')}</label>
              <label className="form-field"><span>Merek / Model <i>*</i></span><input name="brandModel" required placeholder="Komatsu PC200-8" />{ferr('brandModel')}</label>
              <label className="form-field"><span>Nomor Awal <i>*</i></span><input name="startNumber" type="number" required min={1} max={9999} defaultValue={bStart} onChange={e => setBStart(Number(e.target.value))} />{ferr('startNumber')}</label>
              <label className="form-field"><span>Jumlah Unit (1-50) <i>*</i></span><input name="count" type="number" required min={1} max={50} defaultValue={bCount} onChange={e => setBCount(Number(e.target.value))} />{ferr('count')}</label>
              <label className="form-field"><span>Kategori <i>*</i></span><select name="category" defaultValue="Ekskavator" onChange={e => setCatCustom(e.target.value === '__new')}>{fleetCats.map(v => <option key={v}>{v}</option>)}<option value="__new">+ Tambah kategori baru…</option></select>{ferr('category')}</label>
              {catCustom && <label className="form-field"><span>Kategori Baru <i>*</i></span><input name="categoryNew" maxLength={50} placeholder="Contoh: Telehandler" />{ferr('categoryNew')}</label>}
              {field('year', 'Tahun Pembuatan', 'number', true, { min: 1900, max: new Date().getFullYear() + 1, placeholder: '2024' })}
              <label className="form-field"><span>Status Awal <i>*</i></span><select name="status" defaultValue="available">{['available', 'maintenance', 'in_transit'].map(v => <option value={v} key={v}>{labels[v]}</option>)}</select>{ferr('status')}</label>
              {field('hourlyRate', 'Tarif per Jam (Rp)', 'number', true, { min: 1, step: '0.01', placeholder: '350000' })}
              {field('currentLocation', 'Lokasi Saat Ini', 'text', false)}
              {field('sikoExpiry', 'Tanggal Berakhir SIKO', 'date', false)}
              {field('insuranceExpiry', 'Tanggal Berakhir Asuransi', 'date', false)}
              <div className="info-callout span-2"><Info size={18} /><p>Kode dibuat otomatis: <b>{bPrefix || 'EXC'}-{String(bStart || 1).padStart(3, '0')} s.d. {bPrefix || 'EXC'}-{String((bStart || 1) + (bCount || 1) - 1).padStart(3, '0')}</b> ({bCount || 1} unit, satu baris = satu fisik). Kode duplikat dilewati otomatis.</p></div>
            </>
          ) : module === 'fleet' && (
            <>
              {field('unitCode', 'Kode Unit', 'text', true, { placeholder: 'Contoh: EXC-025' })}
              {field('brandModel', 'Merek / Model', 'text', true, { placeholder: 'Contoh: Komatsu PC200-8' })}
              <label className="form-field"><span>Kategori <i>*</i></span><select name="category" defaultValue={String(editing?.category || 'Ekskavator')} onChange={e => setCatCustom(e.target.value === '__new')}>{fleetCats.map(v => <option key={v}>{v}</option>)}<option value="__new">+ Tambah kategori baru…</option></select>{ferr('category')}</label>
              {catCustom && <label className="form-field"><span>Kategori Baru <i>*</i></span><input name="categoryNew" maxLength={50} placeholder="Contoh: Telehandler" />{ferr('categoryNew')}</label>}
              {field('year', 'Tahun Pembuatan', 'number', true, { min: 1900, max: new Date().getFullYear() + 1, placeholder: '2024' })}
              <label className="form-field"><span>Status Unit <i>*</i></span><select name="status" defaultValue={String(editing?.status || 'available')}>{['available', ...(editing?.status === 'renting' ? ['renting'] : []), 'maintenance', 'in_transit'].map(v => <option value={v} key={v}>{labels[v]}</option>)}</select>{ferr('status')}</label>
              {field('hourlyRate', 'Tarif per Jam (Rp)', 'number', true, { min: 1, step: '0.01', placeholder: '350000' })}
              {field('currentLocation', 'Lokasi Saat Ini', 'text', false)}
              {field('sikoExpiry', 'Tanggal Berakhir SIKO', 'date', false)}
              {field('insuranceExpiry', 'Tanggal Berakhir Asuransi', 'date', false)}
              {editing && isExpiringFleet(editing as unknown as FleetRow, warnDays) && <div className="info-callout span-2"><TriangleAlert size={18} /><p>Dokumen unit mendekati atau telah melewati masa berlaku. Perbarui tanggal setelah perpanjangan selesai.</p></div>}
            </>
          )}

          {module === 'clients' && (
            <>
              {field('companyName', 'Nama Perusahaan', 'text', true, { placeholder: 'PT Nama Perusahaan' })}
              {field('npwp', 'NPWP', 'text', false)}
              {field('picName', 'Nama Penanggung Jawab')}
              {field('picPhone', 'Nomor Telepon', 'tel', false)}
              {field('picEmail', 'Surel Penanggung Jawab', 'email', false)}
              <label className="form-field span-2"><span>Alamat Perusahaan</span><textarea name="address" defaultValue={String(editing?.address || '')} placeholder="Alamat lengkap perusahaan" />{ferr('address')}</label>
            </>
          )}

          {module === 'contracts' && revising ? (
            <>
              <div className="info-callout span-2"><Info size={18} /><p>Merevisi <b>{String(revising.contractNumber || '')}</b> — {getClient(String(revising.clientId || ''))?.companyName || ''}. Tarif baru hanya berlaku untuk jam yang belum ditagihkan; jam yang sudah masuk invoice tidak berubah.</p></div>
              <label className="form-field span-2"><span>Unit Alat Berat <i>*</i></span><select name="unitId" required defaultValue={String(revising.unitId || '')}>{data.fleet.filter(f => f.status === 'available' || f.id === String(revising.unitId || '')).map(f => <option key={f.id} value={f.id}>{f.unitCode} — {f.brandModel} ({f.status === 'available' ? 'Tersedia' : 'Terpakai kontrak ini'} · {money(f.hourlyRate)}/jam)</option>)}</select>{ferr('unitId')}</label>
              <label className="form-field"><span>Tanggal Mulai <i>*</i></span><input name="startDate" type="date" required defaultValue={String(revising.startDate || '').slice(0, 10)} />{ferr('startDate')}</label>
              <label className="form-field"><span>Tanggal Selesai <i>*</i></span><input name="endDate" type="date" required defaultValue={String(revising.endDate || '').slice(0, 10)} />{ferr('endDate')}</label>
              <label className="form-field"><span>Tarif Sewa per Jam (Rp) <i>*</i></span><input name="ratePerHour" type="number" required min={1} step="0.01" defaultValue={String(revising.ratePerHour || '')} />{ferr('ratePerHour')}</label>
              <label className="form-field"><span>Periode &amp; Tarif Saat Ini</span><input disabled value={`${dateLabel(String(revising.startDate || ''))} s.d. ${dateLabel(String(revising.endDate || ''))} · ${money(String(revising.ratePerHour || 0))}`} /></label>
              <label className="form-field span-2"><span>Alasan Revisi <i>*</i></span><textarea name="reason" required minLength={10} maxLength={500} placeholder="Contoh: Perpanjangan 2 minggu sesuai permintaan klien + penyesuaian tarif lembur" />{ferr('reason')}</label>
              {revisionHistory.length > 0 && (
                <div className="invoice-preview span-2">
                  <h4>Riwayat Amandemen ({revisionHistory.length})</h4>
                  {revisionHistory.map(r => <div key={r.id}><span>Rev {r.revisionNumber} · {dateLabel(r.createdAt)}</span><b>{money(r.prevRate)} → {money(r.newRate)}</b></div>)}
                  <div><span>Alasan terakhir</span><b>{latestReason}</b></div>
                </div>
              )}
              <div className="info-callout span-2"><Info size={18} /><p>Periode baru tidak boleh memotong tanggal timesheet tercatat. Ganti unit ditolak bila timesheet sudah ada — buat kontrak baru bila unit berganti di tengah jalan.</p></div>
            </>
          ) : module === 'contracts' && (
            <>
              {field('contractNumber', 'Nomor Kontrak', 'text', false, { placeholder: 'Dibuat otomatis apabila dikosongkan' })}
              <label className="form-field"><span>Klien <i>*</i></span><select required name="clientId" defaultValue=""><option value="" disabled>Pilih perusahaan klien</option>{data.clients.map(x => <option key={x.id} value={x.id}>{x.companyName}</option>)}</select>{ferr('clientId')}</label>
              <label className="form-field span-2"><span>Unit Tersedia <i>*</i></span><select name="unitId" required defaultValue=""><option value="" disabled>Pilih unit yang tersedia</option>{data.fleet.filter(f => f.status === 'available').map(f => <option key={f.id} value={f.id}>{f.unitCode} — {f.brandModel} ({money(f.hourlyRate)}/jam)</option>)}</select>{ferr('unitId')}</label>
              {field('startDate', 'Tanggal Mulai', 'date')}
              {field('endDate', 'Tanggal Selesai', 'date')}
              {field('ratePerHour', 'Tarif Sewa per Jam (Rp)', 'number', true, { min: 1, step: '0.01', placeholder: '350000' })}
              <div className="info-callout span-2"><Info size={18} /><p>Kontrak yang disimpan langsung aktif. Status unit akan berubah menjadi Disewa.</p></div>
            </>
          )}

          {module === 'timesheets' && (
            <>
              {selectContract}
              {field('date', 'Tanggal Operasional', 'date', true, { max: todayISO() })}
              <div />
              {[['startHm', 'HM Awal', 'start'], ['endHm', 'HM Akhir', 'end'], ['breakdownHours', 'Durasi Kerusakan (Jam)', 'breakdown']].map(([name, label, key]) => (
                <label className="form-field" key={name}>
                  <span>{label} <i>*</i></span>
                  <input name={name} type="number" required min="0" step="0.01" defaultValue={key === 'breakdown' ? '0' : undefined} onChange={e => setMeter({ ...meter, [key]: Number(e.target.value) })} />
                  {ferr(name)}
                </label>
              ))}
              <div className="effective-hours"><span>Total Jam Efektif</span><strong>{Math.max(0, meter.end - meter.start - meter.breakdown).toLocaleString('id-ID')} <small>jam</small></strong></div>
              <label className="form-field span-2"><span>Catatan Pekerjaan</span><textarea name="notes" placeholder="Uraian pekerjaan, kendala, atau informasi tambahan" /></label>
              <div className="info-callout span-2"><Info size={18} /><p>Catatan akan diajukan kepada Manajer Operasional untuk persetujuan.</p></div>
            </>
          )}

          {module === 'bast' && (
            <>
              {selectContract}
              <label className="form-field"><span>Jenis Serah Terima <i>*</i></span><select name="type"><option value="mobilization">Mobilisasi — Penyerahan Unit</option><option value="demobilization">Demobilisasi — Pengembalian Unit</option></select>{ferr('type')}</label>
              {field('date', 'Tanggal Serah Terima', 'date')}
              <div className="inspection-checklist span-2">
                <h4>Daftar Pemeriksaan Unit (12 titik)</h4>
                <p>Centang komponen yang telah diperiksa dan dinyatakan dalam kondisi baik.</p>
                {bastItems.map(([name, label, desc]) => <label key={name}><input type="checkbox" name={name} defaultChecked /><span><b>{label}</b><small>{desc}</small></span></label>)}
              </div>
              <div className="span-2"><PhotoUploader errors={formErrors} /></div>
              <label className="form-field span-2"><span>Catatan Pemeriksaan</span><textarea name="notes" placeholder="Catat kerusakan, kelengkapan, atau hal yang perlu ditindaklanjuti" /></label>
            </>
          )}

          {module === 'invoices' && (
            <>
              {selectContract}
              {field('dueDate', 'Tanggal Jatuh Tempo', 'date', true, { min: todayISO() })}
              <div className="invoice-preview span-2">
                <h4>Ringkasan Tagihan</h4>
                <div><span>Jam kerja disetujui, belum ditagihkan</span><b>{billable.toLocaleString('id-ID')} jam</b></div>
                <div><span>Tarif sewa per jam</span><b>{money(selectedContract?.ratePerHour || 0)}</b></div>
                <hr />
                <div><span>Subtotal</span><b>{money(subtotal)}</b></div>
                <div><span>PPN {ppnRate}%</span><b>{money(totals.tax)}</b></div>
                <div className="invoice-total"><span>Total Tagihan</span><b>{money(totals.total)}</b></div>
              </div>
              <div className="info-callout span-2"><ShieldCheck size={18} /><p>Jam kerja yang sudah ditagihkan tidak akan ditagihkan kembali. Dokumen PDF tersedia setelah tagihan berhasil dibuat.</p></div>
            </>
          )}
        </div>
        <div className="form-footer">
          <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>Batal</Button>
          <Button type="submit" disabled={pending || !canWrite || (module === 'invoices' && billable <= 0)}>
            {pending ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}{' '}
            {pending ? 'Menyimpan...' : module === 'timesheets' ? 'Ajukan Catatan' : module === 'invoices' ? 'Terbitkan Tagihan' : module === 'contracts' && revising ? 'Simpan Revisi' : module === 'fleet' && bulk && !editing ? `Tambah ${bCount} Unit` : 'Simpan Data'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Modal reset database — frasa konfirmasi lokal, parent tidak ikut render.
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

// ---------------------------------------------------------------------------
// Modal pembayaran invoice — riwayat + pencatatan (penuh maupun cicilan).
// Status dihitung server dari akumulasi: paid / partial / overdue.
// ---------------------------------------------------------------------------
function PaymentsModal({ invoice, payments, onClose, onPay }: {
  invoice: WorkspaceData['invoices'][number];
  payments: WorkspaceData['payments'];
  onClose: () => void;
  onPay: (form: FormData) => Promise<{ success: boolean; message: string; fieldErrors?: Record<string, string> }>;
}) {
  const history = useMemo(() => payments.filter(p => p.invoiceId === invoice.id), [payments, invoice.id]);
  const paid = history.reduce((a, p) => a + Number(p.amount), 0);
  const remaining = Math.max(0, Number(invoice.totalAmount) - paid);
  const settled = invoice.status === 'paid' || remaining <= 0;
  const [errors, setErrors] = useState<Record<string, string> | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onOpenChange={v => { if (!v && !busy) onClose(); }} title={`Pembayaran ${invoice.invoiceNumber}`} description="Riwayat pembayaran tercatat dan pencatatan pembayaran baru." wide>
      <form onSubmit={async e => {
        e.preventDefault();
        setErrors(null);
        setBusy(true);
        try {
          const r = await onPay(new FormData(e.currentTarget));
          if (!r.success) setErrors(r.fieldErrors || null);
        } finally { setBusy(false); }
      }}>
        <input type="hidden" name="invoiceId" value={invoice.id} />
        <div className="form-grid">
          <div className="invoice-preview span-2">
            <h4>Ringkasan Tagihan</h4>
            <div><span>Total tagihan</span><b>{money(invoice.totalAmount)}</b></div>
            <div><span>Sudah dibayar</span><b>{money(paid)}</b></div>
            <div className="invoice-total"><span>Sisa tagihan</span><b>{money(remaining)}</b></div>
          </div>
          {history.length > 0 && (
            <div className="invoice-preview span-2">
              <h4>Riwayat Pembayaran ({history.length})</h4>
              {history.map(p => <div key={p.id}><span>{dateLabel(p.paidAt)} · {labels[p.method]}{p.reference ? ` · ${p.reference}` : ''}</span><b>{money(p.amount)}</b></div>)}
            </div>
          )}
          {!settled && (
            <>
              <label className="form-field"><span>Nominal (Rp) <i>*</i></span><input name="amount" type="number" required min={0.01} step="0.01" defaultValue={remaining.toFixed(2)} />{errors?.amount && <small className="field-error">{errors.amount}</small>}</label>
              <label className="form-field"><span>Metode <i>*</i></span><select name="method" defaultValue="transfer">{['transfer', 'cash', 'giro', 'other'].map(m => <option key={m} value={m}>{labels[m]}</option>)}</select>{errors?.method && <small className="field-error">{errors.method}</small>}</label>
              <label className="form-field"><span>Tanggal Bayar <i>*</i></span><input name="paidAt" type="date" required defaultValue={todayISO()} max={todayISO()} />{errors?.paidAt && <small className="field-error">{errors.paidAt}</small>}</label>
              <label className="form-field"><span>Referensi</span><input name="reference" maxLength={100} placeholder="No. bukti / keterangan" />{errors?.reference && <small className="field-error">{errors.reference}</small>}</label>
              <div className="info-callout span-2"><Info size={18} /><p>Pembayaran sebagian mengubah status menjadi <b>Dibayar Sebagian</b>. Tagihan lunas otomatis saat akumulasi mencapai total.</p></div>
            </>
          )}
        </div>
        <div className="form-footer">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Tutup</Button>
          {!settled && <Button type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}{busy ? 'Menyimpan...' : 'Catat Pembayaran'}</Button>}
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Pengunggah foto BAST — berkas langsung ke Storage privat, path-nya
// disimpan ke hidden input `photoUrls` (JSON) untuk ikut form BAST.
// ---------------------------------------------------------------------------
function PhotoUploader({ errors }: { errors: Record<string, string> | null }) {
  const [photos, setPhotos] = useState<{ path: string; url: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setError('');
    const list = Array.from(files).slice(0, 6 - photos.length);
    if (!list.length) { setError('Maksimal 6 foto per BAST.'); return; }
    setUploading(true);
    try {
      for (const file of list) {
        if (!file.type.startsWith('image/')) throw new Error('Hanya berkas gambar yang diizinkan.');
        if (file.size > 5 * 1024 * 1024) throw new Error(`"${file.name}" melebihi 5 MB.`);
        const body = new FormData();
        body.set('file', file);
        const res = await fetch('/api/bast-photos', { method: 'POST', body });
        const json = await res.json().catch(() => ({} as { path?: string; message?: string }));
        if (!res.ok || !json.path) throw new Error(json.message || 'Unggahan gagal.');
        const url = URL.createObjectURL(file);
        setPhotos(prev => [...prev, { path: json.path as string, url }]);
      }
    } catch (e) { setError((e as Error).message); }
    setUploading(false);
  };
  const remove = (path: string) => setPhotos(prev => {
    const target = prev.find(p => p.path === path);
    if (target) URL.revokeObjectURL(target.url);
    return prev.filter(p => p.path !== path);
  });
  return (
    <div className="form-field">
      <span><ImagePlus size={15} style={{ display: 'inline', verticalAlign: -2 }} /> Lampiran Foto (maks 6, @5 MB)</span>
      <input type="hidden" name="photoUrls" value={JSON.stringify(photos.map(p => p.path))} />
      <input type="file" accept="image/*" multiple disabled={uploading} onChange={e => { add(e.target.files); e.target.value = ''; }} aria-label="Unggah foto BAST" />
      {uploading && <small className="cell-sub">Mengunggah...</small>}
      {(error || errors?.photos) && <small className="field-error">{error || errors?.photos}</small>}
      {photos.length > 0 && (
        <div className="photo-thumbs">
          {photos.map(p => (
            <span className="photo-thumb" key={p.path}>
              {/* eslint-disable-next-line @next/next/no-img-element -- pratinjau object-URL lokal, bukan aset remote */}
              <img src={p.url} alt="Lampiran BAST" />
              <button type="button" onClick={() => remove(p.path)} aria-label="Hapus foto"><X size={13} /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
