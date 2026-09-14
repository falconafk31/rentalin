'use client';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, memo } from 'react';
import { useRouter } from 'next/navigation';
import { History,  Search, Plus, ChevronDown, ChevronLeft, ChevronRight, ArrowUpDown, Pencil, Trash2, FileDown, Check, X, TriangleAlert, LoaderCircle, CircleCheck, Building2, Filter, Info, ShieldCheck, Wallet, ImagePlus, ClipboardCheck, HardHat } from 'lucide-react';
import { EquipmentIcon } from './icons';
import { Button } from './ui/button';
import { Modal } from './ui/dialog';
import { Badge } from './overview';
import { saveRecord, bulkCreateFleet, changeStatus, deleteClient, reviseContract, recordPayment, getFormOptions, getRevisionHistory, getBillableHours, getInvoicePayments, getFleetMedia, requestFleetPhotoUpload, completeFleetPhotoUpload, deleteFleetPhoto, deleteOperator, getFleetUnitHistory, type FleetUnitHistory } from '@/app/actions';
import type { FormOptionsData, FleetMediaData } from '@/app/actions';
import { compressImage, putToPresignedUrl } from '@/lib/image-compress';
import { money, dateLabel, dateTimeLabel, timeLabel, labels, todayISO, isPastDue, isExpiringSoon } from '@/lib/format';
import type { ModulePageData, ModuleRow, FleetRow, ClientRow, OperatorRow, ContractRow, TimesheetRow, HandoverRow, InvoiceRow, PaymentRow, CompanySettings, ModuleFilters } from '@/lib/data';
import { MODULE_PAGE_SIZE } from '@/lib/pagination';
import { calcInvoiceTotals, remainingBalance } from '@/lib/finance';

// G6 (audit 02): label tombol submit hidup di config — modul baru cukup
// tambah 1 baris, bukan mengedit rantai ternary di form.
const config: Record<string, { title: string; description: string; add: string; singular: string; submit: string }> = {
  fleet: { title: 'Armada Alat Berat', description: 'Kelola seluruh unit, pantau ketersediaan, dan pastikan kesiapan armada Anda.', add: 'Tambah Unit', singular: 'Unit Alat Berat', submit: 'Simpan Data' },
  clients: { title: 'Data Klien', description: 'Kelola hubungan bisnis dan informasi perusahaan mitra Anda.', add: 'Tambah Klien', singular: 'Klien', submit: 'Simpan Data' },
  operators: { title: 'Operator & Driver', description: 'Kelola data operator: SIO/SIM, masa berlaku lisensi, dan tarif per jam atau per hari.', add: 'Tambah Operator', singular: 'Operator', submit: 'Simpan Data' },
  contracts: { title: 'Kontrak Sewa', description: 'Kelola kesepakatan sewa, penugasan unit, dan periode kontrak.', add: 'Buat Kontrak', singular: 'Kontrak Sewa', submit: 'Simpan Data' },
  timesheets: { title: 'Timesheet Harian', description: 'Pantau jam kerja alat berat dan kelola persetujuan catatan operator.', add: 'Catat Jam Kerja', singular: 'Catatan Kerja Harian', submit: 'Ajukan Catatan' },
  bast: { title: 'Berita Acara Serah Terima', description: 'Dokumentasikan kondisi unit saat mobilisasi dan demobilisasi.', add: 'Buat BAST', singular: 'Berita Acara Serah Terima', submit: 'Simpan Data' },
  invoices: { title: 'Penagihan', description: 'Terbitkan tagihan dari jam kerja yang disetujui dan pantau pembayaran.', add: 'Buat Invoice', singular: 'Tagihan Sewa', submit: 'Terbitkan Tagihan' },
};

const tableMeta: Record<string, { headers: string[]; statuses: string[] }> = {
  fleet: { headers: ['No', 'Unit Alat Berat', 'Kategori / Tahun', 'Lokasi Saat Ini', 'Tarif per Jam', 'Status', 'Tindakan'], statuses: ['available', 'renting', 'maintenance', 'in_transit'] },
  clients: { headers: ['No', 'Perusahaan', 'NPWP', 'Penanggung Jawab', 'Kontak', 'Kontrak', 'Tindakan'], statuses: [] },
  operators: { headers: ['No', 'Operator', 'SIO / Lisensi', 'Tarif', 'Log Kerja', 'Status', 'Tindakan'], statuses: ['active', 'inactive'] },
  contracts: { headers: ['No', 'Nomor Kontrak', 'Klien / Unit', 'Periode Sewa', 'Tarif per Jam', 'Status', 'Tindakan'], statuses: ['active', 'draft', 'completed'] },
  timesheets: { headers: ['No', 'Tanggal / Kontrak', 'Unit Alat Berat', 'HM Awal → Akhir', 'Jam Efektif', 'Status', 'Persetujuan'], statuses: ['pending', 'approved', 'rejected'] },
  bast: { headers: ['No', 'Nomor Dokumen', 'Kontrak / Klien', 'Tanggal Serah Terima', 'Jenis', 'Kondisi Unit', 'Dokumen'], statuses: ['mobilization', 'demobilization'] },
  invoices: { headers: ['No', 'Nomor Tagihan', 'Klien / Kontrak', 'Total Tagihan', 'Jatuh Tempo', 'Status', 'Tindakan'], statuses: ['unpaid', 'paid', 'overdue', 'partial'] },
};

const bastFields = ['engine', 'hydraulics', 'tracks', 'oil', 'fuel', 'battery', 'lights', 'brakes', 'bucket', 'cabin', 'safety', 'documents'];
const fleetCategories = ['Ekskavator', 'Buldozer', 'Vibro Roller', 'Crane', 'Wheel Loader', 'Motor Grader', 'Dump Truck'];
const bastItems: [string, string, string][] = [['engine', 'Mesin', 'Mesin menyala normal, tidak ada kebocoran atau suara abnormal.'], ['hydraulics', 'Sistem Hidraulik', 'Tekanan stabil, selang dan silinder tanpa rembes.'], ['tracks', 'Rantai / Roda', 'Track shoe / ban, sprocket, dan roller kondisi baik.'], ['oil', 'Oli & Cairan', 'Level oli mesin, coolant, dan oli hidraulik aman.'], ['fuel', 'Bahan Bakar', 'Level BBM tercatat, tutup tangki dan selang baik.'], ['battery', 'Aki & Starter', 'Starter tokcer, terminal aki bersih dan kencang.'], ['lights', 'Lampu & Klakson', 'Lampu kerja, beacon, klakson, dan alarm mundur berfungsi.'], ['brakes', 'Rem & Kemudi', 'Rem dan kemudi responsif, tanpa speleng berlebih.'], ['bucket', 'Bucket / Attachment', 'Bucket / blade, gigi, pin, dan bushing tidak retak.'], ['cabin', 'Kabin & Kaca', 'Kabin / ROPS, jok, sabuk, spion, kaca, dan wiper baik.'], ['safety', 'APAR & P3K', 'APAR, kotak P3K, dan perlengkapan darurat tersedia.'], ['documents', 'SIKO & Dokumen', 'SIKO / SILO, STNK / KIR, dan catatan HM difoto.']];

type EditableRecord = Record<string, string | number | boolean | string[] | Date | null>;
// Baris fleet dari server (+ coverUrl signed URL opt., doc §46).
type FleetRowUi = FleetRow & { coverUrl?: string | null };
type OperatorRowUi = OperatorRow;
type Row = { id: string; status: string; cells: React.ReactNode[]; raw: EditableRecord };
type RevisionRow = Awaited<ReturnType<typeof getRevisionHistory>>[number];

// Ambang peringatan (hari) kini konfigurasi, bukan hardcode 30 — perbandingan
// memakai aritmetika kalender TZ-aman agar tidak geser ±1 hari di WIB.
const isExpiringFleet = (f: Pick<FleetRow, 'sikoExpiry' | 'insuranceExpiry'>, warnDays = 30, tz?: string) =>
  [f.sikoExpiry, f.insuranceExpiry].some(d => isExpiringSoon(d, warnDays, tz));

function PdfLink({ kind, id, label = 'Unduh', title = 'Unduh dokumen PDF' }: { kind: string; id: string; label?: string; title?: string }) {
  return <a className="icon-button" href={`/api/documents/${kind}/${id}`} target="_blank" rel="noreferrer" title={title} aria-label={title}><FileDown size={17} />{label}</a>;
}

// ---------------------------------------------------------------------------
// O-A (paginasi server-side): tabel TIDAK lagi menerima seluruh koleksi modul —
// server (getModulePage) sudah mencari (?q), memfilter (?status/?category/
// ?filter=expiring), mengurutkan (?sort), dan memotong MODULE_PAGE_SIZE baris per halaman (?page).
// State filter hidup di URL: ketikan di-debounce 300 ms (input tetap responsif,
// daftar menyusul dari server lewat transisi), tab/pager/sort langsung navigasi.
// Label baris (klien/unit/kontrak) sudah di-JOIN di server sehingga lookup
// client (Map .find O(n²)) dihapus, dan label opsional modal (daftar kontrak,
// unit, klien, riwayat revisi/pembayaran) diambil ASYNC saat modal dibuka —
// bukan lagi dikirim utuh di payload halaman.
// ---------------------------------------------------------------------------

