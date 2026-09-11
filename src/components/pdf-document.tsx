import { Document, Page, Text, View, Svg, Path, StyleSheet } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: {
    paddingTop: 20,
    paddingBottom: 66,
    paddingHorizontal: 36,
    fontFamily: 'Helvetica',
    fontSize: 7.2,
    color: '#323c47',
    lineHeight: 1.35,
  },
  letterhead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1.5,
    borderBottomColor: '#e37b36',
    paddingBottom: 6,
    marginBottom: 8,
  },
  logo: { fontSize: 18, fontFamily: 'Helvetica-Bold', letterSpacing: -0.5, color: '#26323c' },
  logoAccent: { color: '#df7a38' },
  company: { fontSize: 9, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  contact: { fontSize: 6.8, color: '#7c8792' },
  title: { fontSize: 13, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginBottom: 2, color: '#273642' },
  number: { fontSize: 8, textAlign: 'center', color: '#89929b', marginBottom: 8 },
  meta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  label: { fontSize: 6.2, color: '#929aa3', marginBottom: 2 },
  value: { fontSize: 8, fontFamily: 'Helvetica-Bold' },
  sub: { fontSize: 6.8, color: '#7c8792', marginTop: 2 },
  intro: { fontSize: 7.2, marginBottom: 4 },
  sectionTitle: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#273642', marginTop: 4, marginBottom: 2 },
  table: { marginTop: 2, borderWidth: 0.8, borderColor: '#e5e8eb' },
  tableHead: {
    flexDirection: 'row',
    backgroundColor: '#f5f6f7',
    paddingVertical: 2.5,
    paddingHorizontal: 4,
    borderBottomWidth: 0.8,
    borderBottomColor: '#e5e8eb',
    fontSize: 6.8,
    fontFamily: 'Helvetica-Bold',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 2,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: '#edf0f2',
    fontSize: 7,
  },
  colDescription: { width: '58%' },
  colValue: { width: '42%', textAlign: 'right' },
  colNo: { width: '10%' },
  colItem: { width: '55%' },
  colCond: { width: '35%', textAlign: 'right' },
  condOk: { color: '#348b67', fontFamily: 'Helvetica-Bold' },
  condBad: { color: '#c65e56', fontFamily: 'Helvetica-Bold' },
  totals: { alignSelf: 'flex-end', width: '50%', marginTop: 6 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  grandTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#e5e8eb',
    marginTop: 4,
    paddingTop: 5,
    fontFamily: 'Helvetica-Bold',
    fontSize: 9.5,
    color: '#d57a3d',
  },
  notes: { marginTop: 5, padding: 4.5, backgroundColor: '#faf8f4', fontSize: 6.8, color: '#827f77' },
  signatureRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    alignItems: 'flex-end',
  },
  signature: {
    width: '44%',
    textAlign: 'center',
    fontSize: 7.2,
  },
  signatureSpace: { height: 22 },
  signerName: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', marginTop: 2 },
  signerTitle: { fontSize: 6.2, color: '#7c8792', marginTop: 1 },
  signatureLine: {
    borderTopWidth: 0.8,
    borderTopColor: '#bdc3ca',
    paddingTop: 3,
    fontSize: 6.5,
    color: '#7c8792',
    marginTop: 3,
  },
  footer: {
    position: 'absolute',
    bottom: 12,
    left: 36,
    right: 36,
    height: 46,
    borderTopWidth: 0.8,
    borderTopColor: '#e7e9ec',
    paddingTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  qr: { width: 42, height: 42 },
  footerText: { fontSize: 6, color: '#9ba2aa', width: '70%' },
  verifyUrl: { fontSize: 5.4, color: '#5b6470', marginTop: 1 },
  pageNumber: { fontSize: 6.5, color: '#9ba2aa', textAlign: 'right' },
});

export type PdfCheck = { item: string; ok: boolean };
export type PdfData = {
  title: string;
  number: string;
  company: { companyName: string; address: string; email: string; phone: string; signerName?: string; signerTitle?: string };
  clientName: string;
  clientAddress: string;
  clientPic?: string;
  date: string;
  reference: string;
  rows: { label: string; value: string }[];
  checklist?: PdfCheck[];
  subtotal?: string;
  tax?: string;
  total?: string;
  notes: string;
  qrPath: string;
  qrSize: number;
  verifyUrl?: string;
  handover?: boolean;
  dueDate?: string;
};

