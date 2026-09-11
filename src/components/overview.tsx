'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ArrowUpRight, ArrowRight, CalendarDays, ChevronDown, Download, FileText, CircleDollarSign, ReceiptText, MoreHorizontal, CircleCheck, Clock3, TriangleAlert, MapPin, ClipboardCheck, Plus, Activity } from 'lucide-react';
import { EquipmentIcon } from './icons';
import { Button } from './ui/button';
import type { DashboardData } from '@/lib/data';
import { money, shortMoney, labels, dateLabel } from '@/lib/format';

// Chart dimuat lazy di client saja — mengurangi JS first-load dasbor secara
// signifikan (recharts tidak ikut bundle awal).
const RevenueChart = dynamic(() => import('./overview-charts').then(m => m.RevenueChart), { ssr: false, loading: () => <div className="loading-chart" style={{ height: '100%' }} /> });
const FleetDonut = dynamic(() => import('./overview-charts').then(m => m.FleetDonut), { ssr: false, loading: () => <div className="loading-chart" style={{ height: '100%' }} /> });

export function Badge({ status }: { status: string }) {
  return <span className={`status-badge status-${status}`}><i />{labels[status] || status}</span>;
}

// O-A: dasbor menerima HASIL AGREGASI dari server (getDashboardData): jumlah
// armada per status, pendapatan per bulan (SUM/GROUP BY di SQL), angka unpaid/
// overdue/expiring, dan daftar terbaru terbatas. Sebelumnya halaman ini menerima
// seluruh 7 tabel lalu mengagregasinya sendiri di client setiap render.
export function Overview({ data }: { data: DashboardData }) {
  const [range, setRange] = useState('6');
  const [monthOffset, setMonthOffset] = useState('0');
  const warnDays = Number(data.settings.expiryWarningDays ?? 30) || 30;
  const tz = data.settings.timezone;

  const now = useMemo(() => new Date(), []);
  const selected = useMemo(() => new Date(now.getFullYear(), now.getMonth() + Number(monthOffset), 1), [now, monthOffset]);
  const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const revenue = useMemo(() => (d: Date) => data.revenueByMonth[monthKey(d)] || 0, [data.revenueByMonth]);

  const statusData = useMemo(() => [
    { name: 'Disewa', value: data.fleetByStatus.renting || 0, color: '#f47727', status: 'renting' },
    { name: 'Tersedia', value: data.fleetByStatus.available || 0, color: '#50a885', status: 'available' },
    { name: 'Perawatan', value: data.fleetByStatus.maintenance || 0, color: '#efbf5b', status: 'maintenance' },
    { name: 'Dalam Mobilisasi', value: data.fleetByStatus.in_transit || 0, color: '#7998bc', status: 'in_transit' },
  ], [data.fleetByStatus]);
  const monthRevenue = revenue(selected);
  const previousRevenue = revenue(new Date(selected.getFullYear(), selected.getMonth() - 1, 1));
  const growth = previousRevenue ? ((monthRevenue - previousRevenue) / previousRevenue * 100) : 0;
  const chartData = useMemo(() => Array.from({ length: Number(range) }, (_, i) => {
    const date = new Date(selected.getFullYear(), selected.getMonth() - Number(range) + 1 + i, 1);
    return { name: date.toLocaleDateString('id-ID', { month: 'short' }), current: revenue(date) / 1e6, previous: revenue(new Date(date.getFullYear(), date.getMonth() - 1, 1)) / 1e6 };
  }), [range, selected, revenue]);
  const latest = data.latest;

  return (
    <div className="overview page-enter">
      <div className="page-heading">
        <div>
          <div className="eyebrow"><span />PUSAT KENDALI OPERASIONAL</div>
          <h1>Dasbor Utama</h1>
          <p>Selamat datang kembali, <b>{data.user.fullName.split(' ')[0]}</b>. Berikut ringkasan operasional Anda hari ini.</p>
        </div>
        <div className="page-heading-actions">{['admin', 'finance', 'operations'].includes(data.user.role) && <Button variant="outline" asChild><a href="/api/report"><Download size={16} />Unduh Laporan</a></Button>}</div>
      </div>
      <div className="section-toolbar">
        <div><span className="live-dot" />Ringkasan operasional <span className="muted toolbar-date">· {dateLabel(now, tz)}</span></div>
        <label className="date-select">
          <CalendarDays size={15} />
          <select value={monthOffset} onChange={e => setMonthOffset(e.target.value)} aria-label="Pilih periode ringkasan">
            <option value="0">{now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}</option>
            <option value="-1">{new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}</option>
            <option value="-2">{new Date(now.getFullYear(), now.getMonth() - 2, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}</option>
          </select>
          <ChevronDown size={13} />
        </label>
      </div>
      <div className="metrics-grid">
        <Metric title="Total Armada" value={String(data.fleetTotal)} suffix="unit" icon={<EquipmentIcon />} tone="orange" foot={<><span className="green"><ArrowUpRight size={13} />{statusData[1].value} unit tersedia</span><span>siap disewakan</span></>} />
        <Metric title="Unit Sedang Disewa" value={String(statusData[0].value)} suffix="unit" icon={<Activity size={21} />} tone="green" foot={<><span className="green"><ArrowUpRight size={13} />{data.fleetTotal ? Math.round(statusData[0].value / data.fleetTotal * 100) : 0}% utilisasi</span><span>dari total armada</span></>} />
        <Metric title="Pendapatan Bulan Ini" value={shortMoney(monthRevenue)} icon={<CircleDollarSign size={22} />} tone="blue" foot={<><span className={growth >= 0 ? 'green' : 'red'}><ArrowUpRight size={13} />{Math.abs(growth).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%{growth < 0 ? ' turun' : ''}</span><span>dari bulan lalu</span></>} />
        <Metric title="Tagihan Belum Lunas" value={String(data.unpaidCount)} suffix="tagihan" icon={<ReceiptText size={21} />} tone="amber" foot={<><span className="amber-text"><Clock3 size={13} />{data.overdueCount} jatuh tempo</span><Link href="/dashboard/invoices">Lihat tagihan <ArrowUpRight size={12} /></Link></>} />
      </div>
      <div className="analytics-grid">
        <section className="panel revenue-panel">
          <div className="panel-header">
            <div><h2>Tren Pendapatan</h2><p>Pantau pertumbuhan pendapatan sewa Anda.</p></div>
            <label className="small-select"><select value={range} onChange={e => setRange(e.target.value)} aria-label="Periode grafik pendapatan"><option value="6">6 bulan terakhir</option><option value="12">12 bulan terakhir</option><option value="3">3 bulan terakhir</option></select><ChevronDown size={13} /></label>
          </div>
          <div className="revenue-summary">
            <div><strong>{money(totalPeriod(chartData))}</strong><span>Total pendapatan periode ini</span></div>
            <div className="chart-legend"><span><i className="orange-dot" />Pendapatan</span><span><i className="gray-dot" />Bulan sebelumnya</span></div>
          </div>
          <div className="revenue-chart"><RevenueChart data={chartData} /></div>
          <div className="chart-footer"><span><span className="live-dot" />Berdasarkan tagihan yang diterbitkan</span><Link href="/dashboard/invoices">Lihat detail pendapatan <ArrowRight size={13} /></Link></div>
        </section>
        <section className="panel fleet-status-panel">
          <div className="panel-header"><div><h2>Status Armada</h2><p>Distribusi ketersediaan alat berat.</p></div><Link href="/dashboard/fleet" className="icon-button" aria-label="Lihat detail status armada"><MoreHorizontal size={20} /></Link></div>
          <div className="donut-wrap">
            <FleetDonut data={statusData} />
            <div className="donut-center"><strong>{data.fleetTotal}</strong><span>Total unit</span></div>
          </div>
          <div className="status-legend">{statusData.map(s => <Link key={s.status} href={`/dashboard/fleet?status=${s.status}`}><span><i style={{ background: s.color }} />{s.name}</span><b>{s.value} <small>unit</small></b><span className="status-percent">{data.fleetTotal ? Math.round(s.value / data.fleetTotal * 100) : 0}%</span></Link>)}</div>
          <div className="utilization"><span>Utilisasi armada</span><b>{data.fleetTotal ? Math.round(statusData[0].value / data.fleetTotal * 100) : 0}%<ArrowUpRight size={13} /></b><div><i style={{ width: `${data.fleetTotal ? statusData[0].value / data.fleetTotal * 100 : 0}%` }} /></div></div>
        </section>
      </div>
      {data.expiringCount > 0 && <Link href="/dashboard/fleet?filter=expiring" className="expiry-banner"><span className="expiry-icon"><TriangleAlert size={18} /></span><div><b>Dokumen armada perlu diperhatikan</b><span>{data.expiringCount} unit memiliki SIKO atau asuransi yang akan berakhir dalam {warnDays} hari.</span></div><span className="expiry-link">Periksa dokumen <ArrowRight size={15} /></span></Link>}
      <div className="operations-grid">
        <section className="panel fleet-overview">
          <div className="panel-header"><div><h2>Ringkasan Armada</h2><p>Status terkini unit alat berat Anda.</p></div><Link className="text-link" href="/dashboard/fleet">Lihat semua <ArrowRight size={14} /></Link></div>
          <div className="table-scroll">
            <table><thead><tr><th>UNIT ALAT BERAT</th><th>LOKASI SAAT INI</th><th>STATUS</th><th /></tr></thead>
              <tbody>{data.recentFleet.map(f => <tr key={f.id}><td><Link className="unit-cell" href={`/dashboard/fleet?q=${f.unitCode}`}><span className="unit-icon"><EquipmentIcon width={24} height={24} /></span><span><b>{f.brandModel}</b><small>{f.unitCode} <span>·</span> {f.category}</small></span></Link></td><td><span className="location-cell"><MapPin size={13} />{f.currentLocation || '—'}</span></td><td><Badge status={f.status} /></td><td><Link href={`/dashboard/fleet?q=${f.unitCode}`} className="icon-button" aria-label={`Lihat ${f.unitCode}`}><ChevronDown size={15} className="rotate-arrow" /></Link></td></tr>)}</tbody>
            </table>
          </div>
          <div className="table-footer"><span>Menampilkan {data.recentFleet.length} dari {data.fleetTotal} unit</span><Link href="/dashboard/fleet?new=1"><Plus size={14} />Tambah unit</Link></div>
        </section>
        <section className="panel activity-panel">
          <div className="panel-header"><div><h2>Aktivitas Terbaru</h2><p>Perkembangan operasional terkini.</p></div><Clock3 size={18} className="muted" /></div>
          <div className="activity-list">
            {latest.timesheet && <ActivityItem icon={<ClipboardCheck size={16} />} tone="green" title="Catatan kerja telah dicatat" text={`${data.pendingTimesheets} catatan menunggu persetujuan operasional.`} time={dateLabel(latest.timesheet.date, tz)} href="/dashboard/timesheets" />}
            {latest.invoice && <ActivityItem icon={<ReceiptText size={16} />} tone="orange" title="Tagihan sewa diterbitkan" text={`${latest.invoice.invoiceNumber} · ${money(latest.invoice.totalAmount)}`} time={dateLabel(latest.invoice.issueDate, tz)} href="/dashboard/invoices" />}
            {latest.handover && <ActivityItem icon={<EquipmentIcon width={17} height={17} />} tone="blue" title="Serah terima unit tercatat" text="Pemeriksaan dan serah terima unit telah didokumentasikan." time={dateLabel(latest.handover.date, tz)} href="/dashboard/bast" />}
            {latest.contract && <ActivityItem icon={<FileText size={16} />} tone="purple" title="Kontrak sewa aktif" text={`${latest.contract.contractNumber} siap untuk operasional.`} time={dateLabel(latest.contract.startDate, tz)} href="/dashboard/contracts" />}
            {!latest.contract && <p className="empty-inline">Belum ada aktivitas. Mulai dengan menambahkan armada dan klien.</p>}
          </div>
          <Link className="activity-footer" href="/dashboard/timesheets">Lihat catatan operasional <ArrowRight size={14} /></Link>
        </section>
      </div>
      <div className="dashboard-bottom-note"><CircleCheck size={14} /><span>Seluruh data terhubung. Keputusan lebih tepat, operasional lebih efisien.</span></div>
    </div>
  );
}

const totalPeriod = (chartData: { current: number }[]) => chartData.reduce((a, d) => a + d.current, 0) * 1e6;

function Metric({ title, value, suffix, icon, tone, foot }: { title: string; value: string; suffix?: string; icon: React.ReactNode; tone: string; foot: React.ReactNode }) {
  return <section className="metric-card"><div className="metric-top"><span>{title}</span><span className={`metric-icon ${tone}`}>{icon}</span></div><div className="metric-value">{value}<small>{suffix}</small></div><div className="metric-foot">{foot}</div></section>;
}

function ActivityItem({ icon, tone, title, text, time, href }: { icon: React.ReactNode; tone: string; title: string; text: string; time: string; href: string }) {
  return <Link href={href} className="activity-item"><span className={`activity-icon ${tone}`}>{icon}</span><div><b>{title}</b><p>{text}</p><small>{time}</small></div></Link>;
}
