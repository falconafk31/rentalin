import { Document, Page, Text, View, Svg, Path, Image, StyleSheet } from '@react-pdf/renderer';

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
  },
  signature: {
    width: '44%',
    textAlign: 'center',
    fontSize: 7.2,
  },
  signatureHeader: { fontSize: 7.2, color: '#323c47' },
  signatureCompany: { fontSize: 7.2, fontFamily: 'Helvetica-Bold', marginTop: 1 },
  signatureSpace: { height: 32 },
  signatureLine: {
    borderTopWidth: 0.8,
    borderTopColor: '#9ba2aa',
    paddingTop: 3,
    fontSize: 7.2,
    fontFamily: 'Helvetica-Bold',
    color: '#273642',
    textAlign: 'center',
  },
  signerTitle: {
    fontSize: 6.2,
    color: '#7c8792',
    marginTop: 1,
    textAlign: 'center',
  },
  // --- Blok para pihak (pola BAST resmi) -------------------------------------
  partiesIntro: { fontSize: 7.2, marginTop: 2, marginBottom: 3 },
  partyBlock: { marginBottom: 3 },
  partyHeading: { fontSize: 7.2, fontFamily: 'Helvetica-Bold', color: '#273642' },
  partyRole: { fontSize: 6.2, color: '#7c8792' },
  partyRow: { flexDirection: 'row', marginTop: 0.5 },
  partyKey: { width: 88, fontSize: 6.8, color: '#7c8792' },
  partyVal: { fontSize: 6.8 },
  clause: { marginTop: 4, fontSize: 7, textAlign: 'justify' },
  // --- Surat Perjanjian Sewa ------------------------------------------------
  pasalNumber: { textAlign: 'center', fontFamily: 'Helvetica-Bold', fontSize: 7.8, marginTop: 6 },
  pasalTitle: { textAlign: 'center', fontFamily: 'Helvetica-Bold', fontSize: 7.8, marginBottom: 3 },
  pasalBody: { fontSize: 7, textAlign: 'justify', marginBottom: 2 },
  pasalItem: { fontSize: 7, textAlign: 'justify', marginBottom: 1.5 },
  pasalSub: { fontSize: 7, textAlign: 'justify', marginBottom: 1.5, marginLeft: 12 },
  specRow: { flexDirection: 'row', marginBottom: 1 },
  specKey: { width: 110, fontSize: 7 },
  specVal: { fontSize: 7 },
  placeDate: { textAlign: 'right', fontSize: 7.2, marginTop: 5, marginBottom: 1 },
  signature3: { width: '31.5%', textAlign: 'center', fontSize: 6.8 },
  signature3Space: { height: 26 },
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
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  photo: { width: 118, height: 88, marginRight: 6, marginBottom: 6, borderWidth: 0.5, borderColor: '#e5e8eb' },
});

export type PdfCheck = { item: string; ok: boolean };
// Para pihak pada dokumen resmi (BAST) — mengikuti pola berita acara serah
// terima alat berat: identitas PIHAK PERTAMA/PIHAK KEDUA (nama, alamat,
// wakil + jabatan) dan peran masing-masing pada tanda tangan.
export type PdfParty = { name: string; address: string; representative?: string; title?: string; ktp?: string; npwp?: string };
export type PdfParties = {
  openingDate: string; // "Jumat, 11 September 2026" — pembuka formal
  city: string; // kota penandatanganan — baris "Kota, tanggal" di atas ttd
  first: PdfParty; // PIHAK PERTAMA — penyedia jasa / pemilik unit
  second: PdfParty; // PIHAK KEDUA — penyewa / penerima unit
  type: 'mobilization' | 'demobilization';
  contractNumber: string;
};
// Surat Perjanjian Sewa Menyewa Alat Berat — mengikuti struktur template
// perjanjian sewa alat berat (rujukan artikel Mekari Sign): pembuka formal,
// identitas para pihak, PASAL 1–6, penutup rangkap 2 bermeterai cukup,
// tempat/tanggal, dan tanda tangan PIHAK PERTAMA & PIHAK KEDUA.
export type PdfAgreement = {
  openingDate: string; // "Jumat, 11 September 2026"
  city: string; // kota penandatanganan + domisili pengadilan (PASAL 6)
  number: string; // nomor perjanjian (KTR → PJS)
  contractNumber: string;
  first: PdfParty;
  second: PdfParty;
  unit: { brand: string; category: string; year: string; code: string; bastNumber?: string };
  period: { start: string; end: string; days: number; daysWords: string };
  rate: { hourly: string; hourlyWords: string; ppn: string };
  bank?: { name: string; accountName: string; accountNumber: string };
  operatorInfo?: PdfOperatorInfo; // rekening tujuan PASAL 3 — bila lengkap di Pengaturan
};
export type PdfOperatorInfo = { includeOperator: boolean; rate: string | null; rateType: string | null; names: string[] };

