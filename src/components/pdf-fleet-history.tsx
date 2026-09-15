import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { CompanySettings } from '@/lib/data';
import type { DetailedFleetHistory } from '@/lib/fleet-history';
import { money, dateLabel } from '@/lib/format';

const styles = StyleSheet.create({
  page: {
    paddingTop: 24,
    paddingBottom: 40,
    paddingHorizontal: 32,
    fontFamily: 'Helvetica',
    fontSize: 7.5,
    color: '#2d3748',
    lineHeight: 1.35,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1.5,
    borderBottomColor: '#df7a38',
    paddingBottom: 6,
    marginBottom: 10,
  },
  logo: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: '#1a202c' },
  logoAccent: { color: '#df7a38' },
  companyName: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#2d3748' },
  companySub: { fontSize: 6.8, color: '#718096' },
  fleetBanner: {
    backgroundColor: '#fffaf0',
    borderWidth: 1,
    borderColor: '#feebc8',
    borderRadius: 4,
    padding: 8,
    marginBottom: 10,
  },
  fleetHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  unitCode: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#c05621' },
  statusBadge: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#2b6cb0' },
  grid4: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  gridItem: { width: '25%', marginBottom: 3 },
  gridLabel: { fontSize: 6.5, color: '#718096' },
  gridVal: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#2d3748' },
  sectionTitle: {
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    color: '#2d3748',
    marginTop: 8,
    marginBottom: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e2e8f0',
    paddingBottom: 2,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#f7fafc',
    borderWidth: 0.8,
    borderColor: '#e2e8f0',
    borderRadius: 3,
    padding: 6,
    marginBottom: 8,
  },
  kpiBox: { width: '25%', marginBottom: 4 },
  kpiLabel: { fontSize: 6.5, color: '#718096' },
  kpiVal: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: '#1a202c', marginTop: 1 },
  table: { marginTop: 2, borderWidth: 0.6, borderColor: '#e2e8f0', marginBottom: 6 },
  tableHead: {
    flexDirection: 'row',
    backgroundColor: '#edf2f7',
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderBottomWidth: 0.6,
    borderBottomColor: '#cbd5e0',
    fontSize: 6.8,
    fontFamily: 'Helvetica-Bold',
    color: '#4a5568',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 2.5,
    paddingHorizontal: 4,
    borderBottomWidth: 0.4,
    borderBottomColor: '#e2e8f0',
    fontSize: 6.8,
  },
  emptyNote: { fontSize: 7, color: '#a0aec0', fontStyle: 'italic', marginVertical: 3 },
  pageFooter: {
    position: 'absolute',
    bottom: 16,
    left: 32,
    right: 32,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 6.5,
    color: '#a0aec0',
    borderTopWidth: 0.5,
    borderTopColor: '#e2e8f0',
    paddingTop: 4,
  },
});

export type FleetHistoryPdfProps = {
  settings: CompanySettings;
  data: DetailedFleetHistory;
  printedAt: string;
};