// Pager berjendela: jumlah halaman kini bisa ratusan (seluruh DB), jadi tampilkan
// 1 … sekitar-halaman-aktif … N (±7 tombol) — bukan satu tombol per halaman.
function pageItems(current: number, count: number): (number | 'gap')[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const items: (number | 'gap')[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(count - 1, current + 1);
  if (start > 2) items.push('gap');
  for (let p = start; p <= end; p++) items.push(p);
  if (end < count - 1) items.push('gap');
  items.push(count);
  return items;
}

// G1 (audit 02): satu pola ringkasan di atas tabel untuk semua modul — kartu
// .module-stats; klik = filter status bila modul punya filter (fleet), statis
// bila murni ringkasan angka (invoices). Modul tanpa ringkasan tak me-render ini.
function ModuleSummary({ items }: { items: { key: string; label: React.ReactNode; value: React.ReactNode; sub?: string; tone?: string; active?: boolean; onSelect?: () => void; onHover?: () => void }[] }) {
  if (!items.length) return null;
  return (
    <div className={`module-stats${items.length === 3 ? ' cols-3' : ''}`}>
      {items.map(it => it.onSelect ? (
        <button onClick={it.onSelect} onMouseEnter={it.onHover} onFocus={it.onHover} key={it.key} className={it.active ? 'selected' : ''}>
          {it.label}<strong>{it.value}{it.sub && <small>{it.sub}</small>}</strong>
        </button>
      ) : (
        <div key={it.key}><span>{it.label}</span><strong className={it.tone}>{it.value}</strong>{it.sub && <small>{it.sub}</small>}</div>
      ))}
    </div>
  );
}

export function ModuleWorkspace({ module, data, filters, initialOpen = false, initialOptions = null }: { module: string; data: ModulePageData; filters: ModuleFilters; initialOpen?: boolean; initialOptions?: FormOptionsData | null }) {
  const router = useRouter();
  // Baris tabel selalu dari server (data.rows). Update optimistik status
  // dihapus (bug: crash sesaat setelah Setujui sebelum refresh) — status
  // diperbarui via router.refresh() setelah Server Action sukses.
  const optRows = data.rows;
  const ppnRate = Number(data.settings.ppnRate ?? 11);
  const warnDays = Number(data.settings.expiryWarningDays ?? 30) || 30;
  const tz = data.settings.timezone;
  const c = config[module];
  const { headers, statuses } = tableMeta[module];

  // State ketikan pencarian tetap lokal (input responsif); nilai resminya di URL.
  const [query, setQuery] = useState(filters.q);
  const [syncedQ, setSyncedQ] = useState(filters.q);
  if (syncedQ !== filters.q) { setSyncedQ(filters.q); setQuery(filters.q); }
  // P6 (audit 01): tab status & filter kategori optimistik — highlight berganti
  // seketika saat diklik (statusCounts sudah tersedia), tidak menunggu respons
  // server; nilai resmi tetap disinkronkan dari filters (echo server).
  const [optStatus, setOptStatus] = useState(filters.status);
  const [syncedStatus, setSyncedStatus] = useState(filters.status);
  if (syncedStatus !== filters.status) { setSyncedStatus(filters.status); setOptStatus(filters.status); }
  const [optCategory, setOptCategory] = useState(filters.category);
  const [syncedCategory, setSyncedCategory] = useState(filters.category);
  if (syncedCategory !== filters.category) { setSyncedCategory(filters.category); setOptCategory(filters.category); }
  const [open, setOpen] = useState(initialOpen);
  const [editing, setEditing] = useState<EditableRecord | null>(null);
  const [toast, setToast] = useState<{ success: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  // P3: penanda apakah transisi berjalan berasal dari perubahan tab/filter besar
  // (tampilkan skeleton) atau aksi kecil (pager/sort/simpan — cukup dim).
  const [bigNav, setBigNav] = useState(false);
  const [confirm, setConfirm] = useState<{ title: string; text: string; action: () => Promise<{ success: boolean; message: string }> } | null>(null);
  const [bulk, setBulk] = useState(false);
  const [revising, setRevising] = useState<EditableRecord | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string> | null>(null);
  const [paying, setPaying] = useState<InvoiceRow | null>(null);
  const [history, setHistory] = useState<FleetUnitHistory | null | 'loading'>(null);
  const openHistory = (unitId: string) => { setHistory('loading'); getFleetUnitHistory(unitId).then(h => setHistory('error' in h ? null : h)).catch(() => setHistory(null)); };

  // Select async (O-A): opsi referensi modal + riwayat revisi/pembayaran
  // diambil tepat saat dibutuhkan, bukan dikirim utuh di payload halaman.
  const [formOptions, setFormOptions] = useState<FormOptionsData | null>(initialOptions);
  const [revisions, setRevisions] = useState<RevisionRow[] | null>(null);
  const [payments, setPayments] = useState<PaymentRow[] | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 5500); return () => clearTimeout(t); } }, [toast]);

  // P1 (audit 01): URL target navigasi dibangun satu fungsi agar pager/sort/tab
  // bisa mem-PREFETCH payload RSC saat hover/focus — klik berikutnya mulai dari
  // cache, bukan nunggu round-trip penuh.
  const buildUrl = useCallback((patch: Record<string, string | number | null>) => {
    const params = new URLSearchParams();
    if (filters.q) params.set('q', filters.q);
    if (filters.status !== 'all') params.set('status', filters.status);
    if (filters.category !== 'all') params.set('category', filters.category);
    if (filters.sort !== 0) params.set('sort', String(filters.sort));
    if (filters.expiringOnly) params.set('filter', 'expiring');
    if (filters.page > 1) params.set('page', String(filters.page));
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === '' || value === 'all') params.delete(key);
      else params.set(key, String(value));
    }
    const qs = params.toString();
    return `/dashboard/${module}${qs ? `?${qs}` : ''}`;
  }, [filters.q, filters.status, filters.category, filters.sort, filters.expiringOnly, filters.page, module]);

  const navigate = useCallback((patch: Record<string, string | number | null>, replace = false) => {
    // P3: navigasi tab/filter besar menampilkan skeleton baris; pager/sort/search tidak.
    setBigNav('status' in patch || 'category' in patch || 'filter' in patch);
    const url = buildUrl(patch);
    startTransition(() => { if (replace) router.replace(url, { scroll: false }); else router.push(url, { scroll: false }); });
  }, [buildUrl, router, startTransition]);

  const prefetch = useCallback((patch: Record<string, string | number | null>) => {
    router.prefetch(buildUrl(patch));
  }, [buildUrl, router]);

  // Pencarian tabel: input instan, navigasi ?q= menunggu 300 ms setelah ketikan
  // terakhir (debounce) dan memakai replace agar riwayat tidak menumpuk.
  const onSearchInput = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => navigate({ q: value, page: null }, true), 300);
  }, [navigate]);

  const loadOptions = useCallback(async (opts?: { editingUnitId?: string; contractId?: string }) => {
    setFormOptions(null);
    setRevisions(null);
    try {
      const [options, revisionRows] = await Promise.all([
        getFormOptions(module, opts?.editingUnitId),
        opts?.contractId ? getRevisionHistory(opts.contractId) : Promise.resolve(null),
      ]);
      setFormOptions(options);
      setRevisions(revisionRows);
    } catch {
      setFormOptions({ contracts: [], clients: [], fleet: [] });
      setRevisions([]);
    }
  }, [module]);

  const openCreate = useCallback(() => {
    setEditing(null); setRevising(null); setBulk(false); setFormErrors(null); setOpen(true);
    if (module === 'contracts' || module === 'timesheets' || module === 'bast' || module === 'invoices') void loadOptions();
  }, [module, loadOptions]);
  const openBulk = useCallback(() => {
    setEditing(null); setRevising(null); setBulk(true); setFormErrors(null); setOpen(true);
  }, []);

  const operational = ['admin', 'operations'].includes(data.user.role);
  const canWrite = module === 'invoices' ? ['admin', 'finance'].includes(data.user.role) : module === 'timesheets' ? ['admin', 'operations', 'operator'].includes(data.user.role) : operational;

  const act = useCallback((fn: () => Promise<{ success: boolean; message: string }>) => startTransition(async () => {
    setBigNav(false); // aksi (setujui/bayar/hapus) bukan navigasi: jangan tampilkan skeleton
    try {
      const result = await fn();
      setToast(result);
      if (result.success) setConfirm(null);
      router.refresh();
    } catch { setToast({ success: false, message: 'Koneksi gagal. Silakan coba kembali.' }); router.refresh(); }
  }), [router]);

  const edit = useCallback((record: EditableRecord) => { setEditing(record); setRevising(null); setBulk(false); setFormErrors(null); setOpen(true); }, []);
  const startRevise = useCallback((contract: EditableRecord) => {
    setRevising(contract); setEditing(null); setBulk(false); setFormErrors(null); setOpen(true);
    void loadOptions({ editingUnitId: String(contract.unitId || ''), contractId: String(contract.id || '') });
  }, [loadOptions]);
  const askStatus = useCallback((id: string, next: string) => setConfirm({
    title: next === 'paid' ? 'Konfirmasi Pelunasan' : next === 'completed' ? 'Selesaikan Kontrak' : next === 'approved' ? 'Setujui Catatan Kerja' : 'Tolak Catatan Kerja',
    text: next === 'paid' ? 'Pastikan pembayaran telah diterima sebelum menandai tagihan sebagai lunas.' : next === 'completed' ? 'Kontrak akan diselesaikan dan unit akan kembali tersedia untuk disewakan.' : 'Status catatan akan diperbarui. Pastikan jam kerja dan keterangan telah diperiksa.',
    action: () => changeStatus(module, id, next),
  }), [module]);
  const openPayments = useCallback((invoice: InvoiceRow) => {
    setPaying(invoice);
    setPayments(null);
    getInvoicePayments(invoice.id).then(setPayments).catch(() => setPayments([]));
  }, []);

  // Baris tabel: hanya baris halaman aktif — sel JSX dibangun dari data yang
  // sudah dilengkapi label JOIN di server (tanpa lookup per baris).
  const rows: Row[] = useMemo(() => {
    if (module === 'fleet') {
      return (optRows as FleetRowUi[]).map(f => ({
        id: f.id, status: f.status, raw: f as unknown as EditableRecord,
        cells: [
          // Thumbnail cover (doc §11/§46): optimized WebP ≤1600px + signed URL
          // pendek, lazy-loaded — fallback ikon bila unit belum punya foto
          // atau layanan media belum dikonfigurasi.
          <div className="unit-cell" key="unit">{f.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed URL R2 privat, bukan aset next/image
            <span className="unit-photo"><img src={f.coverUrl} alt="" loading="lazy" decoding="async" /></span>
          ) : (
            <span className="unit-icon"><EquipmentIcon /></span>
          )}<span><b>{f.brandModel}</b><small>{f.unitCode}{isExpiringFleet(f, warnDays, tz) && <TriangleAlert size={12} className="amber-text" />}</small></span></div>,
          <div key="category">{f.category}<small className="cell-sub">Tahun {f.year}</small></div>,
          f.currentLocation || '—', money(f.hourlyRate), <Badge status={f.status} key="status" />,
          canWrite ? <div className="row-actions" key="edit"><button className="icon-button" aria-label={`Ubah ${f.unitCode}`} title="Ubah unit" onClick={() => edit(f)}><Pencil size={15} />Ubah</button></div> : <span key="read">—</span>,
        ],
      }));
    }
    if (module === 'clients') {
      return (optRows as ClientRow[]).map(client => ({
        id: client.id, status: 'all', raw: client as unknown as EditableRecord,
        cells: [
          <div className="unit-cell" key="company"><span className="unit-icon blue"><Building2 size={21} /></span><span><b>{client.companyName}</b><small>{client.address}</small></span></div>,
          client.npwp || '—', client.picName,
          <div key="contact">{client.picPhone || '—'}<small className="cell-sub">{client.picEmail}</small></div>,
          `${client.contractCount} kontrak`,
          canWrite ? <div className="row-actions" key="actions"><button className="icon-button" onClick={() => edit(client)} aria-label={`Ubah ${client.companyName}`} title="Ubah data klien"><Pencil size={15} />Ubah</button><button className="icon-button danger-icon" aria-label={`Hapus ${client.companyName}`} title="Hapus data klien" onClick={() => setConfirm({ title: 'Hapus Data Klien', text: `Apakah Anda yakin ingin menghapus ${client.companyName}? Klien yang memiliki kontrak tidak dapat dihapus.`, action: () => deleteClient(client.id) })}><Trash2 size={15} />Hapus</button></div> : null,
        ],
      }));
    }
    if (module === 'operators') {
      const todayIso = new Date();
      const mm = String(todayIso.getMonth() + 1).padStart(2, '0');
      const dd = String(todayIso.getDate()).padStart(2, '0');
      const warnUntil = [todayIso.getFullYear(), mm, dd].join('-');
      const isExpiring = (v?: string | null) => !!v && v <= warnUntil;
      return (optRows as OperatorRowUi[]).map(o => ({
        id: o.id, status: o.status, raw: o as unknown as EditableRecord,
        cells: [
          <div className="unit-cell" key="name"><span className="unit-icon blue"><HardHat size={21} /></span><span><b>{o.fullName}</b><small>{o.employeeNo || o.phone || '-'}{o.ktpNo ? ` | NIK ${o.ktpNo.slice(0, 6)}**` : ''}</small></span></div>,
          <div key="sio">{o.sioClass || o.sioNumber ? `${o.sioClass || ''}${o.sioNumber ? ` - ${o.sioNumber}` : ''}` : '-'}{o.sioExpiry && <small className="cell-sub">{o.sioExpiry}{isExpiring(o.sioExpiry) && <TriangleAlert size={12} className="amber-text" />}</small>}</div>,
          <div key="rate">{Number(o.ratePerHour) > 0 ? `${money(o.ratePerHour)}/jam` : '-'}{Number(o.ratePerDay) > 0 && <small className="cell-sub">{money(o.ratePerDay)}/hari</small>}</div>,
          `${o.logCount} log`,
          <Badge status={o.status} key="status" />,
          canWrite ? <div className="row-actions" key="actions"><button className="icon-button" onClick={() => edit(o)} aria-label={`Ubah ${o.fullName}`} title="Ubah operator"><Pencil size={15} />Ubah</button><button className="icon-button danger-icon" aria-label={`Hapus ${o.fullName}`} title="Hapus operator" onClick={() => setConfirm({ title: 'Hapus Operator', text: `Apakah Anda yakin ingin menghapus ${o.fullName}? Operator yang masih ditugaskan pada kontrak tidak dapat dihapus.`, action: () => deleteOperator(o.id) })}><Trash2 size={15} />Hapus</button></div> : null,
        ],
      }));
    }
    if (module === 'contracts') {
      return (optRows as ContractRow[]).map(contract => ({
        id: contract.id, status: contract.status, raw: contract as unknown as EditableRecord,
        cells: [
          <div key="number"><b className="document-number">{contract.contractNumber}</b><small className="cell-sub">Dibuat {dateTimeLabel(contract.createdAt, tz)}</small></div>,
          <div key="client"><b>{contract.clientName}</b><small className="cell-sub">{contract.unitCode} · {contract.unitModel}</small></div>,
          <div key="dates">{dateLabel(contract.startDate, tz)}<small className="cell-sub">s.d. {dateLabel(contract.endDate, tz)}</small></div>,
          money(contract.ratePerHour), <Badge key="status" status={contract.status} />,
          <div className="row-actions" key="actions"><PdfLink kind="sph" id={contract.id} /><PdfLink kind="perjanjian" id={contract.id} label="Perjanjian" title="Unduh Surat Perjanjian Sewa (PDF)" />{canWrite && contract.status === 'active' && <button className="icon-button" aria-label="Revisi kontrak" title="Revisi kontrak" onClick={() => startRevise(contract as unknown as EditableRecord)}><Pencil size={15} />Revisi</button>}{canWrite && contract.status === 'active' && <button className="icon-button green" aria-label="Selesaikan kontrak" title="Selesaikan kontrak" onClick={() => askStatus(contract.id, 'completed')}><CircleCheck size={17} />Selesai</button>}</div>,
        ],
      }));
    }
    if (module === 'timesheets') {
      return (optRows as TimesheetRow[]).map(t => ({
        id: t.id, status: t.status, raw: t as unknown as EditableRecord,
        cells: [
          <div key="date"><b>{dateLabel(t.date, tz)}</b><small className="cell-sub">{t.contractNumber} · {timeLabel(t.createdAt, tz)}</small></div>,
          <div key="unit">{t.unitModel}<small className="cell-sub">{t.unitCode}</small></div>,
          `${Number(t.startHm).toLocaleString('id-ID')} → ${Number(t.endHm).toLocaleString('id-ID')}`,
          <div key="hours"><b>{Number(t.effectiveHours).toLocaleString('id-ID')} jam</b><small className="cell-sub">Kerusakan: {Number(t.breakdownHours)} jam</small></div>,
          <Badge key="status" status={t.status} />,
          operational && t.status === 'pending' ? <div className="row-actions" key="actions"><button className="approve-button" disabled={pending} onClick={() => askStatus(t.id, 'approved')}><Check size={14} />Setujui</button><button className="reject-button" disabled={pending} onClick={() => askStatus(t.id, 'rejected')} title="Tolak catatan" aria-label="Tolak catatan"><X size={15} />Tolak</button></div> : <span className="muted" key="processed">{t.invoiceId ? 'Sudah ditagihkan' : '—'}</span>,
        ],
      }));
    }
    if (module === 'bast') {
      return (optRows as HandoverRow[]).map(h => {
        const raw = h as unknown as Record<string, boolean>;
        const ok = bastFields.every(k => raw[k]);
        const editableRecord = h as unknown as EditableRecord;
        return {
          id: h.id, status: h.type, raw: editableRecord,
          cells: [
            <div key="number"><b className="document-number">{h.documentNumber}</b><small className="cell-sub">Dicatat {dateTimeLabel(h.createdAt, tz)}{h.photoUrls.length > 0 && ` · ${h.photoUrls.length} foto`}</small></div>,
            <div key="contract">{h.contractNumber}<small className="cell-sub">{h.clientName}</small></div>,
            dateLabel(h.date, tz), <Badge key="type" status={h.type} />,
            <span key="condition" className={ok ? 'green' : 'amber-text'}>{ok ? 'Seluruh komponen baik' : 'Perlu perhatian'}</span>,
            <div className="row-actions" key="doc"><PdfLink kind="bast" id={h.id} />{canWrite && <button className="icon-button" aria-label="Ubah BAST" title="Ubah BAST" onClick={() => edit(editableRecord)}><Pencil size={15} />Ubah</button>}</div>,
          ],
        };
      });
    }
    if (module === 'invoices') {
      return (optRows as InvoiceRow[]).map(i => {
        const paid = i.paidAmount;
        const remaining = remainingBalance(i.totalAmount, paid);
        const displayStatus = i.status !== 'paid' && isPastDue(i.dueDate, tz) ? 'overdue' : i.status;
        return {
          id: i.id, status: displayStatus, raw: i as unknown as EditableRecord,
          cells: [
            <div key="number"><b className="document-number">{i.invoiceNumber}</b><small className="cell-sub">Terbit {dateLabel(i.issueDate, tz)} · {timeLabel(i.createdAt, tz)}</small></div>,
            <div key="client">{i.clientName}<small className="cell-sub">{i.contractNumber}</small></div>,
            <div key="amount"><b>{money(i.totalAmount)}</b><small className="cell-sub">Termasuk PPN {Number(i.taxRate ?? ppnRate)}%{i.status !== 'paid' && paid > 0 && ` · Dibayar ${money(paid)}`}{i.status !== 'paid' && ` · Sisa ${money(remaining)}`}</small></div>,
            dateLabel(i.dueDate, tz), <Badge key="status" status={displayStatus} />,
            <div className="row-actions" key="actions">{['admin', 'finance', 'operations'].includes(data.user.role) && <PdfLink kind="invoice" id={i.id} />}{canWrite && <button className="icon-button green" aria-label={i.status === 'paid' ? `Riwayat pembayaran ${i.invoiceNumber}` : `Catat pembayaran ${i.invoiceNumber}`} title={i.status === 'paid' ? 'Riwayat pembayaran' : 'Catat pembayaran'} onClick={() => openPayments(i)}><Wallet size={16} />{i.status === 'paid' ? 'Riwayat' : 'Bayar'}</button>}</div>,
          ],
        };
      });
    }
    return [];
  }, [module, optRows, canWrite, operational, warnDays, ppnRate, pending, edit, askStatus, startRevise, openPayments, data.user.role, tz]);

  const submit = useCallback((e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setFormErrors(null);
    setBigNav(false); // simpan bukan navigasi: jangan tampilkan skeleton
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

  const sortLabel = filters.sort === 1 ? 'A–Z' : filters.sort === -1 ? 'Z–A' : 'Urutkan';
  const tabAllLabel = module === 'clients' ? 'klien' : 'data';
  const searchPlaceholder = module === 'fleet' ? 'kode unit, merek, atau lokasi' : module === 'clients' ? 'nama perusahaan atau penanggung jawab' : 'nomor dokumen atau unit';
  const filteredEmpty = !rows.length;

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
            {module === 'fleet' && <Button variant="outline" onClick={openBulk}><Plus size={17} />Tambah Banyak</Button>}
            <Button onClick={openCreate}><Plus size={17} />{c.add}</Button>
          </div>
        )}
      </div>

      {module === 'fleet' && (
        <>
          <ModuleSummary items={['available', 'renting', 'maintenance', 'in_transit'].map(st => ({ key: st, label: <Badge status={st} />, value: data.statusCounts[st] || 0, sub: 'unit', active: optStatus === st, onSelect: () => { const clear = optStatus === st; setOptStatus(clear ? 'all' : st); navigate({ status: clear ? null : st, page: null }); }, onHover: () => prefetch({ status: optStatus === st ? null : st, page: null }) }))} />
          {(data.fleetGroups?.length ?? 0) > 0 && <div className="info-callout"><Info size={19} /><p><b>Komposisi armada: </b>{(data.fleetGroups ?? []).map(([k, n]) => `${k} (${n})`).join(' · ')}</p></div>}
          {(data.expiringCount ?? 0) > 0 && (
            <button className="expiry-banner" onClick={() => navigate({ filter: filters.expiringOnly ? null : 'expiring', page: null })} onMouseEnter={() => prefetch({ filter: filters.expiringOnly ? null : 'expiring', page: null })} onFocus={() => prefetch({ filter: filters.expiringOnly ? null : 'expiring', page: null })}>
              <TriangleAlert size={20} />
              <div><b>{data.expiringCount} unit memerlukan pembaruan dokumen</b><span>SIKO atau asuransi berakhir dalam {warnDays} hari. Segera jadwalkan perpanjangan.</span></div>
              <span className="expiry-link">{filters.expiringOnly ? 'Tampilkan semua unit' : 'Periksa dokumen'}<ChevronRight size={16} /></span>
            </button>
          )}
        </>
      )}

      {module === 'invoices' && data.invoiceTotals && (
        <ModuleSummary items={[
          { key: 'all', label: 'Total Nilai Tagihan', value: money(data.invoiceTotals.all), sub: 'Seluruh periode · termasuk PPN' },
          { key: 'collected', label: 'Pembayaran Diterima', value: money(data.invoiceTotals.collected), tone: 'green', sub: `${data.invoiceTotals.paidCount} tagihan lunas` },
          { key: 'outstanding', label: 'Piutang Belum Lunas', value: money(data.invoiceTotals.all - data.invoiceTotals.collected), tone: 'orange-text', sub: `${data.invoiceTotals.unpaidCount} tagihan menunggu pembayaran` },
        ]} />
      )}

      {module === 'timesheets' && <div className="info-callout"><Info size={19} /><p><b>{data.statusCounts.pending || 0} catatan menunggu persetujuan.</b> Hanya jam kerja yang disetujui yang dapat ditagihkan kepada klien.</p></div>}

        <section className="panel module-table-panel">
          {/* G2 (audit 02): fleet tidak lagi merender tab status — kartu
              ModuleSummary di atas tabel sudah jadi satu-satunya filter status,
              dan tab sebelumnya duplikat kontrol (K2). Modul lain tidak berubah.
              Fungsi "kembali ke Semua" pindah ke kartu: klik kartu terpilih = lepas filter. */}
          {module !== 'fleet' && (
            <div className="table-tabs">
              <button className={optStatus === 'all' ? 'active' : ''} onClick={() => { setOptStatus('all'); navigate({ status: null, page: null }); }} onMouseEnter={() => prefetch({ status: null, page: null })} onFocus={() => prefetch({ status: null, page: null })}>Semua {tabAllLabel}<span>{data.statusCounts.all ?? data.total}</span></button>
              {statuses.map(st => <button className={optStatus === st ? 'active' : ''} key={st} onClick={() => { setOptStatus(st); navigate({ status: st, page: null }); }} onMouseEnter={() => prefetch({ status: st, page: null })} onFocus={() => prefetch({ status: st, page: null })}>{labels[st]}<span>{data.statusCounts[st] || 0}</span></button>)}
            </div>
          )}
          <div className="table-toolbar">
            <label className="table-search">
              <Search size={17} />
              <input value={query} onChange={e => onSearchInput(e.target.value)} placeholder={`Cari ${searchPlaceholder}...`} aria-label="Cari data" />
              {query && <button onClick={() => { setQuery(''); navigate({ q: null, page: null }, true); }} aria-label="Hapus pencarian"><X size={14} /></button>}
            </label>
            <div>
              {/* G3 (audit 02): filter kategori generik — tampil bila modul
                  menyediakan categoryOptions, bukan hardcode per modul. */}
              {(data.categoryOptions?.length ?? 0) > 0 && (
                <label className="small-select">
                  <Filter size={14} />
                  <select value={optCategory} onChange={e => { setOptCategory(e.target.value); navigate({ category: e.target.value, page: null }); }} aria-label="Filter kategori">
                    <option value="all">Semua kategori</option>
                    {(data.categoryOptions ?? []).map(cat => <option key={cat}>{cat}</option>)}
                  </select>
                  <ChevronDown size={13} />
                </label>
              )}
              <Button variant="outline" size="sm" onClick={() => navigate({ sort: filters.sort === 0 ? '1' : filters.sort === 1 ? '-1' : null, page: null })} onMouseEnter={() => prefetch({ sort: filters.sort === 0 ? '1' : filters.sort === 1 ? '-1' : null, page: null })} onFocus={() => prefetch({ sort: filters.sort === 0 ? '1' : filters.sort === 1 ? '-1' : null, page: null })} title={filters.sort === 0 ? 'Urutkan A–Z' : filters.sort === 1 ? 'Urutkan Z–A' : 'Kembalikan urutan awal'}><ArrowUpDown size={14} />{sortLabel}</Button>
            </div>
          </div>
          <div className="table-scroll" style={pending && !bigNav ? { opacity: 0.55 } : undefined}>
            {pending && bigNav ? (
              <div className="loading-rows" role="status" aria-label="Memuat data">{Array.from({ length: 6 }, (_, i) => <div key={i} />)}</div>
            ) : (
              <>
                <table>
                  <thead><tr>{headers.map((h, i) => <th key={i} className={i === 0 ? 'col-no' : undefined}>{h}</th>)}</tr></thead>
                  <tbody>{rows.map((r, idx) => <tr key={r.id}><td className="col-no">{(data.page - 1) * MODULE_PAGE_SIZE + idx + 1}</td>{r.cells.map((cell, i) => <td key={i}>{cell}</td>)}</tr>)}</tbody>
                </table>
                {filteredEmpty && (
                  <div className="empty-state">
                    <span><Search size={26} /></span>
                    <h3>{query || filters.status !== 'all' ? 'Data tidak ditemukan' : 'Belum ada data'}</h3>
                    <p>{query || filters.status !== 'all' ? 'Coba ubah kata kunci atau filter pencarian Anda.' : 'Tambahkan data pertama untuk memulai operasional.'}</p>
                    <Button variant="outline" onClick={() => { setQuery(''); navigate({ q: null, status: null, category: null, filter: null }, true); }}>Atur Ulang Filter</Button>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="table-footer">
            <span>Menampilkan {data.total ? (data.page - 1) * MODULE_PAGE_SIZE + 1 : 0}–{Math.min(data.page * MODULE_PAGE_SIZE, data.total)} dari {data.total} data</span>
            <div className="pagination">
              <button disabled={data.page === 1} onClick={() => navigate({ page: data.page - 1 })} onMouseEnter={() => data.page > 1 && prefetch({ page: data.page - 1 })} onFocus={() => data.page > 1 && prefetch({ page: data.page - 1 })} aria-label="Halaman sebelumnya"><ChevronLeft size={16} /></button>
              {pageItems(data.page, data.pageCount).map((item, i) => item === 'gap'
                ? <span key={`gap-${i}`} className="pagination-ellipsis" style={{ alignSelf: 'center', padding: '0 4px', fontSize: 13 }}>…</span>
                : <button key={item} className={data.page === item ? 'active' : ''} onClick={() => navigate({ page: item })} onMouseEnter={() => item !== data.page && prefetch({ page: item })} onFocus={() => item !== data.page && prefetch({ page: item })}>{item}</button>)}
              <button disabled={data.page === data.pageCount} onClick={() => navigate({ page: data.page + 1 })} onMouseEnter={() => data.page < data.pageCount && prefetch({ page: data.page + 1 })} onFocus={() => data.page < data.pageCount && prefetch({ page: data.page + 1 })} aria-label="Halaman berikutnya"><ChevronRight size={16} /></button>
            </div>
          </div>
        </section>

      {/* Modal hanya di-mount saat terbuka: state ketikan di dalam form (HM,
          prefix bulk, dsb.) hidup di komponen anak sehingga TIDAK me-render
          ulang tabel di belakangnya. Opsi referensi diambil async saat terbuka. */}
      {open && (
        <RecordModal
          module={module} settings={data.settings} editing={editing} revising={revising} bulk={bulk}
          pending={pending} canWrite={canWrite} formErrors={formErrors} ppnRate={ppnRate}
          options={formOptions} revisions={revisions} categoryOptions={data.categoryOptions ?? []}
          mediaEnabled={data.media.enabled}
          onOpenChange={guardRecordModal} onCancel={closeRecordModal} onSubmit={submit}
        />
      )}

      {paying && <PaymentsModal invoice={paying} payments={payments} tz={tz} onClose={() => setPaying(null)} onPay={submitPayment} />}

      <Modal open={!!confirm} onOpenChange={v => { if (!v && !pending) setConfirm(null); }} title={confirm?.title || 'Konfirmasi'} description={confirm?.text}>
        <div className="form-footer">
          <Button variant="outline" onClick={() => setConfirm(null)} disabled={pending}>Batal</Button>
          <Button disabled={pending} onClick={() => { if (confirm) act(confirm.action); }}>{pending ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}Konfirmasi</Button>
        </div>
      </Modal>

      {history && (
        <Modal open onOpenChange={v => { if (!v) setHistory(null); }} title={history === 'loading' ? 'Memuat riwayat...' : `Riwayat Unit ${history.unit.unitCode}`} description={history !== 'loading' ? `${history.unit.brandModel} - ${history.unit.category}` : undefined}>
          {history !== 'loading' && (
            <div className="history-drawer">
              <div className="summary-box" style={{ marginBottom: 14 }}>
                <div><span>Kontrak</span><b>{history.summary.contractCount} ({history.summary.completedCount} selesai)</b></div>
                <div><span>Catatan timesheet</span><b>{history.summary.logCount} log / {history.summary.workDays} hari</b></div>
                <div><span>Total jam efektif</span><b>{history.summary.effectiveHours.toLocaleString('id-ID')} jam</b></div>
                <div><span>Jam breakdown</span><b>{history.summary.breakdownHours.toLocaleString('id-ID')} jam</b></div>
                {history.summary.hmUsed !== null && <div><span>Total HM terpakai</span><b>{history.summary.hmUsed.toLocaleString('id-ID')} HM</b></div>}
                {history.summary.revenue !== null && <div><span>Pendapatan unit</span><b>{money(history.summary.revenue)}</b></div>}
                {history.summary.operatorCost !== null && history.summary.operatorCost > 0 && <div><span>Biaya operator</span><b>{money(history.summary.operatorCost)}</b></div>}
              </div>
              {history.operators.length > 0 && (
                <>
                  <h3 style={{ fontSize: 14, margin: '10px 0 6px' }}>Riwayat Operator</h3>
                  <div className="table-scroll" style={{ maxHeight: 200 }}>
                    <table>
                      <thead><tr><th>Operator</th><th>Log</th><th>Jam Efektif</th><th>Terakhir</th></tr></thead>
                      <tbody>{history.operators.map(o => <tr key={o.name}><td>{o.name}</td><td>{o.logs}</td><td>{o.hours.toLocaleString('id-ID')} jam</td><td>{o.last || '-'}</td></tr>)}</tbody>
                    </table>
                  </div>
                </>
              )}
              {history.contracts.length > 0 && (
                <>
                  <h3 style={{ fontSize: 14, margin: '12px 0 6px' }}>Riwayat Sewa</h3>
                  <div className="table-scroll" style={{ maxHeight: 200 }}>
                    <table>
                      <thead><tr><th>Kontrak</th><th>Klien</th><th>Periode</th><th>Operator</th><th>Status</th></tr></thead>
                      <tbody>{history.contracts.map(k => <tr key={k.id}><td>{k.contractNumber}</td><td>{k.clientName || '-'}</td><td>{k.startDate} s.d. {k.endDate}</td><td>{k.includeOperator ? 'Include' : 'Dry hire'}</td><td><Badge status={k.status} /></td></tr>)}</tbody>
                    </table>
                  </div>
                </>
              )}
              {history.recentLogs.length > 0 && (
                <>
                  <h3 style={{ fontSize: 14, margin: '12px 0 6px' }}>Timesheet Terbaru</h3>
                  <div className="table-scroll" style={{ maxHeight: 220 }}>
                    <table>
                      <thead><tr><th>Tanggal</th><th>Operator</th><th>HM Awal-Akhir</th><th>Jam Efektif</th><th>Status</th></tr></thead>
                      <tbody>{history.recentLogs.map(l => <tr key={l.id}><td>{l.date}</td><td>{l.driver || '-'}</td><td>{Number(l.startHm).toLocaleString('id-ID')} - {Number(l.endHm).toLocaleString('id-ID')}</td><td>{Number(l.effectiveHours).toLocaleString('id-ID')} jam</td><td><Badge status={l.status} /></td></tr>)}</tbody>
                    </table>
                  </div>
                </>
              )}
              {history.operators.length === 0 && history.recentLogs.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Unit ini belum memiliki riwayat penggunaan.</p>}
            </div>
          )}
          {history === 'loading' && <div className="loading-rows" role="status" aria-label="Memuat">{Array.from({ length: 4 }, (_, i) => <div key={i} />)}</div>}
        </Modal>
      )}
      {toast && <div className={`toast ${toast.success ? 'toast-success' : 'toast-error'}`} role="status">{toast.success ? <CircleCheck size={20} /> : <TriangleAlert size={20} />}<span>{toast.message}</span><button onClick={() => setToast(null)} aria-label="Tutup pemberitahuan"><X size={16} /></button></div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal tambah/ubah — komponen terpisah dengan state ketikan lokal.
// Mengetik di sini hanya me-render ulang form, bukan halaman kerja.
// O-A: daftar kontrak/unit/klien datang dari `options` (server action
// getFormOptions, dipanggil saat modal dibuka); jam dapat ditagih diambil
// saat kontrak dipilih (getBillableHours); riwayat revisi dari `revisions`.
// ---------------------------------------------------------------------------
function RecordModal({ module, settings, editing, revising, bulk, pending, canWrite, formErrors, ppnRate, options, revisions, categoryOptions, mediaEnabled, onOpenChange, onCancel, onSubmit }: {
  module: string; settings: CompanySettings; editing: EditableRecord | null; revising: EditableRecord | null; bulk: boolean;
  pending: boolean; canWrite: boolean; formErrors: Record<string, string> | null; ppnRate: number;
  options: FormOptionsData | null; revisions: RevisionRow[] | null; categoryOptions: string[]; mediaEnabled: boolean;
  onOpenChange: (v: boolean) => void; onCancel: () => void; onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  const c = config[module];
  const warnDays = Number(settings.expiryWarningDays ?? 30) || 30;
  const tz = settings.timezone;
  const ferr = (n: string) => formErrors?.[n] ? <small className="field-error">{formErrors[n]}</small> : null;
  const [contractId, setContractId] = useState('');
  const [meter, setMeter] = useState({ start: 0, end: 0, breakdown: 0 });
  const [catCustom, setCatCustom] = useState(false);
  const [bPrefix, setBPrefix] = useState('EXC');
  const [bStart, setBStart] = useState(1);
  const [bCount, setBCount] = useState(5);
  const [billable, setBillable] = useState<number | null>(null);
  const [includeOperator, setIncludeOperator] = useState(false);
  const [selectedOperators, setSelectedOperators] = useState<string[]>([]);
  const [operatorRateType, setOperatorRateType] = useState('hourly');
  const [billableOperator, setBillableOperator] = useState<number | null>(null);

  const contracts = useMemo(() => options?.contracts ?? [], [options]);
  const fleetOptions = useMemo(() => options?.fleet ?? [], [options]);
  const clientOptions = useMemo(() => options?.clients ?? [], [options]);
  const fleetCats = useMemo(() => Array.from(new Set([...fleetCategories, ...categoryOptions])), [categoryOptions]);
  const selectedContract = useMemo(() => contracts.find(x => x.id === contractId), [contracts, contractId]);
  const totals = useMemo(() => calcInvoiceTotals(billable ?? 0, Number(selectedContract?.ratePerHour || 0), ppnRate), [billable, selectedContract, ppnRate]);
  const subtotal = totals.subtotal;
  const revisionHistory = useMemo(() => revising ? (revisions ?? []) : [], [revisions, revising]);
  const latestReason = useMemo(() => revisions?.[0]?.reason || '', [revisions]);

  const title = `${revising ? 'Revisi' : editing ? 'Ubah' : module === 'fleet' && bulk ? 'Tambah Banyak' : module === 'fleet' || module === 'clients' ? 'Tambah' : 'Buat'} ${c.singular}`;

  // G4 (audit 02): field() menerima hint opsional — dirender sebagai .cell-sub
  // bila diisi (pola bantuan field opsional yang sebelumnya hanya ada di Pengaturan).
  const field = (name: string, label: string, type = 'text', required = true, extra?: Record<string, string | number>, hint?: string) => (
    <label className="form-field" key={name}>
      <span>{label}{required && <i> *</i>}</span>
      <input name={name} type={type} required={required} defaultValue={editing?.[name] != null ? String(editing[name]) : type === 'date' && required ? todayISO(tz) : undefined} {...extra} />
      {ferr(name) ?? (hint ? <small className="cell-sub">{hint}</small> : null)}
    </label>
  );

  // G5 (audit 02): helper select/textarea dengan markup form-field yang sama
  // dengan field() — menggantikan blok label yang disalin-tempel per modul.
  const selectField = (name: string, label: string, children: React.ReactNode, opts: { required?: boolean; span2?: boolean; disabled?: boolean; defaultValue?: string; placeholder?: string; hint?: string; onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void } = {}) => (
    <label className={`form-field${opts.span2 ? ' span-2' : ''}`} key={name}>
      <span>{label}{opts.required !== false && <i> *</i>}</span>
      <select name={name} required={opts.required !== false} defaultValue={opts.defaultValue} disabled={opts.disabled} onChange={opts.onChange}>
        {opts.placeholder && <option value="" disabled>{opts.placeholder}</option>}
        {children}
      </select>
      {ferr(name) ?? (opts.hint ? <small className="cell-sub">{opts.hint}</small> : null)}
    </label>
  );
  const textareaField = (name: string, label: string, opts: { required?: boolean; span2?: boolean; placeholder?: string; defaultValue?: string; rows?: number; minLength?: number; maxLength?: number; hint?: string } = {}) => (
    <label className={`form-field${opts.span2 ? ' span-2' : ''}`} key={name}>
      <span>{label}{opts.required !== false && <i> *</i>}</span>
      <textarea name={name} required={opts.required !== false} placeholder={opts.placeholder} defaultValue={opts.defaultValue} rows={opts.rows} minLength={opts.minLength} maxLength={opts.maxLength} />
      {ferr(name) ?? (opts.hint ? <small className="cell-sub">{opts.hint}</small> : null)}
    </label>
  );

  // Pemilihan kontrak pada form invoice memicu pengambilan jam dapat ditagih
  // (select async) — sebelumnya dihitung client dari seluruh tabel timesheets.
  const pickContract = useCallback((value: string) => {
    setContractId(value);
    setBillable(null);
    if (module === 'invoices' && value) getBillableHours(value).then(r => { setBillable(r.hours); setBillableOperator(r.operatorAmount); }).catch(() => { setBillable(0); setBillableOperator(0); });
  }, [module]);

  const contractOptions = useMemo(() => contracts.map(x => <option key={x.id} value={x.id}>{x.contractNumber} — {x.clientName} ({x.unitCode})</option>), [contracts]);

  const selectContract = selectField('contractId', 'Kontrak Sewa', contractOptions, { span2: true, disabled: !options, placeholder: options ? 'Pilih kontrak sewa' : 'Memuat data referensi...', onChange: e => pickContract(e.target.value) });

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
              {editing && isExpiringFleet(editing as unknown as FleetRow, warnDays, tz) && <div className="info-callout span-2"><TriangleAlert size={18} /><p>Dokumen unit mendekati atau telah melewati masa berlaku. Perbarui tanggal setelah perpanjangan selesai.</p></div>}
              {/* Foto unit (doc §32): tersimpan otomatis per unggah — terpisah
                  dari simpan data unit agar form data tidak ikut tergantung
                  pada jaringan media. */}
              {mediaEnabled && editing && canWrite && <FleetPhotoSection fleetId={String(editing.id)} />}
              {mediaEnabled && !editing && <div className="info-callout span-2"><Info size={18} /><p>Simpan unit terlebih dahulu. Foto unit (cover &amp; galeri) dapat ditambahkan melalui tombol <b>Ubah</b>.</p></div>}
            </>
          )}

          {module === 'operators' && (
          <>
            <label className="form-field"><span>Nama lengkap *</span><input name="fullName" defaultValue={String(editing?.fullName ?? '')} required maxLength={120} /></label>
            <div className="form-grid-2">
              <label className="form-field"><span>No. pegawai</span><input name="employeeNo" defaultValue={String(editing?.employeeNo ?? '')} maxLength={40} /></label>
              <label className="form-field"><span>Telepon</span><input name="phone" defaultValue={String(editing?.phone ?? '')} maxLength={30} /></label>
            </div>
            <label className="form-field"><span>No. KTP (16 digit)</span><input name="ktpNo" defaultValue={String(editing?.ktpNo ?? '')} maxLength={20} inputMode="numeric" />{ferr('ktpNo')}</label>
            <div className="form-grid-2">
              <label className="form-field"><span>Kelas SIO</span><input name="sioClass" defaultValue={String(editing?.sioClass ?? '')} placeholder="Excavator / Crane ..." maxLength={60} /></label>
              <label className="form-field"><span>Nomor SIO</span><input name="sioNumber" defaultValue={String(editing?.sioNumber ?? '')} maxLength={60} /></label>
            </div>
            <div className="form-grid-2">
              <label className="form-field"><span>Masa berlaku SIO</span><input type="date" name="sioExpiry" defaultValue={String(editing?.sioExpiry ?? '')} />{ferr('sioExpiry')}</label>
              <label className="form-field"><span>Masa berlaku SIM</span><input type="date" name="licenseExpiry" defaultValue={String(editing?.licenseExpiry ?? '')} />{ferr('licenseExpiry')}</label>
            </div>
            <div className="form-grid-2">
              <label className="form-field"><span>Kelas SIM</span><input name="licenseClass" defaultValue={String(editing?.licenseClass ?? '')} placeholder="B2 umum ..." maxLength={40} /></label>
              <label className="form-field"><span>Status</span>
                <select name="status" defaultValue={String(editing?.status ?? 'active')}>
                  <option value="active">Aktif</option>
                  <option value="inactive">Nonaktif</option>
                </select>{ferr('status')}
              </label>
            </div>
            <div className="form-grid-2">
              <label className="form-field"><span>Tarif per jam (Rp)</span><input type="number" name="ratePerHour" min={0} step={1000} defaultValue={String(editing?.ratePerHour ?? '0')} />{ferr('ratePerHour')}</label>
              <label className="form-field"><span>Tarif per hari (Rp)</span><input type="number" name="ratePerDay" min={0} step={10000} defaultValue={String(editing?.ratePerDay ?? '0')} />{ferr('ratePerDay')}</label>
            </div>
            <label className="form-field"><span>Mode tarif default</span>
              <select name="defaultRateType" defaultValue={String(editing?.defaultRateType ?? 'hourly')}>
                <option value="hourly">Per jam</option>
                <option value="daily">Per hari</option>
              </select>{ferr('defaultRateType')}
            </label>
            <label className="form-field"><span>Catatan</span><textarea name="notes" rows={2} defaultValue={String(editing?.notes ?? '')} maxLength={500} /></label>
          </>
        )}
        {module === 'clients' && (
          <>
            {field('companyName', 'Nama Perusahaan', 'text', true, { placeholder: 'PT Nama Perusahaan' })}
              {field('npwp', 'NPWP', 'text', false)}
              {field('picName', 'Nama Penanggung Jawab')}
              {field('picKtp', 'No. KTP Penanggung Jawab', 'text', false)}
              {field('picPhone', 'Nomor Telepon', 'tel', false)}
              {field('picEmail', 'Surel Penanggung Jawab', 'email', false)}
              {textareaField('address', 'Alamat Perusahaan', { span2: true, placeholder: 'Alamat lengkap perusahaan', defaultValue: String(editing?.address || '') })}
            </>
          )}

          {module === 'contracts' && revising ? (
            <>
              <div className="info-callout span-2"><Info size={18} /><p>Merevisi <b>{String(revising.contractNumber || '')}</b> — {String(revising.clientName || '')}. Tarif baru hanya berlaku untuk jam yang belum ditagihkan; jam yang sudah masuk invoice tidak berubah.</p></div>
              {selectField('unitId', 'Unit Alat Berat', fleetOptions.filter(f => f.status === 'available' || f.id === String(revising.unitId || '')).map(f => <option key={f.id} value={f.id}>{f.unitCode} — {f.brandModel} ({f.status === 'available' ? 'Tersedia' : 'Terpakai kontrak ini'} · {money(f.hourlyRate)}/jam)</option>), { span2: true, disabled: !options, defaultValue: String(revising.unitId || '') })}
              <label className="form-field"><span>Tanggal Mulai <i>*</i></span><input name="startDate" type="date" required defaultValue={String(revising.startDate || '').slice(0, 10)} />{ferr('startDate')}</label>
              <label className="form-field"><span>Tanggal Selesai <i>*</i></span><input name="endDate" type="date" required defaultValue={String(revising.endDate || '').slice(0, 10)} />{ferr('endDate')}</label>
              <label className="form-field"><span>Tarif Sewa per Jam (Rp) <i>*</i></span><input name="ratePerHour" type="number" required min={1} step="0.01" defaultValue={String(revising.ratePerHour || '')} />{ferr('ratePerHour')}</label>
              <label className="form-field"><span>Periode &amp; Tarif Saat Ini</span><input disabled value={`${dateLabel(String(revising.startDate || ''))} s.d. ${dateLabel(String(revising.endDate || ''))} · ${money(String(revising.ratePerHour || 0))}`} /></label>
              {textareaField('reason', 'Alasan Revisi', { span2: true, placeholder: 'Contoh: Perpanjangan 2 minggu sesuai permintaan klien + penyesuaian tarif lembur', minLength: 10, maxLength: 500 })}
              {revisionHistory.length > 0 && (
                <div className="summary-box span-2">
                  <h4>Riwayat Amandemen ({revisionHistory.length})</h4>
                  {revisionHistory.map(r => <div key={r.id}><span>Rev {r.revisionNumber} · {dateLabel(r.createdAt, tz)}</span><b>{money(r.prevRate)} → {money(r.newRate)}</b></div>)}
                  <div><span>Alasan terakhir</span><b>{latestReason}</b></div>
                </div>
              )}
              <div className="info-callout span-2"><Info size={18} /><p>Periode baru tidak boleh memotong tanggal timesheet tercatat. Ganti unit ditolak bila timesheet sudah ada — buat kontrak baru bila unit berganti di tengah jalan.</p></div>
            </>
          ) : module === 'contracts' && (
            <>
              {field('contractNumber', 'Nomor Kontrak', 'text', false, { placeholder: 'Dibuat otomatis apabila dikosongkan' })}
              {selectField('clientId', 'Klien', clientOptions.map(x => <option key={x.id} value={x.id}>{x.companyName}</option>), { disabled: !options, placeholder: options ? 'Pilih perusahaan klien' : 'Memuat data referensi...' })}
              {selectField('unitId', 'Unit Tersedia', fleetOptions.map(f => <option key={f.id} value={f.id}>{f.unitCode} — {f.brandModel} ({money(f.hourlyRate)}/jam)</option>), { span2: true, disabled: !options, placeholder: options ? 'Pilih unit yang tersedia' : 'Memuat data referensi...' })}
              {field('startDate', 'Tanggal Mulai', 'date')}
              {field('endDate', 'Tanggal Selesai', 'date')}
              {field('ratePerHour', 'Tarif Sewa per Jam (Rp)', 'number', true, { min: 1, step: '0.01', placeholder: '350000' })}
              <label className="form-field span-2 toggle-field"><input type="checkbox" name="includeOperator" checked={includeOperator} onChange={e => setIncludeOperator(e.target.checked)} /><span>Sertakan operator (wet hire)</span></label>
              {includeOperator && (
                <>
                  <label className="form-field span-2"><span>Pilih operator (bisa lebih dari satu) <i>*</i></span>
                    <div className="operator-picker">
                      {(options?.operators ?? []).map(o => (
                        <label key={o.id} className="operator-option">
                          <input type="checkbox" value={o.id} checked={selectedOperators.includes(o.id)} onChange={e => setSelectedOperators(prev => e.target.checked ? [...prev, o.id] : prev.filter(x => x !== o.id))} />
                          <span><b>{o.fullName}</b><small>{o.sioClass || 'Tanpa SIO'} - {Number(o.ratePerHour) > 0 ? `${money(o.ratePerHour)}/jam` : `${money(o.ratePerDay)}/hari`}</small></span>
                        </label>
                      ))}
                    </div>
                    {!options && <small className="cell-sub">Memuat data operator...</small>}
                    {ferr('operatorId')}
                  </label>
                  <label className="form-field"><span>Mode tarif operator <i>*</i></span>
                    <select name="operatorRateType" value={operatorRateType} onChange={e => setOperatorRateType(e.target.value)}>
                      <option value="hourly">Per jam</option>
                      <option value="daily">Per hari</option>
                    </select>{ferr('operatorRateType')}
                  </label>
                  <label className="form-field"><span>Tarif operator (Rp) <i>*</i></span><input name="operatorRate" type="number" min={1} step="0.01" />{ferr('operatorRate')}</label>
                </>
              )}
              <div className="info-callout span-2"><Info size={18} /><p>Kontrak yang disimpan langsung aktif. Status unit akan berubah menjadi Disewa.</p></div>
            </>
          )}

          {module === 'timesheets' && (
            <>
              {selectContract}
              <label className="form-field"><span>Operator pengemudi</span>
                <select name="operatorDriverId" defaultValue={String(editing?.operatorDriverId || '')}>
                  <option value="">- tidak dicatat -</option>
                  {(options?.operators ?? []).map(o => <option key={o.id} value={o.id}>{o.fullName}{o.sioClass ? ` (${o.sioClass})` : ''}</option>)}
                </select>{ferr('operatorDriverId')}
              </label>
              {field('date', 'Tanggal Operasional', 'date', true, { max: todayISO(tz) })}
              <div />
              {[['startHm', 'HM Awal', 'start'], ['endHm', 'HM Akhir', 'end'], ['breakdownHours', 'Durasi Kerusakan (Jam)', 'breakdown']].map(([name, label, key]) => (
                <label className="form-field" key={name}>
                  <span>{label} <i>*</i></span>
                  <input name={name} type="number" required min="0" step="0.01" defaultValue={key === 'breakdown' ? '0' : undefined} onChange={e => setMeter({ ...meter, [key]: Number(e.target.value) })} />
                  {ferr(name)}
                </label>
              ))}
              <div className="effective-hours"><span>Total Jam Efektif</span><strong>{Math.max(0, meter.end - meter.start - meter.breakdown).toLocaleString('id-ID')} <small>jam</small></strong></div>
              {textareaField('notes', 'Catatan Pekerjaan', { span2: true, placeholder: 'Uraian pekerjaan, kendala, atau informasi tambahan' })}
              <div className="info-callout span-2"><Info size={18} /><p>Catatan akan diajukan kepada Manajer Operasional untuk persetujuan.</p></div>
            </>
          )}

          {module === 'bast' && (
            <>
              <div className="form-section-header">Informasi BAST</div>
              {editing ? <input type="hidden" name="contractId" value={String(editing.contractId || '')} /> : selectContract}
              {selectField('type', 'Jenis Serah Terima', <><option value="mobilization">Mobilisasi — Penyerahan Unit</option><option value="demobilization">Demobilisasi — Pengembalian Unit</option></>, { defaultValue: String(editing?.type || 'mobilization'), disabled: !!editing })}
              {field('date', 'Tanggal Serah Terima', 'date')}
              <BastChecklist editing={editing} />
              <div className="form-section-header">Dokumentasi Kondisi Unit</div>
              <div className="span-2"><PhotoUploader errors={formErrors} existing={editing?.photoUrls as string[] | undefined} /></div>
              {textareaField('notes', 'Catatan Pemeriksaan', { span2: true, placeholder: 'Catat kerusakan, kelengkapan, atau hal yang perlu ditindaklanjuti', defaultValue: editing?.notes ? String(editing.notes) : '' })}
            </>
          )}

          {module === 'invoices' && (
            <>
              {selectContract}
              {field('dueDate', 'Tanggal Jatuh Tempo', 'date', true, { min: todayISO(tz) })}
              <div className="summary-box span-2">
                <h4>Ringkasan Tagihan</h4>
                <div><span>Jam kerja disetujui, belum ditagihkan</span><b>{billable === null ? '…' : billable.toLocaleString('id-ID')} jam</b></div>
                <div><span>Tarif sewa per jam</span><b>{money(selectedContract?.ratePerHour || 0)}</b></div>
                {(billableOperator ?? 0) > 0 && <div><span>Jasa operator (wet hire)</span><b>{money(billableOperator ?? 0)}</b></div>}
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
          <Button type="submit" disabled={pending || !canWrite || (module === 'invoices' && (billable === null || billable <= 0))}>
            {pending ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}{' '}
            {pending ? 'Menyimpan...' : module === 'contracts' && revising ? 'Simpan Revisi' : module === 'fleet' && bulk && !editing ? `Tambah ${bCount} Unit` : c.submit}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Modal pembayaran invoice — riwayat + pencatatan (penuh maupun cicilan).
// Status dihitung server dari akumulasi: paid / partial / overdue.
// O-A: riwayat pembayaran invoice ini diambil saat modal dibuka
// (getInvoicePayments), bukan berasal dari seluruh tabel payments.
// ---------------------------------------------------------------------------
function PaymentsModal({ invoice, payments, tz, onClose, onPay }: {
  invoice: InvoiceRow;
  payments: PaymentRow[] | null;
  tz: string;
  onClose: () => void;
  onPay: (form: FormData) => Promise<{ success: boolean; message: string; fieldErrors?: Record<string, string> }>;
}) {
  const history = useMemo(() => payments ?? [], [payments]);
  // Saat riwayat belum termuat, pakai akumulasi dari server (row.paidAmount)
  // agar ringkasan tetap benar; setelah termuat pakai jumlah riwayat.
  const paid = history.length ? history.reduce((a, p) => a + Number(p.amount), 0) : Number(invoice.paidAmount);
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
          <div className="summary-box span-2">
            <h4>Ringkasan Tagihan</h4>
            <div><span>Total tagihan</span><b>{money(invoice.totalAmount)}</b></div>
            <div><span>Sudah dibayar</span><b>{money(paid)}</b></div>
            <div className="invoice-total"><span>Sisa tagihan</span><b>{money(remaining)}</b></div>
          </div>
          {!payments ? (
            <div className="summary-box span-2"><h4>Riwayat Pembayaran</h4><p className="cell-sub">Memuat riwayat pembayaran...</p></div>
          ) : history.length > 0 && (
            <div className="summary-box span-2">
              <h4>Riwayat Pembayaran ({history.length})</h4>
              {history.map(p => <div key={p.id} className="payment-row"><span>{dateLabel(p.paidAt, tz)} · {labels[p.method]}{p.reference ? ` · ${p.reference}` : ''}{p.notes ? <><br />{p.notes}</> : null}</span><b>{money(p.amount)}</b></div>)}
            </div>
          )}
          {!settled && (
            <>
              <label className="form-field"><span>Nominal (Rp) <i>*</i></span><input name="amount" type="number" required min={0.01} step="0.01" defaultValue={remaining.toFixed(2)} />{errors?.amount && <small className="field-error">{errors.amount}</small>}</label>
              <label className="form-field"><span>Metode <i>*</i></span><select name="method" defaultValue="transfer">{['transfer', 'cash', 'giro', 'other'].map(m => <option key={m} value={m}>{labels[m]}</option>)}</select>{errors?.method && <small className="field-error">{errors.method}</small>}</label>
              <label className="form-field"><span>Tanggal Bayar <i>*</i></span><input name="paidAt" type="date" required defaultValue={todayISO(tz)} max={todayISO(tz)} />{errors?.paidAt && <small className="field-error">{errors.paidAt}</small>}</label>
              <label className="form-field"><span>Referensi</span><input name="reference" maxLength={100} placeholder="No. bukti / keterangan" />{errors?.reference && <small className="field-error">{errors.reference}</small>}</label>
              <label className="form-field span-2"><span>Catatan</span><textarea name="notes" maxLength={500} rows={2} placeholder="Catatan internal pembayaran (opsional)" />{errors?.notes && <small className="field-error">{errors.notes}</small>}</label>
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
// BAST Inspection Checklist — isolated memoized component prevents parent
// state changes from causing checkbox reconciliation lag (P0 performance fix).
// ---------------------------------------------------------------------------
const BastChecklist = memo(function BastChecklist({ editing }: { editing: EditableRecord | null }) {
  return (
    <div className="inspection-checklist span-2">
      <h4><ClipboardCheck size={18} />Daftar Pemeriksaan Unit (12 titik)</h4>
      <p>Centang komponen yang telah diperiksa dan dinyatakan dalam kondisi baik.</p>
      {bastItems.map(([name, label, desc]) => (
        <label key={name} htmlFor={`bast-${name}`}>
          <input 
            type="checkbox" 
            id={`bast-${name}`}
            name={name} 
            defaultChecked={editing ? !!editing[name] : true}
          />
          <span><b>{label}</b><small>{desc}</small></span>
        </label>
      ))}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Pengunggah foto BAST — berkas langsung ke Storage privat, path-nya
// disimpan ke hidden input `photoUrls` (JSON) untuk ikut form BAST.
// Memoized to prevent rerender when unrelated RecordModal state changes.
// ---------------------------------------------------------------------------
const PhotoUploader = memo(function PhotoUploader({ errors, existing }: { errors: Record<string, string> | null; existing?: string[] }) {
  const [photos, setPhotos] = useState<{ path: string; url: string }[]>(() => 
    existing?.length ? existing.map(path => ({ path, url: `/api/bast-photos?path=${encodeURIComponent(path)}` })) : []
  );
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  
  const add = useCallback(async (files: FileList | null) => {
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
  }, [photos.length]);
  
  const remove = useCallback((path: string) => setPhotos(prev => {
    const target = prev.find(p => p.path === path);
    if (target) URL.revokeObjectURL(target.url);
    return prev.filter(p => p.path !== path);
  }), []);
  
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    add(e.target.files);
    e.target.value = '';
  }, [add]);
  
  return (
    <div className="form-field">
      <span><ImagePlus size={15} style={{ display: 'inline', verticalAlign: -2 }} /> Lampiran Foto (maks 6, @5 MB)</span>
      <input type="hidden" name="photoUrls" value={JSON.stringify(photos.map(p => p.path))} />
      <input type="file" accept="image/*" multiple disabled={uploading} onChange={handleFileChange} aria-label="Unggah foto BAST" />
      {uploading && <small className="cell-sub">Mengunggah...</small>}
      {(error || errors?.photos) && <small className="field-error">{error || errors?.photos}</small>}
      {photos.length > 0 && (
        <div className="photo-thumbs">
          {photos.map(p => (
            <span className="photo-thumb" key={p.path}>
              {/* B1 (audit bast.md): loading lazy + decoding async agar pratinjau foto kamera HP tidak memblok render form. */}
              {/* eslint-disable-next-line @next/next/no-img-element -- pratinjau object-URL lokal, bukan aset remote */}
              <img src={p.url} alt="Lampiran BAST" loading="lazy" decoding="async" />
              <button type="button" onClick={() => remove(p.path)} aria-label="Hapus foto"><X size={13} /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
});
// ---------------------------------------------------------------------------
// Foto unit FLEET — cover + galeri (docs/media-architecture.md §11/§14/§32).
// Alur: browser kompres (WebP ≤1600px, ≤2 MB) → Server Action meminta
// presigned PUT (metadata 'pending' dibuat) → browser PUT langsung ke R2
// (dengan progress) → action completion → Worker verifikasi object →
// metadata 'active' → halaman di-refresh. Foto tersimpan saat unggah selesai,
// TERPISAH dari form data unit (form tidak menunggu jaringan media).
// Memoized — pola PhotoUploader — agar ketikan di form data tidak
// me-render ulang state unggahan.
// ---------------------------------------------------------------------------
const FleetPhotoSection = memo(function FleetPhotoSection({ fleetId }: { fleetId: string }) {
  const [media, setMedia] = useState<FleetMediaData | null>(null);
  const [phase, setPhase] = useState<'' | 'compress' | 'upload' | 'saving'>('');
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const coverInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setMedia(await getFleetMedia(fleetId));
    } catch {
      setMedia({ cover: null, gallery: [] });
    }
  }, [fleetId]);

  // Muat awal: di-defer 0 ms agar setState terjadi di callback, bukan di
  // tubuh effect (pola timer yang sama dengan toast; aturan
  // react-hooks/set-state-in-effect). Pratinjau foto bukan jalur kritis —
  // jeda 1 frame tak terlihat.
  useEffect(() => {
    const t = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(t);
  }, [load]);

  const upload = useCallback(async (category: 'cover' | 'gallery', file: File) => {
    setBusy(true);
    setError('');
    setProgress(null);
    try {
      setPhase('compress');
      const img = await compressImage(file);
      const ticket = await requestFleetPhotoUpload(fleetId, category, img.mimeType, img.size, img.width, img.height, file.name);
      if (!ticket.success || !ticket.data) throw new Error(ticket.message || 'Tidak dapat memulai unggahan.');
      setPhase('upload');
      await putToPresignedUrl(ticket.data.uploadUrl, img.blob, img.mimeType, setProgress);
      setPhase('saving');
      setProgress(null);
      const done = await completeFleetPhotoUpload(ticket.data.mediaId);
      if (!done.success) throw new Error(done.message || 'Metadata foto gagal disimpan.');
      await load();
    } catch (e) {
      setError((e as Error).message || 'Unggahan gagal. Coba lagi.');
    }
    setBusy(false);
    setPhase('');
    setProgress(null);
  }, [fleetId, load]);

  const remove = useCallback(async (id: string) => {
    setBusy(true);
    setError('');
    try {
      const result = await deleteFleetPhoto(id);
      if (!result.success) throw new Error(result.message);
      await load();
    } catch (e) {
      setError((e as Error).message || 'Gagal menghapus foto.');
    }
    setBusy(false);
  }, [load]);

  const pick = useCallback((e: React.ChangeEvent<HTMLInputElement>, category: 'cover' | 'gallery') => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void upload(category, file);
  }, [upload]);

  const cover = media?.cover ?? null;
  const gallery = media?.gallery ?? [];
  const phaseLabel = phase === 'compress' ? 'Mengompres foto...' : phase === 'upload' ? 'Mengunggah ke penyimpanan...' : 'Menyimpan...';

  return (
    <div className="form-field fleet-media span-2">
      <div className="form-section-header">Foto Unit</div>
      <div className="fleet-media-grid">
        <div className="fleet-media-col">
          <span>Foto Utama Unit (Cover)</span>
          {cover?.url ? (
            <span className="photo-thumb fleet-photo-thumb">
              {/* eslint-disable-next-line @next/next/no-img-element -- signed URL R2 privat, bukan aset remote publik */}
              <img src={cover.url} alt="Foto utama unit" loading="lazy" decoding="async" />
              <button type="button" disabled={busy} onClick={() => remove(cover.id)} aria-label="Hapus foto cover" title="Hapus foto cover"><X size={13} /></button>
            </span>
          ) : (
            <span className="photo-empty"><ImagePlus size={22} /><small>Belum ada foto</small></span>
          )}
          <input ref={coverInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => pick(e, 'cover')} aria-label="Pilih foto cover" />
          <div className="fleet-media-actions">
            <Button variant="outline" size="sm" type="button" disabled={busy} onClick={() => coverInputRef.current?.click()} title="Pilih atau ambil foto (maks 10 MB, dikompres otomatis)">
              {cover ? <><Pencil size={14} />Ganti Foto</> : <><ImagePlus size={14} />+ Tambah Foto</>}
            </Button>
          </div>
        </div>
        <div className="fleet-media-col">
          <span>Galeri</span>
          {gallery.length > 0 ? (
            <div className="photo-thumbs">
              {gallery.map(g => (
                <span className="photo-thumb" key={g.id}>
                  {g.url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- signed URL R2 privat, bukan aset remote publik
                    <img src={g.url} alt="Foto galeri unit" loading="lazy" decoding="async" />
                  ) : (
                    <span className="photo-thumb-fallback" aria-hidden><ImagePlus size={18} /></span>
                  )}
                  <button type="button" disabled={busy} onClick={() => remove(g.id)} aria-label="Hapus foto galeri"><X size={13} /></button>
                </span>
              ))}
            </div>
          ) : (
            <small className="cell-sub">Belum ada foto galeri.</small>
          )}
          <input ref={galleryInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => pick(e, 'gallery')} aria-label="Pilih foto galeri" />
          <div className="fleet-media-actions">
            <Button variant="outline" size="sm" type="button" disabled={busy} onClick={() => galleryInputRef.current?.click()} title="Pilih atau ambil foto (maks 10 MB, dikompres otomatis)">
              <ImagePlus size={14} />+ Tambah Foto
            </Button>
          </div>
        </div>
      </div>
      {phase && <small className="cell-sub" role="status">{phaseLabel}{progress != null ? ` ${progress}%` : ''}</small>}
      {error && <small className="field-error">{error}</small>}
      <small className="cell-sub">Foto dikompres otomatis di browser (WebP ≤ 2 MB) dan tersimpan terpisah dari data unit.</small>
    </div>
  );
});
