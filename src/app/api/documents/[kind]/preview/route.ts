import { renderToBuffer } from '@react-pdf/renderer';
import { getTemplate, templateContent, templateVars, type TemplateKind } from '@/lib/data';
import { BusinessDocument, type PdfData } from '@/components/pdf-document';
import { money } from '@/lib/format';
import { requireUser } from '@/lib/auth';
export const runtime='nodejs';
export const dynamic='force-dynamic';

// Pratinjau template: PDF CONTOH dengan data dummy yang deterministik, memakai
// template PUBLISHED per jenis (bila ada) - identik alur templateVars +
// applyTemplateVars dengan /api/documents/[kind]/[id], tanpa menyentuh DB
// operasional. Tujuan: admin bisa melihat hasil pengaturan template sebelum
// menerbitkan (tombol Pratinjau di /dashboard/settings/templates).
const KINDS: TemplateKind[] = ['sph', 'bast', 'invoice', 'perjanjian'];
const KIND_LABEL: Record<TemplateKind, string> = { sph: 'SURAT PENAWARAN HARGA', bast: 'BERITA ACARA SERAH TERIMA', invoice: 'FAKTUR TAGIHAN', perjanjian: 'SURAT PERJANJIAN SEWA MENYEWA ALAT BERAT' };
const KIND_NUMBER: Record<TemplateKind, string> = { sph: 'SPH/2026/09/0001', bast: 'BAST/2026/09/0001', invoice: 'INV/2026/09/0001', perjanjian: 'PJS/2026/09/0001' };

