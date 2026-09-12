'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useRef, useMemo } from 'react';
import { LayoutDashboard, FileText, ClipboardList, ClipboardCheck, ReceiptText, Settings2, Search, Bell, ChevronDown, ChevronRight, ChevronsLeft, PanelLeftOpen, CircleHelp, ArrowUpRight, X, LogOut, Home, Menu, ScrollText, LoaderCircle, Building2, UsersRound } from 'lucide-react';
import { EquipmentIcon, BrandMark } from './icons';
import { Modal } from './ui/dialog';
import { signOut } from '@/app/actions';
import { labels, dateLabel } from '@/lib/format';
import type { ShellData, SearchResult } from '@/lib/data';
import type { ElementType } from 'react';

type NavEntry = { path: string; label: string; icon: ElementType; section: string; adminOnly?: boolean };
export const navigation: NavEntry[] = [
  { path: '/dashboard', label: 'Dasbor Utama', icon: LayoutDashboard, section: '' },
  { path: '/dashboard/fleet', label: 'Armada Alat Berat', icon: EquipmentIcon, section: 'DATA POKOK' },
  { path: '/dashboard/clients', label: 'Data Klien', icon: Building2, section: 'DATA POKOK' },
  { path: '/dashboard/contracts', label: '1. Kontrak Sewa', icon: FileText, section: 'SEWA BERJALAN' },
  { path: '/dashboard/bast', label: '2. BAST Serah Terima', icon: ClipboardCheck, section: 'SEWA BERJALAN' },
  { path: '/dashboard/timesheets', label: '3. Timesheet Harian', icon: ClipboardList, section: 'SEWA BERJALAN' },
  { path: '/dashboard/invoices', label: '4. Penagihan Invoice', icon: ReceiptText, section: 'KEUANGAN' },
  { path: '/dashboard/settings', label: 'Pengaturan', icon: Settings2, section: 'LAINNYA' },
  { path: '/dashboard/users', label: 'Pengguna & Peran', icon: UsersRound, section: 'LAINNYA', adminOnly: true },
  { path: '/dashboard/audit', label: 'Log Audit', icon: ScrollText, section: 'LAINNYA', adminOnly: true },
];
const navSections = ['DATA POKOK', 'SEWA BERJALAN', 'KEUANGAN', 'LAINNYA'];

