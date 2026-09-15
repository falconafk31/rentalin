'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  FileDown,
  Building2,
  Calendar,
  Clock,
  HardHat,
  Truck,
  Wrench,
  CheckCircle2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  FileText,
} from 'lucide-react';
import type { DetailedFleetHistory } from '@/lib/fleet-history';
import { Badge } from './overview';
import { money, dateLabel } from '@/lib/format';

type TabKey = 'summary' | 'contracts' | 'operators' | 'timesheets' | 'bast' | 'financials';

export function FleetHistoryView({
  data,
  timezone,
  userRole,
}: {
  data: DetailedFleetHistory;
  timezone: string;
  userRole: string;
}) {
  const isFinance = ['admin', 'finance', 'operations'].includes(userRole);
  const [activeTab, setActiveTab] = useState<TabKey>('summary');
  const [tsPage, setTsPage] = useState(1);
  const tsPageSize = 10;

  const totalTsPages = Math.ceil(data.timesheets.length / tsPageSize) || 1;
  const currentTimesheets = data.timesheets.slice((tsPage - 1) * tsPageSize, tsPage * tsPageSize);

  return (
    <div className="fleet-history-container" style={{ padding: '24px 32px 60px' }}>
      {/* Top Back Navigation */}
      <div style={{ marginBottom: 16 }}>
        <Link
          href="/dashboard/fleet"
          className="button button-outline button-sm"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <ArrowLeft size={15} /> Kembali ke Armada
        </Link>
      </div>

      {/* Main Header */}
      <div
        className="panel"
        style={{
          padding: '20px 24px',
          marginBottom: 20,
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 11, letterSpacing: '1.2px', color: '#9b9fa5', fontWeight: 650, textTransform: 'uppercase', marginBottom: 4 }}>
            Riwayat Operasional Armada
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: '#1a202c', display: 'flex', alignItems: 'center', gap: 10 }}>
            {data.unit.brandModel}
            <span style={{ fontSize: 16, fontWeight: 500, color: '#e07a38', background: '#fff5ee', padding: '2px 8px', borderRadius: 4, border: '1px solid #fed7aa' }}>
              {data.unit.unitCode}
            </span>
          </h1>
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 14, fontSize: 13, color: '#64748b' }}>
            <span>Kategori: <b>{data.unit.category}</b></span>
            <span>·</span>
            <span>Lokasi: <b>{data.unit.currentLocation || '—'}</b></span>
            <span>·</span>
            <span>Status: <Badge status={data.unit.status} /></span>
          </div>
        </div>

        <div>
          <a
            href={`/api/documents/fleet-history/${data.unit.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="button button-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            <FileDown size={16} /> Unduh PDF Riwayat
          </a>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 14,
          marginBottom: 24,
        }}
      >
        <div className="panel" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Building2 size={15} color="#3b82f6" /> Total Kontrak
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#1e293b' }}>
            {data.summary.contractCount} <span style={{ fontSize: 13, fontWeight: 400, color: '#64748b' }}>({data.summary.completedCount} selesai)</span>
          </div>
        </div>

        <div className="panel" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Calendar size={15} color="#10b981" /> Total Hari Sewa
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#1e293b' }}>
            {data.summary.workDays} <span style={{ fontSize: 13, fontWeight: 400, color: '#64748b' }}>hari aktif</span>
          </div>
        </div>

        <div className="panel" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock size={15} color="#8b5cf6" /> Jam Efektif
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#1e293b' }}>
            {data.summary.effectiveHours.toLocaleString('id-ID')} <span style={{ fontSize: 13, fontWeight: 400, color: '#64748b' }}>jam</span>
          </div>
        </div>

        <div className="panel" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Truck size={15} color="#f59e0b" /> Tingkat Utilisasi
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#e07a38' }}>
            {data.summary.utilizationRate}%
          </div>
          <small style={{ fontSize: 11, color: '#94a3b8' }}>
            Hari Kerja / Hari Sewa ({data.summary.workDays}/{data.summary.contractDays || 1} hari)
          </small>
        </div>

        {isFinance && (
          <>
            <div className="panel" style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={15} color="#059669" /> Pendapatan Unit
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#059669' }}>
                {money(data.summary.revenue || 0)}
              </div>
            </div>

            <div className="panel" style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <HardHat size={15} color="#2563eb" /> Biaya Operator
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#2563eb' }}>
                {money(data.summary.operatorCost || 0)}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Tabs Navigation */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          borderBottom: '1px solid #e2e8f0',
          marginBottom: 20,
          overflowX: 'auto',
          paddingBottom: 2,
        }}
      >
        <button
          onClick={() => setActiveTab('summary')}
          className={`button ${activeTab === 'summary' ? 'button-primary' : 'button-ghost'}`}
          style={{ height: 36, padding: '0 14px', fontSize: 13 }}
        >
          Ringkasan &amp; Legalitas
        </button>
        <button
          onClick={() => setActiveTab('contracts')}
          className={`button ${activeTab === 'contracts' ? 'button-primary' : 'button-ghost'}`}
          style={{ height: 36, padding: '0 14px', fontSize: 13 }}
        >
          Riwayat Kontrak ({data.contracts.length})
        </button>
        <button
          onClick={() => setActiveTab('operators')}
          className={`button ${activeTab === 'operators' ? 'button-primary' : 'button-ghost'}`}
          style={{ height: 36, padding: '0 14px', fontSize: 13 }}
        >
          Riwayat Operator ({data.operators.length})
        </button>
        <button
          onClick={() => setActiveTab('timesheets')}
          className={`button ${activeTab === 'timesheets' ? 'button-primary' : 'button-ghost'}`}
          style={{ height: 36, padding: '0 14px', fontSize: 13 }}
        >
          Timesheet Harian ({data.timesheets.length})
        </button>
        <button
          onClick={() => setActiveTab('bast')}
          className={`button ${activeTab === 'bast' ? 'button-primary' : 'button-ghost'}`}
          style={{ height: 36, padding: '0 14px', fontSize: 13 }}
        >
          BAST Serah Terima ({data.handovers.length})
        </button>
        {isFinance && (
          <button
            onClick={() => setActiveTab('financials')}
            className={`button ${activeTab === 'financials' ? 'button-primary' : 'button-ghost'}`}
            style={{ height: 36, padding: '0 14px', fontSize: 13 }}
          >
            Keuangan ({data.financials?.invoices.length || 0})
          </button>
        )}
      </div>

      {/* Tab 1: Ringkasan & Legalitas */}
      {activeTab === 'summary' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
          <div className="panel" style={{ padding: 22 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 16px', color: '#1e293b' }}>
              Spesifikasi &amp; Detail Alat
            </h3>
            <div className="summary-box">
              <div><span>Kode Unit</span><b>{data.unit.unitCode}</b></div>
              <div><span>Merek / Model</span><b>{data.unit.brandModel}</b></div>
              <div><span>Kategori</span><b>{data.unit.category}</b></div>
              <div><span>Tahun Pembuatan</span><b>{data.unit.year || '—'}</b></div>
              <div><span>Tarif Sewa Dasar</span><b>{money(data.unit.hourlyRate)} / jam</b></div>
              <div><span>Lokasi Saat Ini</span><b>{data.unit.currentLocation || '—'}</b></div>
              <div><span>Total HM Terpakai</span><b>{data.summary.hmUsed !== null ? `${data.summary.hmUsed.toLocaleString('id-ID')} HM` : '—'}</b></div>
              <div><span>Total Jam Kerusakan (Breakdown)</span><b>{data.summary.breakdownHours.toLocaleString('id-ID')} jam</b></div>
            </div>
          </div>

          <div className="panel" style={{ padding: 22 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 16px', color: '#1e293b' }}>
              Legalitas &amp; Dokumen Keselamatan
            </h3>
            <div className="summary-box">
              <div>
                <span>Masa Berlaku SIKO</span>
                <b>{data.unit.sikoExpiry ? dateLabel(data.unit.sikoExpiry, timezone) : 'Belum tercatat'}</b>
              </div>
              <div>
                <span>Masa Berlaku Asuransi</span>
                <b>{data.unit.insuranceExpiry ? dateLabel(data.unit.insuranceExpiry, timezone) : 'Belum tercatat'}</b>
              </div>
              <div>
                <span>Status Kesiapan Operasi</span>
                <Badge status={data.unit.status} />
              </div>
              <div>
                <span>Formula Utilisasi</span>
                <span style={{ fontSize: 12, color: '#64748b', textAlign: 'right' }}>
                  (Hari Kerja ÷ Hari Sewa) × 100%
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Riwayat Kontrak */}
      {activeTab === 'contracts' && (
        <div className="panel" style={{ overflowX: 'auto' }}>
          <table className="module-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', fontSize: 12, color: '#475569' }}>
                <th style={{ padding: '12px 16px' }}>No. Kontrak</th>
                <th style={{ padding: '12px 16px' }}>Klien</th>
                <th style={{ padding: '12px 16px' }}>Periode Sewa</th>
                <th style={{ padding: '12px 16px' }}>Layanan</th>
                <th style={{ padding: '12px 16px' }}>Operator Ditugaskan</th>
                {isFinance && <th style={{ padding: '12px 16px', textAlign: 'right' }}>Pendapatan Kontrak</th>}
                <th style={{ padding: '12px 16px', textAlign: 'center' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.contracts.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
                    Belum ada riwayat kontrak untuk unit ini.
                  </td>
                </tr>
              ) : (
                data.contracts.map((c) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600 }}>{c.contractNumber}</td>
                    <td style={{ padding: '12px 16px' }}>{c.clientName || '—'}</td>
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                      {dateLabel(c.startDate, timezone)} s.d. {dateLabel(c.endDate, timezone)}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: 4,
                          background: c.includeOperator ? '#eff6ff' : '#f1f5f9',
                          color: c.includeOperator ? '#1d4ed8' : '#475569',
                          border: `1px solid ${c.includeOperator ? '#bfdbfe' : '#e2e8f0'}`,
                        }}
                      >
                        {c.includeOperator ? 'WET HIRE' : 'DRY HIRE'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: '#334155' }}>
                      {c.assignedOperators.length > 0 ? c.assignedOperators.join(', ') : '—'}
                    </td>
                    {isFinance && (
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: '#0f766e' }}>
                        {money(c.totalRevenue || 0)}
                      </td>
                    )}
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <Badge status={c.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 3: Riwayat Operator */}
      {activeTab === 'operators' && (
        <div className="panel" style={{ overflowX: 'auto' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#334155' }}>
              Personel yang Pernah Mengoperasikan Unit Ini
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
              Berdasarkan pencatatan fisik operator/driver pada lembar timesheet kerja harian.
            </p>
          </div>
          <table className="module-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', fontSize: 12, color: '#475569' }}>
                <th style={{ padding: '12px 16px' }}>Nama Operator</th>
                <th style={{ padding: '12px 16px' }}>SIO / Lisensi</th>
                <th style={{ padding: '12px 16px', textAlign: 'center' }}>Jumlah Log</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Total Jam Kerja Efektif</th>
                <th style={{ padding: '12px 16px', textAlign: 'center' }}>Penugasan Pertama</th>
                <th style={{ padding: '12px 16px', textAlign: 'center' }}>Penugasan Terakhir</th>
              </tr>
            </thead>
            <tbody>
              {data.operators.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
                    Belum ada riwayat operator fisik yang tercatat mengoperasikan unit ini.
                  </td>
                </tr>
              ) : (
                data.operators.map((o, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <HardHat size={16} color="#e07a38" />
                        {o.name}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#475569' }}>{o.sioClass || '—'}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>{o.logs} log</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: '#1e293b' }}>
                      {o.effectiveHours.toLocaleString('id-ID')} jam
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: 12, color: '#64748b' }}>
                      {o.firstDate ? dateLabel(o.firstDate, timezone) : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: 12, color: '#64748b' }}>
                      {o.lastDate ? dateLabel(o.lastDate, timezone) : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 4: Timesheet Harian (Paginated) */}
      {activeTab === 'timesheets' && (
        <div className="panel" style={{ overflowX: 'auto' }}>
          <table className="module-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', fontSize: 12, color: '#475569' }}>
                <th style={{ padding: '12px 16px' }}>Tanggal</th>
                <th style={{ padding: '12px 16px' }}>No. Kontrak</th>
                <th style={{ padding: '12px 16px' }}>Operator Pengemudi</th>
                <th style={{ padding: '12px 16px' }}>HM Awal - Akhir</th>
                <th style={{ padding: '12px 16px', textAlign: 'center' }}>Breakdown</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Jam Efektif</th>
                <th style={{ padding: '12px 16px', textAlign: 'center' }}>Status</th>
                <th style={{ padding: '12px 16px' }}>Tagihan</th>
              </tr>
            </thead>
            <tbody>
              {currentTimesheets.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
                    Belum ada lembar timesheet untuk unit ini.
                  </td>
                </tr>
              ) : (
                currentTimesheets.map((t) => (
                  <tr key={t.id} style={{ borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                    <td style={{ padding: '12px 16px', fontWeight: 500 }}>{dateLabel(t.date, timezone)}</td>
                    <td style={{ padding: '12px 16px' }}>{t.contractNumber || '—'}</td>
                    <td style={{ padding: '12px 16px' }}>{t.driver || '—'}</td>
                    <td style={{ padding: '12px 16px' }}>
                      {Number(t.startHm).toLocaleString('id-ID')} s.d. {Number(t.endHm).toLocaleString('id-ID')}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', color: Number(t.breakdownHours) > 0 ? '#b91c1c' : '#64748b' }}>
                      {Number(t.breakdownHours) > 0 ? `${t.breakdownHours} jam` : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: '#0f766e' }}>
                      {Number(t.effectiveHours).toLocaleString('id-ID')} jam
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <Badge status={t.status} />
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>
                      {t.invoiceNumber ? <span style={{ fontWeight: 500, color: '#2563eb' }}>{t.invoiceNumber}</span> : 'Belum ditagihkan'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Pagination Toolbar */}
          {data.timesheets.length > tsPageSize && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderTop: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                Menampilkan {(tsPage - 1) * tsPageSize + 1} s.d. {Math.min(tsPage * tsPageSize, data.timesheets.length)} dari {data.timesheets.length} log
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className="button button-outline button-sm"
                  disabled={tsPage <= 1}
                  onClick={() => setTsPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft size={14} /> Sebelumnya
                </button>
                <button
                  className="button button-outline button-sm"
                  disabled={tsPage >= totalTsPages}
                  onClick={() => setTsPage((p) => Math.min(totalTsPages, p + 1))}
                >
                  Berikutnya <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 5: BAST Serah Terima */}
      {activeTab === 'bast' && (
        <div className="panel" style={{ overflowX: 'auto' }}>
          <table className="module-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', fontSize: 12, color: '#475569' }}>
                <th style={{ padding: '12px 16px' }}>No. BAST</th>
                <th style={{ padding: '12px 16px' }}>Jenis Dokumen</th>
                <th style={{ padding: '12px 16px' }}>Tanggal</th>
                <th style={{ padding: '12px 16px' }}>Kontrak Terkait</th>
                <th style={{ padding: '12px 16px', textAlign: 'center' }}>Kondisi Fisik (12 Komponen)</th>
                <th style={{ padding: '12px 16px', textAlign: 'center' }}>Foto Inspeksi</th>
                <th style={{ padding: '12px 16px' }}>Catatan</th>
              </tr>
            </thead>
            <tbody>
              {data.handovers.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
                    Belum ada dokumen BAST untuk unit ini.
                  </td>
                </tr>
              ) : (
                data.handovers.map((h) => (
                  <tr key={h.id} style={{ borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600 }}>{h.documentNumber}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: 4,
                          background: h.type === 'mobilization' ? '#ecfdf5' : '#fef2f2',
                          color: h.type === 'mobilization' ? '#047857' : '#b91c1c',
                        }}
                      >
                        {h.type === 'mobilization' ? 'Mobilisasi' : 'Demobilisasi'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>{dateLabel(h.date, timezone)}</td>
                    <td style={{ padding: '12px 16px' }}>{h.contractNumber || '—'}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <span style={{ fontWeight: 600, color: h.checklistOkCount === h.checklistTotalCount ? '#059669' : '#d97706' }}>
                        {h.checklistOkCount} / {h.checklistTotalCount} Sesuai
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      {h.photoCount > 0 ? (
                        <span style={{ fontSize: 12, color: '#2563eb', fontWeight: 500 }}>
                          {h.photoCount} foto terlampir
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>Tanpa foto</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>
                      {h.notes || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 6: Keuangan (Role-gated) */}
      {isFinance && activeTab === 'financials' && data.financials && (
        <div className="panel" style={{ overflowX: 'auto' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
                Histori Penagihan &amp; Pembayaran Unit
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
                Ringkasan faktur tagihan yang diterbitkan berdasarkan penggunaan unit alat berat ini.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              <div>
                <span style={{ fontSize: 11, color: '#64748b', display: 'block' }}>Total Pendapatan Terbit</span>
                <b style={{ fontSize: 16, color: '#047857' }}>{money(data.financials.totalRevenue)}</b>
              </div>
              <div>
                <span style={{ fontSize: 11, color: '#64748b', display: 'block' }}>Total Porsi Jasa Operator</span>
                <b style={{ fontSize: 16, color: '#2563eb' }}>{money(data.financials.totalOperatorCost)}</b>
              </div>
            </div>
          </div>
          <table className="module-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', fontSize: 12, color: '#475569' }}>
                <th style={{ padding: '12px 16px' }}>No. Faktur</th>
                <th style={{ padding: '12px 16px' }}>No. Kontrak</th>
                <th style={{ padding: '12px 16px' }}>Tanggal Terbit</th>
                <th style={{ padding: '12px 16px' }}>Jatuh Tempo</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Subtotal Sewa</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Jasa Operator</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Total Tagihan</th>
                <th style={{ padding: '12px 16px', textAlign: 'center' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.financials.invoices.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
                    Belum ada faktur penagihan yang tercatat untuk unit ini.
                  </td>
                </tr>
              ) : (
                data.financials.invoices.map((inv) => (
                  <tr key={inv.id} style={{ borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600 }}>{inv.invoiceNumber}</td>
                    <td style={{ padding: '12px 16px' }}>{inv.contractNumber || '—'}</td>
                    <td style={{ padding: '12px 16px' }}>{dateLabel(inv.issueDate, timezone)}</td>
                    <td style={{ padding: '12px 16px' }}>{dateLabel(inv.dueDate, timezone)}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>{money(inv.subtotalAmount)}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', color: Number(inv.operatorAmount) > 0 ? '#2563eb' : '#64748b' }}>
                      {money(inv.operatorAmount)}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#0f766e' }}>
                      {money(inv.totalAmount)}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <Badge status={inv.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