export function SingleFleetHistoryDocument({ settings, data, printedAt }: FleetHistoryPdfProps) {
  const tz = settings.timezone;
  const isFinance = !!data.financials;

  return (
    <Document title={`Riwayat-${data.unit.unitCode}.pdf`} author={settings.companyName}>
      <Page size="A4" style={styles.page} wrap>
        {/* Letterhead */}
        <View style={styles.header} fixed>
          <View>
            <Text style={styles.logo}>
              HEAVY<Text style={styles.logoAccent}>OPS</Text>
            </Text>
            <Text style={styles.companyName}>{settings.companyName}</Text>
            <Text style={styles.companySub}>{settings.address} · {settings.phone}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#718096' }}>LAPORAN RIWAYAT OPERASIONAL LENGKAP</Text>
            <Text style={{ fontSize: 7, color: '#a0aec0' }}>Dicetak: {printedAt}</Text>
          </View>
        </View>

        {/* Fleet Banner */}
        <View style={styles.fleetBanner}>
          <View style={styles.fleetHeaderRow}>
            <Text style={styles.unitCode}>{data.unit.unitCode} — {data.unit.brandModel}</Text>
            <Text style={styles.statusBadge}>Status: {data.unit.status.toUpperCase()}</Text>
          </View>
          <View style={styles.grid4}>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>Kategori</Text>
              <Text style={styles.gridVal}>{data.unit.category}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>Tahun Pembuatan</Text>
              <Text style={styles.gridVal}>{data.unit.year || '-'}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>Lokasi Terkini</Text>
              <Text style={styles.gridVal}>{data.unit.currentLocation || '-'}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>Tarif Standar</Text>
              <Text style={styles.gridVal}>{money(data.unit.hourlyRate)}/jam</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>Masa Berlaku SIKO</Text>
              <Text style={styles.gridVal}>{data.unit.sikoExpiry ? dateLabel(data.unit.sikoExpiry, tz) : '-'}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>Masa Berlaku Asuransi</Text>
              <Text style={styles.gridVal}>{data.unit.insuranceExpiry ? dateLabel(data.unit.insuranceExpiry, tz) : '-'}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>Total Kontrak</Text>
              <Text style={styles.gridVal}>{data.summary.contractCount} ({data.summary.completedCount} selesai)</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>Hari Kerja Disetujui</Text>
              <Text style={styles.gridVal}>{data.summary.workDays} hari</Text>
            </View>
          </View>
        </View>

        {/* Summary KPIs */}
        <View style={styles.kpiGrid}>
          <View style={styles.kpiBox}>
            <Text style={styles.kpiLabel}>Total Jam Efektif (Approved)</Text>
            <Text style={styles.kpiVal}>{data.summary.effectiveHours.toLocaleString('id-ID')} jam</Text>
          </View>
          <View style={styles.kpiBox}>
            <Text style={styles.kpiLabel}>Durasi Kerusakan (Breakdown)</Text>
            <Text style={styles.kpiVal}>{data.summary.breakdownHours.toLocaleString('id-ID')} jam</Text>
          </View>
          <View style={styles.kpiBox}>
            <Text style={styles.kpiLabel}>Total HM Terpakai (Σ Interval)</Text>
            <Text style={styles.kpiVal}>{data.summary.hmUsed !== null ? `${data.summary.hmUsed.toLocaleString('id-ID')} HM` : '0 HM'}</Text>
          </View>
          <View style={styles.kpiBox}>
            <Text style={styles.kpiLabel}>Tingkat Utilisasi</Text>
            <Text style={[styles.kpiVal, { color: '#c05621' }]}>{data.summary.utilizationRate}%</Text>
          </View>
          {isFinance && (
            <>
              <View style={[styles.kpiBox, { width: '50%', marginTop: 4 }]}>
                <Text style={styles.kpiLabel}>Total Nilai Tagihan Terbit (Invoices)</Text>
                <Text style={[styles.kpiVal, { color: '#276749' }]}>{money(data.summary.totalInvoiced || 0)}</Text>
              </View>
              <View style={[styles.kpiBox, { width: '50%', marginTop: 4 }]}>
                <Text style={styles.kpiLabel}>Total Jasa Operator pada Invoice</Text>
                <Text style={[styles.kpiVal, { color: '#2b6cb0' }]}>{money(data.summary.operatorBilled || 0)}</Text>
              </View>
            </>
          )}
        </View>

        {/* Contract History (Complete) */}
        <Text style={styles.sectionTitle}>RIWAYAT KONTRAK SEWA ({data.contracts.length})</Text>
        {data.contracts.length === 0 ? (
          <Text style={styles.emptyNote}>Belum ada riwayat kontrak.</Text>
        ) : (
          <View style={styles.table}>
            <View style={styles.tableHead}>
              <Text style={{ width: '22%' }}>No. Kontrak</Text>
              <Text style={{ width: '25%' }}>Klien</Text>
              <Text style={{ width: '23%' }}>Periode</Text>
              <Text style={{ width: '15%' }}>Layanan</Text>
              <Text style={{ width: '15%', textAlign: 'right' }}>Status</Text>
            </View>
            {data.contracts.map((c) => (
              <View style={styles.tableRow} key={c.id}>
                <Text style={{ width: '22%', fontFamily: 'Helvetica-Bold' }}>{c.contractNumber}</Text>
                <Text style={{ width: '25%' }}>{c.clientName || '-'}</Text>
                <Text style={{ width: '23%' }}>{dateLabel(c.startDate, tz)} - {dateLabel(c.endDate, tz)}</Text>
                <Text style={{ width: '15%' }}>{c.includeOperator ? 'Wet Hire' : 'Dry Hire'}</Text>
                <Text style={{ width: '15%', textAlign: 'right' }}>{c.status.toUpperCase()}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Operator History (Complete) */}
        <Text style={styles.sectionTitle}>RIWAYAT PERSONEL OPERATOR ({data.operators.length})</Text>
        {data.operators.length === 0 ? (
          <Text style={styles.emptyNote}>Belum ada riwayat operator pada unit ini.</Text>
        ) : (
          <View style={styles.table}>
            <View style={styles.tableHead}>
              <Text style={{ width: '30%' }}>Nama Operator</Text>
              <Text style={{ width: '22%' }}>SIO / Lisensi</Text>
              <Text style={{ width: '16%', textAlign: 'center' }}>Total Log</Text>
              <Text style={{ width: '16%', textAlign: 'right' }}>Jam Efektif</Text>
              <Text style={{ width: '16%', textAlign: 'right' }}>Terakhir Aktif</Text>
            </View>
            {data.operators.map((o, idx) => (
              <View style={styles.tableRow} key={idx}>
                <Text style={{ width: '30%', fontFamily: 'Helvetica-Bold' }}>{o.name}</Text>
                <Text style={{ width: '22%' }}>{o.sioClass || '-'}</Text>
                <Text style={{ width: '16%', textAlign: 'center' }}>{o.logs}</Text>
                <Text style={{ width: '16%', textAlign: 'right' }}>{o.effectiveHours.toLocaleString('id-ID')} jam</Text>
                <Text style={{ width: '16%', textAlign: 'right' }}>{o.lastDate ? dateLabel(o.lastDate, tz) : '-'}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Timesheet Complete History */}
        <Text style={styles.sectionTitle}>RIWAYAT TIMESHEET HARIAN ({data.timesheets.length})</Text>
        {data.timesheets.length === 0 ? (
          <Text style={styles.emptyNote}>Belum ada riwayat timesheet.</Text>
        ) : (
          <View style={styles.table}>
            <View style={styles.tableHead}>
              <Text style={{ width: '18%' }}>Tanggal</Text>
              <Text style={{ width: '25%' }}>Operator</Text>
              <Text style={{ width: '25%' }}>HM (Awal - Akhir)</Text>
              <Text style={{ width: '17%', textAlign: 'right' }}>Jam Efektif</Text>
              <Text style={{ width: '15%', textAlign: 'right' }}>Status</Text>
            </View>
            {data.timesheets.map((t) => (
              <View style={styles.tableRow} key={t.id}>
                <Text style={{ width: '18%' }}>{dateLabel(t.date, tz)}</Text>
                <Text style={{ width: '25%' }}>{t.driver || '-'}</Text>
                <Text style={{ width: '25%' }}>{Number(t.startHm).toLocaleString('id-ID')} - {Number(t.endHm).toLocaleString('id-ID')}</Text>
                <Text style={{ width: '17%', textAlign: 'right' }}>{Number(t.effectiveHours).toLocaleString('id-ID')} jam</Text>
                <Text style={{ width: '15%', textAlign: 'right' }}>{t.status.toUpperCase()}</Text>
              </View>
            ))}
          </View>
        )}

        {/* BAST Section (Complete) */}
        {data.handovers.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>RIWAYAT BERITA ACARA SERAH TERIMA ({data.handovers.length})</Text>
            <View style={styles.table}>
              <View style={styles.tableHead}>
                <Text style={{ width: '25%' }}>No. BAST</Text>
                <Text style={{ width: '20%' }}>Jenis</Text>
                <Text style={{ width: '20%' }}>Tanggal</Text>
                <Text style={{ width: '20%' }}>Kondisi Cek</Text>
                <Text style={{ width: '15%', textAlign: 'right' }}>Foto Lampiran</Text>
              </View>
              {data.handovers.map((h) => (
                <View style={styles.tableRow} key={h.id}>
                  <Text style={{ width: '25%', fontFamily: 'Helvetica-Bold' }}>{h.documentNumber}</Text>
                  <Text style={{ width: '20%' }}>{h.type === 'mobilization' ? 'Mobilisasi' : 'Demobilisasi'}</Text>
                  <Text style={{ width: '20%' }}>{dateLabel(h.date, tz)}</Text>
                  <Text style={{ width: '20%' }}>{h.checklistOkCount} / {h.checklistTotalCount} OK</Text>
                  <Text style={{ width: '15%', textAlign: 'right' }}>{h.photoCount} foto</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Footer */}
        <View style={styles.pageFooter} fixed>
          <Text>Laporan Operasional Resmi {settings.companyName} · Dokumen Lengkap</Text>
          <Text render={({ pageNumber, totalPages }) => `Hal. ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export type AllFleetsPdfProps = {
  settings: CompanySettings;
  fleetsData: DetailedFleetHistory[];
  printedAt: string;
};

export function AllFleetsHistoryDocument({ settings, fleetsData, printedAt }: AllFleetsPdfProps) {
  const tz = settings.timezone;

  return (
    <Document title="Rekap-Riwayat-Seluruh-Armada.pdf" author={settings.companyName}>
      {fleetsData.map((data, index) => {
        const isFinance = !!data.financials;
        return (
          <Page size="A4" style={styles.page} key={data.unit.id} break={index > 0} wrap>
            {/* Letterhead */}
            <View style={styles.header} fixed>
              <View>
                <Text style={styles.logo}>
                  HEAVY<Text style={styles.logoAccent}>OPS</Text>
                </Text>
                <Text style={styles.companyName}>{settings.companyName}</Text>
                <Text style={styles.companySub}>{settings.address} · {settings.phone}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#718096' }}>REKAPITULASI RIWAYAT ARMADA ({index + 1}/{fleetsData.length})</Text>
                <Text style={{ fontSize: 7, color: '#a0aec0' }}>Dicetak: {printedAt}</Text>
              </View>
            </View>

            {/* Fleet Header */}
            <View style={styles.fleetBanner}>
              <View style={styles.fleetHeaderRow}>
                <Text style={styles.unitCode}>{data.unit.unitCode} — {data.unit.brandModel}</Text>
                <Text style={styles.statusBadge}>Status: {data.unit.status.toUpperCase()}</Text>
              </View>
              <View style={styles.grid4}>
                <View style={styles.gridItem}>
                  <Text style={styles.gridLabel}>Kategori</Text>
                  <Text style={styles.gridVal}>{data.unit.category}</Text>
                </View>
                <View style={styles.gridItem}>
                  <Text style={styles.gridLabel}>Tahun</Text>
                  <Text style={styles.gridVal}>{data.unit.year || '-'}</Text>
                </View>
                <View style={styles.gridItem}>
                  <Text style={styles.gridLabel}>Lokasi</Text>
                  <Text style={styles.gridVal}>{data.unit.currentLocation || '-'}</Text>
                </View>
                <View style={styles.gridItem}>
                  <Text style={styles.gridLabel}>Tarif Sewa/Jam</Text>
                  <Text style={styles.gridVal}>{money(data.unit.hourlyRate)}</Text>
                </View>
              </View>
            </View>

            {/* Summary KPIs */}
            <View style={styles.kpiGrid}>
              <View style={styles.kpiBox}>
                <Text style={styles.kpiLabel}>Total Kontrak</Text>
                <Text style={styles.kpiVal}>{data.summary.contractCount} ({data.summary.completedCount} selesai)</Text>
              </View>
              <View style={styles.kpiBox}>
                <Text style={styles.kpiLabel}>Hari Kerja Approved</Text>
                <Text style={styles.kpiVal}>{data.summary.workDays} hari</Text>
              </View>
              <View style={styles.kpiBox}>
                <Text style={styles.kpiLabel}>Jam Efektif Approved</Text>
                <Text style={styles.kpiVal}>{data.summary.effectiveHours.toLocaleString('id-ID')} jam</Text>
              </View>
              <View style={styles.kpiBox}>
                <Text style={styles.kpiLabel}>Utilisasi</Text>
                <Text style={[styles.kpiVal, { color: '#c05621' }]}>{data.summary.utilizationRate}%</Text>
              </View>
              {isFinance && (
                <>
                  <View style={[styles.kpiBox, { width: '50%', marginTop: 3 }]}>
                    <Text style={styles.kpiLabel}>Total Nilai Tagihan (Invoices)</Text>
                    <Text style={[styles.kpiVal, { color: '#276749' }]}>{money(data.summary.totalInvoiced || 0)}</Text>
                  </View>
                  <View style={[styles.kpiBox, { width: '50%', marginTop: 3 }]}>
                    <Text style={styles.kpiLabel}>Total Jasa Operator pada Invoice</Text>
                    <Text style={[styles.kpiVal, { color: '#2b6cb0' }]}>{money(data.summary.operatorBilled || 0)}</Text>
                  </View>
                </>
              )}
            </View>

            {/* Contracts (Complete) */}
            <Text style={styles.sectionTitle}>RIWAYAT KONTRAK ({data.contracts.length})</Text>
            {data.contracts.length === 0 ? (
              <Text style={styles.emptyNote}>Tidak ada data kontrak tercatat.</Text>
            ) : (
              <View style={styles.table}>
                <View style={styles.tableHead}>
                  <Text style={{ width: '25%' }}>No. Kontrak</Text>
                  <Text style={{ width: '30%' }}>Klien</Text>
                  <Text style={{ width: '25%' }}>Periode</Text>
                  <Text style={{ width: '20%', textAlign: 'right' }}>Tipe</Text>
                </View>
                {data.contracts.map((c) => (
                  <View style={styles.tableRow} key={c.id}>
                    <Text style={{ width: '25%', fontFamily: 'Helvetica-Bold' }}>{c.contractNumber}</Text>
                    <Text style={{ width: '30%' }}>{c.clientName || '-'}</Text>
                    <Text style={{ width: '25%' }}>{dateLabel(c.startDate, tz)} - {dateLabel(c.endDate, tz)}</Text>
                    <Text style={{ width: '20%', textAlign: 'right' }}>{c.includeOperator ? 'Wet' : 'Dry'}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Operators (Complete) */}
            <Text style={styles.sectionTitle}>RIWAYAT OPERATOR ({data.operators.length})</Text>
            {data.operators.length === 0 ? (
              <Text style={styles.emptyNote}>Belum ada riwayat operator.</Text>
            ) : (
              <View style={styles.table}>
                <View style={styles.tableHead}>
                  <Text style={{ width: '40%' }}>Operator</Text>
                  <Text style={{ width: '30%' }}>SIO</Text>
                  <Text style={{ width: '30%', textAlign: 'right' }}>Jam Efektif</Text>
                </View>
                {data.operators.map((o, idx) => (
                  <View style={styles.tableRow} key={idx}>
                    <Text style={{ width: '40%', fontFamily: 'Helvetica-Bold' }}>{o.name}</Text>
                    <Text style={{ width: '30%' }}>{o.sioClass || '-'}</Text>
                    <Text style={{ width: '30%', textAlign: 'right' }}>{o.effectiveHours.toLocaleString('id-ID')} jam</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Timesheets (Complete) */}
            <Text style={styles.sectionTitle}>RIWAYAT TIMESHEET ({data.timesheets.length})</Text>
            {data.timesheets.length === 0 ? (
              <Text style={styles.emptyNote}>Belum ada riwayat timesheet.</Text>
            ) : (
              <View style={styles.table}>
                <View style={styles.tableHead}>
                  <Text style={{ width: '20%' }}>Tanggal</Text>
                  <Text style={{ width: '30%' }}>Operator</Text>
                  <Text style={{ width: '30%' }}>HM Awal - Akhir</Text>
                  <Text style={{ width: '20%', textAlign: 'right' }}>Jam Efektif</Text>
                </View>
                {data.timesheets.map((t) => (
                  <View style={styles.tableRow} key={t.id}>
                    <Text style={{ width: '20%' }}>{dateLabel(t.date, tz)}</Text>
                    <Text style={{ width: '30%' }}>{t.driver || '-'}</Text>
                    <Text style={{ width: '30%' }}>{Number(t.startHm).toLocaleString('id-ID')} - {Number(t.endHm).toLocaleString('id-ID')}</Text>
                    <Text style={{ width: '20%', textAlign: 'right' }}>{Number(t.effectiveHours).toLocaleString('id-ID')} jam</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Footer */}
            <View style={styles.pageFooter} fixed>
              <Text>Unit {data.unit.unitCode} ({data.unit.brandModel}) · {settings.companyName}</Text>
              <Text render={({ pageNumber, totalPages }) => `Hal. ${pageNumber} / ${totalPages}`} />
            </View>
          </Page>
        );
      })}
    </Document>
  );
}