export function Shell({ data, children }: { data: ShellData; children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [profile, setProfile] = useState(false);
  const [help, setHelp] = useState(false);
  // Zona waktu kalender perusahaan untuk label tanggal (WIB default).
  const tz = data.settings.timezone;
  // O-A: angka badge/pemberitahuan berasal dari count SQL (data.counts) —
  // shell tidak lagi menerima koleksi penuh untuk menghitungnya di client.
  const { pendingTimesheets: pending, unpaidInvoices: unpaid, overdueInvoices: overdue, expiringFleet } = data.counts;

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setNotifications(false); setProfile(false); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const current = useMemo(
    () => navigation.find(n => n.path === pathname) || navigation.find(n => n.path !== '/dashboard' && pathname.startsWith(n.path)),
    [pathname],
  );
  const visibleNav = useMemo(() => navigation.filter(n => !n.adminOnly || data.user.role === 'admin'), [data.user.role]);

  return (
    <div className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
      {mobile && <div className="mobile-backdrop" onClick={() => setMobile(false)} />}
      <aside className={`sidebar ${mobile ? 'mobile-open' : ''}`}>
        <Link className="brand" href="/dashboard"><BrandMark /><div className="brand-copy"><div>HEAVY<span>OPS</span><span className="brand-dot">.</span></div><small>Sistem Manajemen Rental</small></div></Link>
        <div className="workspace-label"><span>RUANG KERJA</span><button className="icon-button collapse-button" aria-label="Ciutkan menu" onClick={() => setCollapsed(!collapsed)}>{collapsed ? <PanelLeftOpen size={16} /> : <ChevronsLeft size={16} />}</button></div>
        <nav className="navigation">
          {visibleNav.filter(n => !n.section).map((n) => {
            const active = pathname === n.path;
            return <Link href={n.path} className={`nav-item ${active ? 'active' : ''}`} key={n.path} title={n.label} onClick={() => setMobile(false)}><n.icon width={19} height={19} /><span>{n.label}</span></Link>;
          })}
          {navSections.map(sec => {
            const items = visibleNav.filter(n => n.section === sec);
            if (!items.length) return null;
            return (
              <div key={sec}>
                <div className="workspace-label settings-label nav-section"><span>{sec}</span></div>
                {items.map((n) => {
                  const active = pathname === n.path || (n.path !== '/dashboard' && pathname.startsWith(n.path));
                  return (
                    <Link href={n.path} className={`nav-item ${active ? 'active' : ''}`} key={n.path} title={n.label} onClick={() => setMobile(false)}>
                      <n.icon width={19} height={19} /><span>{n.label}</span>
                      {n.path === '/dashboard/timesheets' && pending > 0 && <b className="nav-count">{pending}</b>}
                      {n.path === '/dashboard/invoices' && unpaid > 0 && <b className="nav-count plain">{unpaid}</b>}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>
        <div className="nav-divider" />
        <button className="nav-item" onClick={() => { setHelp(true); setMobile(false); }} title="Pusat bantuan"><CircleHelp size={19} /><span>Pusat Bantuan</span><ArrowUpRight size={15} style={{ marginLeft: 'auto' }} /></button>
        <div className="sidebar-bottom">
          <div className="system-status"><span />Sistem beroperasi normal</div>
          <div className="sidebar-copyright">© {new Date().getFullYear()} HeavyOps <span>v1.0</span></div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button className="icon-button mobile-menu" aria-label="Buka menu" onClick={() => setMobile(true)}><Menu size={21} /></button>
            <Home size={16} /><span>Ruang kerja</span><ChevronRight size={13} />
            <b>{current?.label || 'Dasbor Utama'}</b>
          </div>
          <div className="header-actions">
            <GlobalSearch role={data.user.role} />
            <div className="header-popover-wrap">
              <button className={`notification-button icon-button ${notifications ? 'selected' : ''}`} aria-label="Lihat pemberitahuan" onClick={() => { setNotifications(!notifications); setProfile(false); }}>
                <Bell size={20} />{(pending > 0 || expiringFleet > 0 || overdue > 0) && <i />}
              </button>
              {notifications && (
                <div className="header-popover notifications">
                  <h4>Pemberitahuan <span>{pending + expiringFleet + overdue}</span></h4>
                  <Link href="/dashboard/timesheets" onClick={() => setNotifications(false)}><span className="activity-icon orange"><ClipboardList size={18} /></span><div><b>{pending} catatan menunggu persetujuan</b><p>Periksa catatan kerja harian operator.</p></div></Link>
                  <Link href="/dashboard/fleet?filter=expiring" onClick={() => setNotifications(false)}><span className="activity-icon amber"><FileText size={18} /></span><div><b>{expiringFleet} dokumen perlu diperhatikan</b><p>SIKO atau asuransi akan berakhir.</p></div></Link>
                  {overdue > 0 && <Link href="/dashboard/invoices" onClick={() => setNotifications(false)}><span className="activity-icon green"><ReceiptText size={18} /></span><div><b>{overdue} tagihan jatuh tempo</b><p>Segera tindak lanjuti pembayaran klien.</p></div></Link>}
                </div>
              )}
            </div>
            <div className="header-separator" />
            <div className="header-popover-wrap">
              <button className="profile-button" onClick={() => { setProfile(!profile); setNotifications(false); }}>
                <span className="avatar">{data.user.fullName.split(' ').map(n => n[0]).slice(0, 2).join('')}</span>
                <span className="profile-copy"><b>{data.user.fullName}</b><small>{labels[data.user.role]}</small></span>
                <ChevronDown size={15} />
              </button>
              {profile && (
                <div className="header-popover profile-menu">
                  <b>{data.user.fullName}</b><p>{data.user.email}</p>
                  {data.user.preview && <span className="preview-label">Mode pratinjau · Data demonstrasi</span>}
                  <Link href="/dashboard/settings" onClick={() => setProfile(false)}><Settings2 size={16} />Pengaturan akun</Link>
                  <form action={signOut}><button><LogOut size={16} />Keluar dari sistem</button></form>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="page-content">{children}</main>
        <footer className="main-footer"><span>© {new Date().getFullYear()} PT Penyewaan Alat Berat. Seluruh hak dilindungi.</span><span><span className="footer-dot" />{data.user.preview ? 'Lingkungan pratinjau' : 'Koneksi aman'}<i />Waktu Indonesia Barat (WIB)</span></footer>
      </div>
      <Modal open={help} onOpenChange={setHelp} title="Pusat Bantuan HeavyOps" description="Dukungan untuk kelancaran operasional Anda.">
        <div className="help-content">
          <div className="info-callout"><CircleHelp size={20} /><p>Untuk kendala akses, perubahan hak pengguna, atau pertanyaan operasional, silakan hubungi administrator sistem Anda.</p></div>
          <a href={`mailto:${data.settings.email}`}>{data.settings.email || 'Surel belum diatur'}</a>
          <a href={`tel:${data.settings.phone}`}>{data.settings.phone || 'Telepon belum diatur'}</a>
          <hr />
          <h4>Panduan singkat</h4>
          <p>1. Daftarkan armada &amp; klien di DATA POKOK.</p>
          <p>2. Buat 1. Kontrak Sewa (unit jadi Disewa).</p>
          <p>3. Buat 2. BAST Mobilisasi saat unit tiba.</p>
          <p>4. Catat 3. Timesheet Harian lalu minta persetujuan.</p>
          <p>5. Terbitkan 4. Penagihan Invoice dari jam approved, lalu catat pembayaran.</p>
          <p>6. Buat BAST Demobilisasi lalu selesaikan kontrak.</p>
          <small>Terakhir diperbarui: {dateLabel(new Date(), tz)}</small>
        </div>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pencarian global — state ketikan terisolasi di komponen sendiri.
// O-A: corpus record TIDAK lagi berasal dari payload layout; ketikan di-debounce
// 250 ms lalu ditanyakan ke /api/search (ILIKE di server, maks 7 hasil). Item
// menu tetap dicari di client dari daftar navigasi statis.
// Sebelumnya query tinggal di Shell sehingga tiap ketikan me-render ulang
// seluruh sidebar + topbar dan membangun ulang daftar semua record.
// ---------------------------------------------------------------------------
function GlobalSearch({ role }: { role: string }) {
  const [query, setQuery] = useState('');
  // Hasil terakhir disimpan bersama query-nya; "loading" dan "hasil" DITURUNKAN
  // (bukan state yang di-set sinkron di effect — anti-pattern react-hooks v6).
  const [loaded, setLoaded] = useState<{ q: string; items: SearchResult[] }>({ q: '', items: [] });
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') { event.preventDefault(); searchRef.current?.focus(); }
      if (event.key === 'Escape') setQuery('');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const trimmed = query.trim();

  useEffect(() => {
    if (!trimmed) return;
    const controller = new AbortController();
    // Debounce 250 ms agar tidak satu request per ketikan.
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal });
        const json = res.ok ? await res.json() as { results?: SearchResult[] } : {};
        setLoaded({ q: trimmed, items: json.results ?? [] });
      } catch { /* dibatalkan request berikutnya / offline */ }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [trimmed]);

  const menuMatches = useMemo(() => {
    const q = trimmed.toLowerCase();
    if (!q) return [];
    return navigation.filter(n => (!n.adminOnly || role === 'admin') && n.label.toLowerCase().includes(q))
      .map(n => ({ label: n.label, sub: n.section ? `${n.section} · Menu` : 'Menu ruang kerja', path: n.path }));
  }, [trimmed, role]);
  const loading = trimmed.length > 0 && loaded.q !== trimmed;
  const combined = useMemo(() => {
    const serverResults = trimmed && loaded.q === trimmed ? loaded.items : [];
    return [...menuMatches, ...serverResults].slice(0, 7);
  }, [menuMatches, trimmed, loaded]);

  return (
    <div className="global-search">
      <Search size={16} />
      <input ref={searchRef} placeholder="Cari di ruang kerja..." value={query} onChange={e => setQuery(e.target.value)} aria-label="Cari di ruang kerja" />
      <kbd>⌘ K</kbd>
      {query && (
        <div className="search-results">
          <div className="popover-label">HASIL PENCARIAN{loading && <LoaderCircle size={13} className="spin" />} <button aria-label="Tutup pencarian" onClick={() => setQuery('')}><X size={14} /></button></div>
          {combined.length ? combined.map(r => <Link key={`${r.path}-${r.label}`} href={r.path} onClick={() => setQuery('')}><Search size={15} /><div>{r.label}<small>{r.sub}</small></div><ChevronRight size={14} /></Link>) : <p>{loading ? 'Mencari...' : 'Tidak ada hasil ditemukan.'}</p>}
        </div>
      )}
    </div>
  );
}