export async function GET(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!KINDS.includes(kind as TemplateKind)) return Response.json({ message: 'Jenis dokumen tidak dikenal.' }, { status: 404 });
  try { await requireUser(); } catch { return Response.json({ message: 'Anda tidak memiliki izin.' }, { status: 403 }); }
  const k = kind as TemplateKind;
  const settings = {
    id: 'main', companyName: 'PT Contoh Perusahaan (Data Pratinjau)', address: 'Jl. Contoh No. 123, Jakarta', email: 'operasional@contoh.id', phone: '+62 21 555 0128',
    signerName: 'Budi Santoso', signerTitle: 'Direktur Operasional', ppnRate: '11', expiryWarningDays: 30, city: 'Jakarta', timezone: 'WIB',
    npwp: '01.234.567.8-000.000', signerKtp: '', bankName: 'Bank Contoh', bankAccountName: 'PT Contoh Perusahaan', bankAccountNumber: '1234567890',
  };
  // BAST pratinjau = mobilisasi (paling lengkap: checklist + pembuka).
  const handover = k === 'bast' ? { documentNumber: KIND_NUMBER.bast, type: 'mobilization' as const, date: '2026-09-14', notes: '' } : undefined;
  const agreement = k === 'perjanjian' ? (() => ({
    openingDate: 'Senin, 14 September 2026', city: settings.city, number: KIND_NUMBER.perjanjian, contractNumber: 'KTR/2026/09/0001',
    first: { name: settings.companyName, address: settings.address, representative: settings.signerName || undefined, title: settings.signerTitle || undefined, npwp: settings.npwp },
    second: { name: 'PT Pelanggan Jaya (Data Pratinjau)', address: 'Jl. Pelanggan No. 45, Surabaya', representative: 'Andi Wijaya', ktp: '3578-xxxx-xxxx-0001' },
    unit: { brand: 'Komatsu PC200-8', category: 'Excavator', year: '2022', code: 'EXC-001' },
    period: { start: '14 September 2026', end: '13 Oktober 2026', days: 30, daysWords: 'tiga puluh' },
    rate: { hourly: money('165000'), hourlyWords: 'seratus enam puluh lima ribu rupiah', ppn: '11' },
    bank: { name: settings.bankName, accountName: settings.bankAccountName, accountNumber: settings.bankAccountNumber },
  }))() : undefined;
  // QR kosong: pratinjau tidak menautkan dokumen nyata. qrPath kosong = blok
  // QR tidak dirender (BusinessDocument melewati bila path kosong).
  const rows = [
    { label: 'Kode unit alat berat', value: 'EXC-001' },
    { label: 'Merek / model', value: 'Komatsu PC200-8' },
    { label: 'Kategori', value: 'Excavator' },
  ];
  const data: PdfData = {
    title: KIND_LABEL[k], number: KIND_NUMBER[k], company: settings,
    clientName: 'PT Pelanggan Jaya (Data Pratinjau)', clientAddress: 'Jl. Pelanggan No. 45, Surabaya', clientPic: 'Andi Wijaya',
    date: '14 September 2026', reference: 'KTR/2026/09/0001', qrPath: '', qrSize: 0, verifyUrl: undefined,
    rows, notes: '', handover: k === 'bast' ? true : undefined, parties: handover ? {
      openingDate: 'Senin, 14 September 2026', city: settings.city,
      first: { name: settings.companyName, address: settings.address, representative: settings.signerName || undefined, title: settings.signerTitle || undefined },
      second: { name: 'PT Pelanggan Jaya (Data Pratinjau)', address: 'Jl. Pelanggan No. 45, Surabaya', representative: 'Andi Wijaya' },
      type: 'mobilization' as const, contractNumber: 'KTR/2026/09/0001',
    } : undefined, agreement,
  };
  if (k === 'invoice') {
    data.rows.push({ label: 'Tarif sewa per jam', value: money('165000') }, { label: 'Jumlah jam kerja efektif yang disetujui', value: '120 jam' }, { label: 'Status pembayaran', value: 'Belum dibayar' });
    data.subtotal = money('19800000'); data.tax = money('2178000'); data.taxLabel = 'PPN 11%'; data.total = money('21978000'); data.dueDate = '28 September 2026';
    data.payments = [{ label: '12 September 2026 - Transfer - REF-001', value: money('5000000') }];
    data.paidTotal = money('5000000'); data.remaining = money('16978000');
    data.notes = 'Pembayaran dilakukan sesuai kesepakatan dalam kontrak sewa. Cantumkan nomor tagihan pada bukti pembayaran.';
  }
  if (k === 'bast') {
    data.rows.push({ label: 'Jenis serah terima', value: 'Mobilisasi (Penyerahan Unit)' });
    data.checklist = [
      { item: 'Mesin', ok: true }, { item: 'Sistem hidraulik', ok: true }, { item: 'Rantai / roda', ok: true },
      { item: 'Aki & starter', ok: true }, { item: 'Lampu & klakson', ok: false }, { item: 'APAR & P3K', ok: true },
    ];
    data.partiesIntro = 'PIHAK PERTAMA dengan ini menyerahkan kepada PIHAK KEDUA unit alat berat dengan rincian dan kelengkapan sebagaimana tercantum di bawah ini:';
  }
  if (k === 'sph') {
    data.rows.push({ label: 'Periode sewa', value: '14 September 2026 s.d. 13 Oktober 2026' }, { label: 'Tarif sewa per jam', value: money('165000') }, { label: 'Pajak pertambahan nilai', value: 'PPN 11% (di luar tarif sewa)' });
    data.introText = 'Dengan hormat, kami menyampaikan penawaran harga sewa alat berat dengan rincian dan ketentuan sebagai berikut:';
    data.notes = 'Tarif belum termasuk PPN 11%. Penagihan berdasarkan jam kerja efektif yang telah disetujui.';
  }
  // Terapkan template PUBLISHED (bila ada) - sama seperti dokumen nyata.
  const tpl = templateContent(await getTemplate(k));
  const vars = templateVars({ ok: true as const, settings, contract: { id: 'x', contractNumber: 'KTR/2026/09/0001', clientId: 'x', unitId: 'x', startDate: '2026-09-14', endDate: '2026-10-13', ratePerHour: '165000', status: 'active', includeOperator: false, operatorRate: null, operatorRateType: null, createdAt: new Date() }, client: { id: 'x', companyName: 'PT Pelanggan Jaya (Data Pratinjau)', picName: 'Andi Wijaya', npwp: null, address: null, picKtp: null, picPhone: null, picEmail: null, createdAt: new Date() }, unit: { id: 'x', unitCode: 'EXC-001', category: 'Excavator', brandModel: 'Komatsu PC200-8', year: 2022, status: 'rented', currentLocation: null, sikoExpiry: null, insuranceExpiry: null, hourlyRate: '165000', createdAt: new Date() }, hours: 120, payments: [], bastNumber: undefined }, data.date, data.number);
  const tv = (key: string) => tpl?.[key] ? templateVarsApply(tpl[key], vars) : undefined;
  function templateVarsApply(text: string, v: Record<string, string>) { return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, name: string) => Object.prototype.hasOwnProperty.call(v, name) ? v[name] : m); }
  const intro = tv('intro');
  if (intro) data.introText = intro;
  if (k === 'invoice') { const n = tv('notes'); if (n) data.notes = n; }
  if (k === 'sph') { const n = tv('notes'); if (n) data.notes = n; }
  if (k === 'bast') { const pi = tv('intro_mobilisasi'); if (pi) data.partiesIntro = pi; const cl = tv('clause_rangkap'); if (cl) data.clauseText = cl; }
  if (k === 'perjanjian') {
    const pasal: Record<string, string> = {};
    for (let n = 1; n <= 6; n++) { const t = tv(`pasal_${n}`); if (t) pasal[`pasal_${n}`] = t; }
    if (Object.keys(pasal).length) data.pasalText = pasal;
    const closing = tv('closing_rangkap'); if (closing) data.clauseText = closing;
  }
  const buffer = await renderToBuffer(BusinessDocument({ data }));
  return new Response(new Uint8Array(buffer), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="preview-${k}.pdf"`, 'Cache-Control': 'private, no-store' } });
}