export type PdfData = {
  title: string;
  number: string;
  company: { companyName: string; address: string; email: string; phone: string; signerName?: string; signerTitle?: string; city?: string };
  clientName: string;
  clientAddress: string;
  clientPic?: string;
  date: string;
  reference: string;
  rows: { label: string; value: string }[];
  checklist?: PdfCheck[];
  subtotal?: string;
  tax?: string;
  taxLabel?: string;
  total?: string;
  paidTotal?: string;
  remaining?: string;
  payments?: { label: string; value: string }[];
  photos?: string[];
  notes: string;
  qrPath: string;
  qrSize: number;
  verifyUrl?: string;
  handover?: boolean;
  dueDate?: string;
  parties?: PdfParties;
  agreement?: PdfAgreement;
  operatorInfo?: PdfOperatorInfo;
  // Template dinamis (Pengaturan > Template PDF): teks kustom per dokumen,
  // variabel {{nama_klien}} dkk sudah diisi di route. Kosong → fallback
  // hardcoded di bawah tidak berubah. BAST boleh 2+ halaman bila panjang.
  introText?: string;
  partiesIntro?: string;
  clauseText?: string;
  footerText?: string;
  pasalText?: Record<string, string>;
};

// Tabel Jasa Operator (PR-5): selalu dirender utk dokumen kontrak - dry hire
// menampilkan 1 baris keterangan (tabel tetap ada, sesuai permintaan).
function OperatorTable({ info }: { info?: PdfOperatorInfo }) {
  if (!info) return null;
  const rateLabel = info.includeOperator && info.rate ? `${info.rate}${info.rateType === 'daily' ? '/hari' : '/jam'}` : null;
  return (
    <>
      <Text style={styles.sectionTitle}>JASA OPERATOR</Text>
      <View style={styles.table}>
        <View style={styles.tableHead}>
          <Text style={styles.colDescription}>URAIAN</Text>
          <Text style={styles.colValue}>KETERANGAN / NILAI</Text>
        </View>
        {info.includeOperator ? (
          <>
            {info.names.map((n, i) => (
              <View key={i} style={styles.tableRow} wrap={false}>
                <Text style={styles.colDescription}>Nama operator {info.names.length > 1 ? i + 1 : ''}</Text>
                <Text style={styles.colValue}>{n}</Text>
              </View>
            ))}
            {info.names.length === 0 && (
              <View style={styles.tableRow} wrap={false}>
                <Text style={styles.colDescription}>Nama operator</Text>
                <Text style={styles.colValue}>Sesuai kontrak</Text>
              </View>
            )}
            <View style={styles.tableRow} wrap={false}>
              <Text style={styles.colDescription}>Tarif operator</Text>
              <Text style={styles.colValue}>{rateLabel || 'Sesuai kontrak'}</Text>
            </View>
          </>
        ) : (
          <View style={styles.tableRow} wrap={false}>
            <Text style={styles.colDescription}>Status jasa operator</Text>
            <Text style={styles.colValue}>TIDAK TERMASUK JASA OPERATOR (DRY HIRE) - pengoperasian unit menjadi tanggung jawab penyewa</Text>
          </View>
        )}
      </View>
    </>
  );
}
export function BusinessDocument({ data }: { data: PdfData }) {
  const infoTitle = data.handover ? 'A. INFORMASI UNIT & SERAH TERIMA' : undefined;
  const parties = data.parties;
  const ag = data.agreement;
  const jenisLabel = parties ? (parties.type === 'mobilization' ? 'Mobilisasi (Penyerahan Unit)' : 'Demobilisasi (Pengembalian Unit)') : undefined;
  const dotted = '( .............................................. )';
  // Peran tanda tangan mengikuti jenis serah terima: mobilisasi = P1 menyerahkan,
  // demobilisasi = P2 mengembalikan (P1 menerima kembali).
  const firstRole = parties?.type === 'demobilization' ? 'Yang menerima kembali,' : 'Yang menyerahkan,';
  const secondRole = parties?.type === 'demobilization' ? 'Yang mengembalikan,' : 'Yang menerima,';
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
        {ag ? (
          // Perjanjian: nomor dokumen sudah di kop; meta menampilkan kontrak
          // rujukan + tanggal dokumen.
          <View style={styles.meta}>
            <View style={{ width: '58%' }}>
              <Text style={styles.label}>NOMOR KONTRAK</Text>
              <Text style={styles.value}>{ag.contractNumber}</Text>
              <Text style={styles.sub}>Objek: 1 (satu) unit {ag.unit.brand}</Text>
            </View>
            <View>
              <Text style={styles.label}>TANGGAL DOKUMEN</Text>
              <Text style={styles.value}>{data.date}</Text>
            </View>
          </View>
        ) : parties ? (
          // BAST resmi: kop tanggal + kontrak saja — identitas para pihak
          // tampil utuh di blok PIHAK PERTAMA/PIHAK KEDUA di bawah.
          <View style={styles.meta}>
            <View style={{ width: '58%' }}>
              <Text style={styles.label}>JENIS SERAH TERIMA</Text>
              <Text style={styles.value}>{jenisLabel}</Text>
              <Text style={styles.sub}>Kontrak: {parties.contractNumber}</Text>
            </View>
            <View>
              <Text style={styles.label}>TANGGAL DOKUMEN</Text>
              <Text style={styles.value}>{parties.openingDate}</Text>
            </View>
          </View>
        ) : (
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
        )}
        {ag ? (
          <>
            <Text style={styles.partiesIntro}>
              Pada hari ini, <Text style={{ fontFamily: 'Helvetica-Bold' }}>{ag.openingDate}</Text>, kami yang bertanda tangan di bawah ini:
            </Text>
            <View style={styles.partyBlock} wrap={false}>
              <Text style={styles.partyHeading}>1. PIHAK PERTAMA <Text style={styles.partyRole}>(Yang menyewakan — pemilik unit)</Text></Text>
              <View style={styles.partyRow}><Text style={styles.partyKey}>Nama Perusahaan</Text><Text style={styles.partyVal}>: {ag.first.name}</Text></View>
              <View style={styles.partyRow}><Text style={styles.partyKey}>Alamat</Text><Text style={styles.partyVal}>: {ag.first.address}</Text></View>
              <View style={styles.partyRow}><Text style={styles.partyKey}>NPWP</Text><Text style={styles.partyVal}>: {ag.first.npwp || dotted}</Text></View>
              <View style={styles.partyRow}><Text style={styles.partyKey}>Yang diwakili oleh</Text><Text style={styles.partyVal}>: {ag.first.representative || dotted}</Text></View>
              <View style={styles.partyRow}><Text style={styles.partyKey}>Jabatan</Text><Text style={styles.partyVal}>: {ag.first.title || dotted}</Text></View>
              <View style={styles.partyRow}><Text style={styles.partyKey}>No. KTP</Text><Text style={styles.partyVal}>: {ag.first.ktp || dotted}</Text></View>
            </View>
            <View style={styles.partyBlock} wrap={false}>
              <Text style={styles.partyHeading}>2. PIHAK KEDUA <Text style={styles.partyRole}>(Penyewa)</Text></Text>
              <View style={styles.partyRow}><Text style={styles.partyKey}>Nama Perusahaan</Text><Text style={styles.partyVal}>: {ag.second.name}</Text></View>
              <View style={styles.partyRow}><Text style={styles.partyKey}>Alamat</Text><Text style={styles.partyVal}>: {ag.second.address}</Text></View>
              <View style={styles.partyRow}><Text style={styles.partyKey}>NPWP</Text><Text style={styles.partyVal}>: {ag.second.npwp || dotted}</Text></View>
              <View style={styles.partyRow}><Text style={styles.partyKey}>Yang diwakili oleh</Text><Text style={styles.partyVal}>: {ag.second.representative || dotted}</Text></View>
              <View style={styles.partyRow}><Text style={styles.partyKey}>Jabatan</Text><Text style={styles.partyVal}>: {ag.second.title || dotted}</Text></View>
              <View style={styles.partyRow}><Text style={styles.partyKey}>No. KTP</Text><Text style={styles.partyVal}>: {ag.second.ktp || dotted}</Text></View>
            </View>
            <Text style={styles.partiesIntro}>
              PIHAK PERTAMA dan PIHAK KEDUA selanjutnya disebut PARA PIHAK, sepakat untuk mengadakan Perjanjian Sewa Menyewa Alat Berat (&quot;Perjanjian&quot;) dengan syarat dan ketentuan sebagai berikut:
            </Text>
            <Text style={styles.pasalNumber}>PASAL 1</Text>
            <Text style={styles.pasalTitle}>OBJEK SEWA</Text>
            {data.pasalText?.pasal_1 ? (
              <Text style={styles.pasalBody}>{data.pasalText.pasal_1}</Text>
            ) : (
            <>
            <Text style={styles.pasalBody}>PIHAK PERTAMA setuju untuk menyewakan kepada PIHAK KEDUA, dan PIHAK KEDUA setuju untuk menyewa dari PIHAK PERTAMA, 1 (satu) unit alat berat dengan spesifikasi:</Text>
            <View style={styles.specRow}><Text style={styles.specKey}>- Merk / Tipe</Text><Text style={styles.specVal}>: {ag.unit.brand}</Text></View>
            <View style={styles.specRow}><Text style={styles.specKey}>- Kategori</Text><Text style={styles.specVal}>: {ag.unit.category}</Text></View>
            <View style={styles.specRow}><Text style={styles.specKey}>- Tahun Pembuatan</Text><Text style={styles.specVal}>: {ag.unit.year}</Text></View>
            <View style={styles.specRow}><Text style={styles.specKey}>- Kode Unit (No. Identifikasi)</Text><Text style={styles.specVal}>: {ag.unit.code}</Text></View>
            <View style={styles.specRow}><Text style={styles.specKey}>- Kondisi Alat</Text><Text style={styles.specVal}>: Baik dan siap dioperasikan{ag.unit.bastNumber ? `, sebagaimana didokumentasikan dalam BAST No. ${ag.unit.bastNumber}` : ''}.</Text></View>
            </>
            )}
            {ag.operatorInfo && <OperatorTable info={ag.operatorInfo} />}
            <Text style={styles.pasalNumber}>PASAL 2</Text>
            <Text style={styles.pasalTitle}>JANGKA WAKTU SEWA</Text>
            <Text style={styles.pasalBody}>{data.pasalText?.pasal_2 || `Jangka waktu sewa adalah selama ${ag.period.days} (${ag.period.daysWords}) hari, terhitung sejak tanggal ${ag.period.start} sampai dengan tanggal ${ag.period.end}, kecuali diperpanjang atas kesepakatan tertulis PARA PIHAK melalui amandemen kontrak.`}</Text>
            <Text style={styles.pasalNumber}>PASAL 3</Text>
            <Text style={styles.pasalTitle}>HARGA SEWA DAN PEMBAYARAN</Text>
            {data.pasalText?.pasal_3 ? (
              <Text style={styles.pasalItem}>{data.pasalText.pasal_3}</Text>
            ) : (
            <>
            <Text style={styles.pasalItem}>1. Tarif sewa alat berat sebagaimana disebut dalam Pasal 1 adalah sebesar {ag.rate.hourly}/jam ({ag.rate.hourlyWords} per jam), belum termasuk PPN {ag.rate.ppn}% yang dibebankan pada saat penagihan.</Text>
            <Text style={styles.pasalItem}>2. {(ag.operatorInfo?.includeOperator) ? `Jasa operator disediakan PIHAK PERTAMA sebagaimana daftar pada Tabel Jasa Operator, dengan tarif ${ag.operatorInfo?.rate ?? ''}, ditagihkan berdasarkan ${ag.operatorInfo?.rateType === 'daily' ? `hari kerja` : `jam kerja efektif`} operator yang tercatat pada timesheet harian yang disetujui PIHAK PERTAMA.` : `Jasa operator TIDAK termasuk dalam Perjanjian ini (dry hire); pengoperasian unit menjadi tanggung jawab PIHAK KEDUA.`}</Text>
            <Text style={styles.pasalItem}>3. Penagihan dilakukan berdasarkan jam kerja efektif yang tercatat pada timesheet harian dan telah disetujui PIHAK PERTAMA, dengan durasi kerusakan/penundaan yang bukan tanggung jawab PIHAK KEDUA tidak ditagihkan.</Text>
            <Text style={styles.pasalItem}>4. Pembayaran dilakukan oleh PIHAK KEDUA kepada PIHAK PERTAMA melalui transfer ke {ag.bank ? `rekening ${ag.bank.name} a.n. ${ag.bank.accountName} nomor ${ag.bank.accountNumber}` : 'rekening yang ditunjuk secara tertulis oleh PIHAK PERTAMA'}, paling lambat pada tanggal jatuh tempo tercantum pada setiap faktur tagihan.</Text>
            </>
            )}
            <Text style={styles.pasalNumber}>PASAL 4</Text>
            <Text style={styles.pasalTitle}>HAK DAN KEWAJIBAN PARA PIHAK</Text>
            {data.pasalText?.pasal_4 ? (
              <Text style={styles.pasalItem}>{data.pasalText.pasal_4}</Text>
            ) : (
            <>
            <Text style={styles.pasalItem}>1. PIHAK PERTAMA berkewajiban: (a) menyerahkan unit dalam kondisi baik dan layak operasi; (b) melakukan perawatan berkala unit; (c) menyediakan unit pengganti sejenis dalam waktu yang wajar apabila unit mengalami kerusakan di luar penggunaan yang keliru; serta (d) memenuhi standar keselamatan dan kesehatan kerja sesuai ketentuan perundang-undangan.</Text>
            <Text style={styles.pasalItem}>2. PIHAK KEDUA berkewajiban: (a) menggunakan unit sesuai peruntukan dan kapasitasnya; (b) menanggung bahan bakar serta biaya operasional harian sepanjang tidak disepakati termasuk dalam tarif; (c) membayar biaya sewa tepat waktu; (d) segera melaporkan setiap kerusakan unit; serta (e) mengembalikan unit pada akhir masa sewa dalam kondisi baik (keausan normal dicatat dalam Berita Acara Serah Terima/Demobilisasi).</Text>
            </>
            )}
            <Text style={styles.pasalNumber}>PASAL 5</Text>
            <Text style={styles.pasalTitle}>KERUSAKAN DAN KEHILANGAN</Text>
            <Text style={styles.pasalBody}>{data.pasalText?.pasal_5 || 'Kerusakan unit yang disebabkan oleh kelalaian PIHAK KEDUA menjadi tanggung jawab PIHAK KEDUA. Kerusakan akibat keausan normal menjadi tanggung jawab PIHAK PERTAMA. Jam operasi yang tidak berjalan karena kerusakan unit tidak ditagihkan kepada PIHAK KEDUA. Kehilangan unit selama masa sewa menjadi tanggung jawab PIHAK KEDUA.'}</Text>
            <Text style={styles.pasalNumber}>PASAL 6</Text>
            <Text style={styles.pasalTitle}>PENYELESAIAN PERSELISIHAN</Text>
            <Text style={styles.pasalBody}>{data.pasalText?.pasal_6 || `Apabila terjadi perselisihan atas pelaksanaan Perjanjian ini, PARA PIHAK akan menyelesaikannya terlebih dahulu secara musyawarah untuk mufakat. Apabila musyawarah tidak mencapai kesepakatan, PARA PIHAK sepakat menyelesaikannya melalui Pengadilan Negeri ${ag.city}.`}</Text>
          </>
        ) : parties ? (
          <>
            <Text style={styles.partiesIntro}>
              Pada hari ini, <Text style={{ fontFamily: 'Helvetica-Bold' }}>{parties.openingDate}</Text>, yang bertanda tangan di bawah ini:
            </Text>
            <View style={styles.partyBlock} wrap={false}>
              <Text style={styles.partyHeading}>1. PIHAK PERTAMA <Text style={styles.partyRole}>(Yang menyewakan — pemilik unit)</Text></Text>
              <View style={styles.partyRow}><Text style={styles.partyKey}>Nama Perusahaan</Text><Text style={styles.partyVal}>: {parties.first.name}</Text></View>
              <View style={styles.partyRow}><Text style={styles.partyKey}>Alamat</Text><Text style={styles.partyVal}>: {parties.first.address}</Text></View>
              <View style={styles.partyRow}><Text style={styles.partyKey}>Yang diwakili oleh</Text><Text style={styles.partyVal}>: {parties.first.representative || dotted}</Text></View>
              <View style={styles.partyRow}><Text style={styles.partyKey}>Jabatan</Text><Text style={styles.partyVal}>: {parties.first.title || dotted}</Text></View>
            </View>
            <View style={styles.partyBlock} wrap={false}>
              <Text style={styles.partyHeading}>2. PIHAK KEDUA <Text style={styles.partyRole}>(Penyewa / pengguna unit)</Text></Text>
              <View style={styles.partyRow}><Text style={styles.partyKey}>Nama Perusahaan</Text><Text style={styles.partyVal}>: {parties.second.name}</Text></View>
              <View style={styles.partyRow}><Text style={styles.partyKey}>Alamat</Text><Text style={styles.partyVal}>: {parties.second.address}</Text></View>
              <View style={styles.partyRow}><Text style={styles.partyKey}>Yang diwakili oleh</Text><Text style={styles.partyVal}>: {parties.second.representative || dotted}</Text></View>
              <View style={styles.partyRow}><Text style={styles.partyKey}>Jabatan</Text><Text style={styles.partyVal}>: {parties.second.title || dotted}</Text></View>
            </View>
            <Text style={styles.partiesIntro}>
              {data.partiesIntro || (parties.type === 'mobilization'
                ? `PIHAK PERTAMA dengan ini menyerahkan kepada PIHAK KEDUA unit alat berat dengan rincian dan kelengkapan sebagaimana tercantum di bawah ini, untuk digunakan dalam pelaksanaan Kontrak Sewa ${parties.contractNumber}:`
                : `PIHAK KEDUA dengan ini mengembalikan kepada PIHAK PERTAMA unit alat berat sewaan dengan rincian sebagaimana tercantum di bawah ini, sehubungan dengan berakhirnya masa sewa pada Kontrak ${parties.contractNumber}:`)}
            </Text>
          </>
        ) : (
          <Text style={styles.intro}>
            {data.introText || (data.handover
              ? 'Dengan ini para pihak menyatakan telah melaksanakan pemeriksaan dan serah terima unit alat berat dengan rincian sebagai berikut:'
              : data.total
                ? 'Bersama ini kami sampaikan tagihan sewa alat berat sesuai dengan kontrak dan rincian pekerjaan berikut:'
                : 'Dengan hormat, kami menyampaikan penawaran harga sewa alat berat dengan rincian dan ketentuan sebagai berikut:')}
          </Text>
        )}
        {!ag && (
          <>
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
          </>
        )}
        {!ag && <OperatorTable info={data.operatorInfo} />}
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
            {parties && (
              <Text style={styles.clause}>
                PIHAK KEDUA menyatakan telah melakukan pemeriksaan bersama PIHAK PERTAMA atas unit di atas dan menerimanya dalam kondisi sebagaimana hasil pemeriksaan tersebut, lengkap dengan kelengkapan standarnya, serta layak untuk dioperasikan.
              </Text>
            )}
          </>
        )}
        {data.total && (
          <View style={styles.totals}>
            <View style={styles.totalRow}>
              <Text>Subtotal</Text>
              <Text>{data.subtotal}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text>{data.taxLabel || 'PPN 11%'}</Text>
              <Text>{data.tax}</Text>
            </View>
            <View style={styles.grandTotal}>
              <Text>Total Tagihan</Text>
              <Text>{data.total}</Text>
            </View>
            {data.paidTotal && (
              <View style={styles.totalRow}>
                <Text>Sudah dibayar</Text>
                <Text>{data.paidTotal}</Text>
              </View>
            )}
            {data.remaining && (
              <View style={styles.totalRow}>
                <Text>Sisa tagihan</Text>
                <Text>{data.remaining}</Text>
              </View>
            )}
          </View>
        )}
        {data.payments && data.payments.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>RIWAYAT PEMBAYARAN</Text>
            <View style={styles.table}>
              {data.payments.map((p, i) => (
                <View key={i} style={styles.tableRow} wrap={false}>
                  <Text style={styles.colDescription}>{p.label}</Text>
                  <Text style={styles.colValue}>{p.value}</Text>
                </View>
              ))}
            </View>
          </>
        )}
        {data.photos && data.photos.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>C. DOKUMENTASI FOTO</Text>
            <View style={styles.photoGrid}>
              {data.photos.map((src, i) => (
                // eslint-disable-next-line jsx-a11y/alt-text -- Image react-pdf tidak mendukung prop alt
                <Image key={i} style={styles.photo} src={src} />
              ))}
            </View>
          </>
        )}
        {!ag && (
          <View style={styles.notes}>
            <Text style={{ fontFamily: 'Helvetica-Bold', marginBottom: 2 }}>CATATAN DAN KETENTUAN</Text>
            <Text>{data.notes}</Text>
          </View>
        )}
        {ag && (
          <Text style={styles.clause}>
            {data.clauseText || 'Demikian Surat Perjanjian Sewa Menyewa Alat Berat ini dibuat dalam rangkap 2 (dua) rangkap, masing-masing bermeterai cukup dan mempunyai kekuatan hukum yang sama, ditandatangani oleh PARA PIHAK dan dipergunakan sebagaimana mestinya.'}
          </Text>
        )}
        {parties && (
          <Text style={styles.clause}>
            {data.clauseText || 'Demikian berita acara serah terima ini dibuat dalam rangkap 2 (dua) rangkap, masing-masing bermeterai cukup dan mempunyai kekuatan hukum yang sama serta tidak dapat diganggu gugat, ditandatangani dan dipergunakan sebagaimana mestinya oleh para pihak.'}
          </Text>
        )}
        {/* Tempat & tanggal penandatanganan (item 13 format perjanjian resmi):
            baris "Kota, tanggal" tepat di atas blok tanda tangan. */}
        <Text style={styles.placeDate}>{ag ? `${ag.city}, ${data.date}` : parties ? `${parties.city}, ${parties.openingDate}` : `${data.company.city}, ${data.date}`}</Text>
        {ag ? (
          // Perjanjian (format artikel): PIHAK PERTAMA & PIHAK KEDUA — meterai
          // cukup ditempel pada arsip masing-masing rangkap.
          <View style={styles.signatureRow} wrap={false}>
            <View style={styles.signature}>
              <Text style={styles.signatureHeader}>PIHAK PERTAMA,</Text>
              <Text style={styles.signatureCompany}>{ag.first.name}</Text>
              <View style={styles.signatureSpace} />
              <Text style={styles.signatureLine}>{ag.first.representative || dotted}</Text>
              <Text style={styles.signerTitle}>{ag.first.title || 'Nama dan tanda tangan'}</Text>
            </View>
            <View style={styles.signature}>
              <Text style={styles.signatureHeader}>PIHAK KEDUA,</Text>
              <Text style={styles.signatureCompany}>{ag.second.name}</Text>
              <View style={styles.signatureSpace} />
              <Text style={styles.signatureLine}>{ag.second.representative || dotted}</Text>
              <Text style={styles.signerTitle}>{ag.second.title || 'Nama dan tanda tangan'}</Text>
            </View>
          </View>
        ) : parties ? (
          // BAST resmi: PIHAK PERTAMA · PIHAK KEDUA · Mengetahui (pihak ketiga/
          // atasan langsung — dikosongkan untuk diisi bila diperlukan).
          <View style={styles.signatureRow} wrap={false}>
            <View style={styles.signature3}>
              <Text style={styles.signatureHeader}>{firstRole}</Text>
              <Text style={styles.signatureCompany}>{parties.first.name}</Text>
              <View style={styles.signature3Space} />
              <Text style={styles.signatureLine}>{parties.first.representative || dotted}</Text>
              <Text style={styles.signerTitle}>{parties.first.title || 'PIHAK PERTAMA'}</Text>
            </View>
            <View style={styles.signature3}>
              <Text style={styles.signatureHeader}>{secondRole}</Text>
              <Text style={styles.signatureCompany}>{parties.second.name}</Text>
              <View style={styles.signature3Space} />
              <Text style={styles.signatureLine}>{parties.second.representative || dotted}</Text>
              <Text style={styles.signerTitle}>{parties.second.title || 'PIHAK KEDUA'}</Text>
            </View>
            <View style={styles.signature3}>
              <Text style={styles.signatureHeader}>Mengetahui,</Text>
              <View style={styles.signature3Space} />
              <Text style={styles.signatureLine}>{dotted}</Text>
              <Text style={styles.signerTitle}>Nama dan tanda tangan</Text>
            </View>
          </View>
        ) : (
          <View style={styles.signatureRow} wrap={false}>
            <View style={styles.signature}>
              <Text style={styles.signatureHeader}>{data.handover ? 'Pihak yang menyerahkan,' : 'Hormat kami,'}</Text>
              <Text style={styles.signatureCompany}>{data.company.companyName}</Text>
              <View style={styles.signatureSpace} />
              <Text style={styles.signatureLine}>{data.company.signerName || '( .............................................. )'}</Text>
              <Text style={styles.signerTitle}>{data.company.signerTitle || 'Nama dan tanda tangan'}</Text>
            </View>
            <View style={styles.signature}>
              <Text style={styles.signatureHeader}>{data.handover ? 'Pihak yang menerima,' : 'Diterima dan disetujui oleh,'}</Text>
              <Text style={styles.signatureCompany}>{data.clientName}</Text>
              <View style={styles.signatureSpace} />
              <Text style={styles.signatureLine}>{data.clientPic || '( .............................................. )'}</Text>
              <Text style={styles.signerTitle}>{data.clientPic ? 'Nama dan tanda tangan' : 'Nama dan tanda tangan'}</Text>
            </View>
          </View>
        )}
        <View style={styles.footer} fixed>
          {data.qrPath ? (
            <Svg style={styles.qr} viewBox={`0 0 ${data.qrSize} ${data.qrSize}`}>
              <Path d={data.qrPath} fill="#111111" />
            </Svg>
          ) : null}
          <View style={styles.footerText}>
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>VERIFIKASI DOKUMEN</Text>
            <Text>{data.footerText || 'Pindai kode QR untuk memeriksa keabsahan nomor dokumen pada sistem HeavyOps. Dokumen ini diterbitkan secara elektronik; tanda tangan dilengkapi oleh para pihak.'}</Text>
            {data.verifyUrl && <Text style={styles.verifyUrl}>{data.verifyUrl}</Text>}
          </View>
          <Text style={styles.pageNumber} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