export function BusinessDocument({ data }: { data: PdfData }) {
  const infoTitle = data.handover ? 'A. INFORMASI UNIT & SERAH TERIMA' : undefined;
  return (
    <Document title={data.title} author={data.company.companyName} subject={data.number} language="id">
      <Page size="A4" style={styles.page}>
        <View style={styles.letterhead}>
          <View>
            <Text style={styles.logo}>
              HEAVY<Text style={styles.logoAccent}>OPS.</Text>
            </Text>
            <Text style={styles.contact}>SISTEM MANAJEMEN RENTAL ALAT BERAT</Text>
          </View>
          <View style={{ maxWidth: 240, textAlign: 'right' }}>
            <Text style={styles.company}>{data.company.companyName}</Text>
            <Text style={styles.contact}>{data.company.address}</Text>
            <Text style={styles.contact}>
              {data.company.email} | {data.company.phone}
            </Text>
          </View>
        </View>
        <Text style={styles.title}>{data.title}</Text>
        <Text style={styles.number}>Nomor: {data.number}</Text>
        <View style={styles.meta}>
          <View style={{ width: '58%' }}>
            <Text style={styles.label}>KEPADA YTH.</Text>
            <Text style={styles.value}>{data.clientName}</Text>
            <Text style={styles.sub}>{data.clientAddress}</Text>
          </View>
          <View>
            <Text style={styles.label}>TANGGAL DOKUMEN</Text>
            <Text style={styles.value}>{data.date}</Text>
            <Text style={styles.sub}>Kontrak: {data.reference}</Text>
            {data.dueDate && <Text style={styles.sub}>Jatuh tempo: {data.dueDate}</Text>}
          </View>
        </View>
        <Text style={styles.intro}>
          {data.handover
            ? 'Dengan ini para pihak menyatakan telah melaksanakan pemeriksaan dan serah terima unit alat berat dengan rincian sebagai berikut:'
            : data.total
              ? 'Bersama ini kami sampaikan tagihan sewa alat berat sesuai dengan kontrak dan rincian pekerjaan berikut:'
              : 'Dengan hormat, kami menyampaikan penawaran harga sewa alat berat dengan rincian dan ketentuan sebagai berikut:'}
        </Text>
        {infoTitle && <Text style={styles.sectionTitle}>{infoTitle}</Text>}
        <View style={styles.table}>
          <View style={styles.tableHead}>
            <Text style={styles.colDescription}>URAIAN</Text>
            <Text style={styles.colValue}>KETERANGAN / NILAI</Text>
          </View>
          {data.rows.map((row, i) => (
            <View key={i} style={styles.tableRow} wrap={false}>
              <Text style={styles.colDescription}>{row.label}</Text>
              <Text style={styles.colValue}>{row.value}</Text>
            </View>
          ))}
        </View>
        {data.checklist && data.checklist.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>B. DAFTAR PEMERIKSAAN UNIT ({data.checklist.length} TITIK)</Text>
            <View style={styles.table}>
              <View style={styles.tableHead}>
                <Text style={styles.colNo}>NO</Text>
                <Text style={styles.colItem}>KOMPONEN</Text>
                <Text style={styles.colCond}>KONDISI</Text>
              </View>
              {data.checklist.map((c, i) => (
                <View key={i} style={styles.tableRow} wrap={false}>
                  <Text style={styles.colNo}>{i + 1}</Text>
                  <Text style={styles.colItem}>{c.item}</Text>
                  <Text style={[styles.colCond, c.ok ? styles.condOk : styles.condBad]}>{c.ok ? 'Baik' : 'Perlu perhatian'}</Text>
                </View>
              ))}
            </View>
          </>
        )}
        {data.total && (
          <View style={styles.totals}>
            <View style={styles.totalRow}>
              <Text>Subtotal</Text>
              <Text>{data.subtotal}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text>PPN 11%</Text>
              <Text>{data.tax}</Text>
            </View>
            <View style={styles.grandTotal}>
              <Text>Total Tagihan</Text>
              <Text>{data.total}</Text>
            </View>
          </View>
        )}
        <View style={styles.notes}>
          <Text style={{ fontFamily: 'Helvetica-Bold', marginBottom: 2 }}>CATATAN DAN KETENTUAN</Text>
          <Text>{data.notes}</Text>
        </View>
        <View style={styles.signatureRow} wrap={false}>
          <View style={styles.signature}>
            <Text>{data.handover ? 'Pihak yang menyerahkan,' : 'Hormat kami,'}</Text>
            <Text>{data.company.companyName}</Text>
            <View style={styles.signatureSpace} />
            {data.company.signerName ? <Text style={styles.signerName}>{data.company.signerName}</Text> : null}
            {data.company.signerTitle ? <Text style={styles.signerTitle}>{data.company.signerTitle}</Text> : null}
            <Text style={styles.signatureLine}>Nama dan tanda tangan</Text>
          </View>
          <View style={styles.signature}>
            <Text>{data.handover ? 'Pihak yang menerima,' : 'Diterima dan disetujui oleh,'}</Text>
            <Text>{data.clientName}</Text>
            <View style={styles.signatureSpace} />
            {data.clientPic ? <Text style={styles.signerName}>{data.clientPic}</Text> : null}
            <Text style={styles.signatureLine}>Nama dan tanda tangan</Text>
          </View>
        </View>
        <View style={styles.footer} fixed>
          {data.qrPath ? (
            <Svg style={styles.qr} viewBox={`0 0 ${data.qrSize} ${data.qrSize}`}>
              <Path d={data.qrPath} fill="#111111" />
            </Svg>
          ) : null}
          <View style={styles.footerText}>
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>VERIFIKASI DOKUMEN</Text>
            <Text>Pindai kode QR untuk memeriksa keabsahan nomor dokumen pada sistem HeavyOps. Dokumen ini diterbitkan secara elektronik; tanda tangan dilengkapi oleh para pihak.</Text>
            {data.verifyUrl && <Text style={styles.verifyUrl}>{data.verifyUrl}</Text>}
          </View>
          <Text style={styles.pageNumber} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
