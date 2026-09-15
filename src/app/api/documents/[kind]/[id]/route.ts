import { renderToBuffer } from '@react-pdf/renderer';
import QRCode from 'qrcode';
import { db } from '@/db';
import * as s from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getDocumentBundle, getTemplate, templateContent, templateVars, applyTemplateVars, type TemplateKind } from '@/lib/data';
import { BusinessDocument, type PdfData } from '@/components/pdf-document';
import { dateLabel, fullDateLabel, money, labels } from '@/lib/format';
import { angkaKeKata, rupiahKeKata } from '@/lib/terbilang';
import { requireUser, createAuthClient } from '@/lib/auth';
export const runtime='nodejs';
export const dynamic='force-dynamic';
// Pembatasan akses: seluruh PDF dokumen butuh login internal. Invoice
// (finansial) hanya admin/finance/operations; SPH/BAST/perjanjian terbuka
// bagi seluruh role internal. Halaman /verify/doc tetap publik minimal.
export async function GET(request:Request,{params}:{params:Promise<{kind:string;id:string}>}){
 const {kind,id}=await params;
 if(!['invoice','sph','bast','perjanjian'].includes(kind)||! /^[0-9a-f-]{36}$/i.test(id))return Response.json({message:'Dokumen tidak ditemukan.'},{status:404});
 try{
  if(kind==='invoice')await requireUser(['admin','finance','operations']);
  else await requireUser();
 }catch(error){if(((error as Error).message||'').includes('NEXT_REDIRECT'))throw error;return Response.json({message:'Anda tidak memiliki izin mengunduh dokumen.'},{status:403});}
 // O-A: bundle titik — hanya dokumen + kontrak + klien + unit + settings yang
 // terlibat (sebelumnya seluruh workspace di-fetch untuk satu PDF).
 const bundle=await getDocumentBundle(kind as 'invoice'|'bast'|'sph'|'perjanjian',id);
 if(!bundle.ok)return Response.json({message:'Dokumen tidak ditemukan.'},{status:bundle.reason==='incomplete'?422:404});
 const {settings,contract,client,unit}=bundle;
 const invoice=bundle.invoice,handover=bundle.handover;
 const origin=process.env.NEXT_PUBLIC_APP_URL||new URL(request.url).origin;
 const tz=settings.timezone;
 // QR membawa kind agar halaman verifikasi menampilkan jenis dokumen
 // yang benar (id perjanjian = id kontrak, sama dengan SPH).
 const verifyUrl=`${origin}/verify/doc?id=${id}${kind==='perjanjian'?'&kind=perjanjian':''}`;
 // QR dibangun sebagai path SVG (kotak terisi) sehingga proses render tidak bergantung
 // pada decoder PNG runtime — penyebab QR kosong pada sebagian lingkungan dev.
 const matrix=QRCode.create(verifyUrl,{errorCorrectionLevel:'M'}).modules;const margin=2;const size=matrix.size;let qrPath='';for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(matrix.data[y*size+x])qrPath+=`M${x+margin} ${y+margin}h1v1h-1z`;
 const ppnRate=Number(settings.ppnRate??11);
 // BAST mengikuti format berita acara resmi: pembuka "Pada hari ini…", blok
 // identitas PIHAK PERTAMA (penyedia — wakil: penandatangan perusahaan) dan
 // PIHAK KEDUA (penyewa — wakil: PIC klien), klausul rangkap 2, serta 3 blok
 // tanda tangan (menyerahkan/menerima/mengetahui).
 const tpl=templateContent(await getTemplate(kind as TemplateKind));
 const agreement=kind==='perjanjian'?(()=>{
  const days=Math.round((Date.parse(contract.endDate+'T00:00:00Z')-Date.parse(contract.startDate+'T00:00:00Z'))/86400000)+1;
  return {
   openingDate:fullDateLabel(contract.createdAt,tz),
   city:settings.city,
   number:contract.contractNumber.replace('KTR','PJS'),
   contractNumber:contract.contractNumber,
   first:{name:settings.companyName,address:settings.address,representative:settings.signerName||undefined,title:settings.signerTitle||undefined,ktp:settings.signerKtp||undefined,npwp:settings.npwp||undefined},
   second:{name:client.companyName,address:client.address||'',representative:client.picName||undefined,ktp:client.picKtp||undefined,npwp:client.npwp||undefined},
   bank:(settings.bankName&&settings.bankAccountName&&settings.bankAccountNumber)?{name:settings.bankName,accountName:settings.bankAccountName,accountNumber:settings.bankAccountNumber}:undefined,
   unit:{brand:unit.brandModel,category:unit.category,year:unit.year?String(unit.year):'—',code:unit.unitCode,bastNumber:bundle.bastNumber},
   period:{start:dateLabel(contract.startDate,tz),end:dateLabel(contract.endDate,tz),days,daysWords:angkaKeKata(days)},
   rate:{hourly:money(contract.ratePerHour),hourlyWords:rupiahKeKata(contract.ratePerHour),ppn:Number(settings.ppnRate??11).toString()},
 operatorInfo:bundle.operatorInfo,
  };
 })():undefined;
 // BAST mengikuti format berita acara resmi: pembuka "Pada hari ini…", blok
 // identitas PIHAK PERTAMA (penyedia — wakil: penandatangan perusahaan) dan
 // PIHAK KEDUA (penyewa — wakil: PIC klien), klausul rangkap 2, serta 3 blok
 // tanda tangan (menyerahkan/menerima/mengetahui).
 const parties=handover?{
  openingDate:fullDateLabel(handover.date,tz),
  city:settings.city,
  first:{name:settings.companyName,address:settings.address,representative:settings.signerName||undefined,title:settings.signerTitle||undefined},
  second:{name:client.companyName,address:client.address||'',representative:client.picName||undefined},
  type:handover.type==='demobilization'?'demobilization' as const:'mobilization' as const,
  contractNumber:contract.contractNumber,
 }:undefined;
  const data:PdfData={title:invoice?'FAKTUR TAGIHAN':handover?'BERITA ACARA SERAH TERIMA':agreement?'SURAT PERJANJIAN SEWA MENYEWA ALAT BERAT':'SURAT PENAWARAN HARGA',number:invoice?.invoiceNumber||handover?.documentNumber||agreement?.number||contract.contractNumber.replace('KTR','SPH'),company:settings,clientName:client.companyName,clientAddress:client.address||'',clientPic:client.picName,date:dateLabel(invoice?.issueDate||handover?.date||contract.createdAt,tz),reference:contract.contractNumber,qrPath,qrSize:size+margin*2,verifyUrl,rows:[{label:'Kode unit alat berat',value:unit.unitCode},{label:'Merek / model',value:unit.brandModel},{label:'Kategori',value:unit.category}],notes:'',parties,agreement,operatorInfo:bundle.operatorInfo};
 // Template dinamis (Pengaturan > Template PDF): nilai {{variabel}} diisi
 // dari dokumen aktif; kosong → fallback hardcoded di bawah tidak berubah.
 const vars=templateVars(bundle,data.date,data.number);
 const tv=(key:string)=>tpl?.[key]?applyTemplateVars(tpl[key],vars):undefined;
 if(invoice){
  const hours=bundle.hours??0;
  const history=bundle.payments??[];
  const paidTotal=history.reduce((a,p)=>a+Number(p.amount),0);
  
  // M1.3: Query timesheet snapshots for historical rate display
  const timesheetRates = await db.select({
    billingRateSnapshot: s.timesheets.billingRateSnapshot,
    effectiveHours: s.timesheets.effectiveHours
  }).from(s.timesheets).where(eq(s.timesheets.invoiceId, invoice.id));

  // Determine rate presentation
  const uniqueRates: number[] = Array.from(new Set(
    timesheetRates
      .map(t => Number(t.billingRateSnapshot))
      .filter(r => Number.isFinite(r) && r > 0)
  ));

  if (uniqueRates.length === 0) {
    // Historical invoice pre-snapshot (legacy)
    data.rows.push({label:'Tarif sewa',value:'Data tarif historis tidak tersedia'});
  } else if (uniqueRates.length === 1) {
    // Single rate - clean display
    const rate = uniqueRates[0];
    data.rows.push({label:'Tarif sewa per jam',value:money(rate)});
  } else {
    // Multiple rates - show breakdown
    const rateBreakdown = uniqueRates
      .sort((a, b) => b - a)
      .map(rate => {
        const rateHours = timesheetRates
          .filter(t => Number(t.billingRateSnapshot) === rate)
          .reduce((sum, t) => sum + Number(t.effectiveHours ?? 0), 0);
        return `${rateHours.toLocaleString('id-ID')} jam × ${money(rate)}`;
      })
      .join(' + ');
    data.rows.push({label:'Tarif sewa',value:rateBreakdown});
  }

  if(Number(invoice.operatorAmount??0)>0)data.rows.push({label:'Jasa operator (wet hire)',value:money(invoice.operatorAmount)});
  if(hours)data.rows.push({label:'Jumlah jam kerja efektif yang disetujui',value:`${hours.toLocaleString('id-ID')} jam`});
  else data.rows.push({label:'Dasar penagihan',value:'Sewa alat berat sesuai kontrak'});
  data.rows.push({label:'Status pembayaran',value:labels[invoice.status]});
  const rate=Number(invoice.taxRate??ppnRate);data.subtotal=money(invoice.subtotalAmount??(Number(invoice.totalAmount)-Number(invoice.taxAmount)));data.tax=money(invoice.taxAmount);data.taxLabel=`PPN ${rate}%`;data.total=money(invoice.totalAmount);data.dueDate=dateLabel(invoice.dueDate,tz);
  if(history.length){
   data.paidTotal=money(paidTotal);data.remaining=money(Math.max(0,Number(invoice.totalAmount)-paidTotal));
   data.payments=history.slice(0,10).map(p=>({label:`${dateLabel(p.paidAt,tz)} · ${labels[p.method]}${p.reference?` · ${p.reference}`:''}${p.notes?` — ${p.notes.slice(0,60)}`:''}`,value:money(p.amount)}));
  }
  const bankLine=(settings.bankName&&settings.bankAccountName&&settings.bankAccountNumber)?` Pembayaran dapat ditransfer ke rekening ${settings.bankName} a.n. ${settings.bankAccountName} nomor ${settings.bankAccountNumber}.`:'';
  data.notes=tv('notes')||`Pembayaran dilakukan sesuai kesepakatan dalam kontrak sewa. Cantumkan nomor tagihan pada bukti pembayaran dan sampaikan konfirmasi kepada bagian keuangan. PPN dihitung sebesar ${rate}% dari subtotal.${bankLine}`;
  data.introText=tv('intro');
  data.footerText=tv('footer_text');
 }
 else if(handover){
  data.handover=true;const raw=handover as unknown as Record<string,boolean>;data.rows.push({label:'Jenis serah terima',value:labels[handover.type]});
  const items:[string,string][]=[['engine','Mesin'],['hydraulics','Sistem hidraulik'],['tracks','Rantai / roda'],['oil','Oli & cairan'],['fuel','Bahan bakar'],['battery','Aki & starter'],['lights','Lampu & klakson'],['brakes','Rem & kemudi'],['bucket','Bucket / attachment'],['cabin','Kabin & ROPS'],['safety','APAR & P3K'],['documents','SIKO & dokumen']];data.checklist=items.map(([key,item])=>({item,ok:!!raw[key]}));
  data.notes=tv('notes')||handover.notes||'Para pihak telah memeriksa unit bersama-sama. Kondisi unit sesuai hasil pemeriksaan yang tercantum dalam berita acara ini.';
  data.partiesIntro=tv(handover.type==='demobilization'?'intro_demobilisasi':'intro_mobilisasi');
  data.clauseText=tv('clause_rangkap');
  data.footerText=tv('footer_text');
  // Foto dari bucket privat disisipkan via signed URL (maks 4, hanya yang valid).
  if(handover.photoUrls?.length){
   try{
    const supabase=await createAuthClient();
    const {data:signed}=await supabase.storage.from('bast-photos').createSignedUrls(handover.photoUrls.slice(0,4),3600);
    const urls=(signed||[]).flatMap(s=>s.signedUrl?[s.signedUrl]:[]);
    const valid:string[]=[];
    for(const url of urls){try{const r=await fetch(url,{method:'HEAD'});if(r.ok)valid.push(url);}catch{/* lewati foto rusak */}}
    if(valid.length)data.photos=valid;
   }catch{/* mode pratinjau / storage belum siap — PDF tetap terbit tanpa foto */}
  }
 }
 else{
  data.rows.push({label:'Periode sewa',value:`${dateLabel(contract.startDate,tz)} s.d. ${dateLabel(contract.endDate,tz)}`},{label:'Tarif sewa per jam',value:money(contract.ratePerHour)},{label:'Pajak pertambahan nilai',value:`PPN ${ppnRate}% (di luar tarif sewa)`});
  data.introText=tv('intro');
  data.notes=tv('notes')||`Tarif belum termasuk PPN ${ppnRate}%. Penagihan berdasarkan jam kerja efektif yang telah disetujui. Mobilisasi, bahan bakar, operator, dan ketentuan pembayaran mengikuti kesepakatan dalam kontrak sewa.`;
  data.footerText=tv('footer_text');
  if(agreement){
   const pasal: Record<string, string> = {};
   for(let n=1;n<=6;n++){const t=tv(`pasal_${n}`);if(t)pasal[`pasal_${n}`]=t;}
   if(Object.keys(pasal).length)data.pasalText=pasal;
   const closing=tv('closing_rangkap');
   if(closing)data.clauseText=closing;
  }
 }
 const buffer=await renderToBuffer(BusinessDocument({data}));
 return new Response(new Uint8Array(buffer),{headers:{'Content-Type':'application/pdf','Content-Disposition':`inline; filename="${data.number.replaceAll('/','-')}.pdf"`,'Cache-Control':'private, no-store'}});
}
