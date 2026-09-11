import { renderToBuffer } from '@react-pdf/renderer';
import QRCode from 'qrcode';
import { getWorkspaceData } from '@/lib/data';
import { BusinessDocument, type PdfData } from '@/components/pdf-document';
import { dateLabel, money, labels } from '@/lib/format';
import { requireUser, createAuthClient } from '@/lib/auth';
export const runtime='nodejs';
export const dynamic='force-dynamic';
// Pembatasan akses (audit.md A1 / Quick Win #1): PDF invoice memuat nilai finansial —
// hanya admin/finance/operations. SPH & BAST tetap terbuka bagi seluruh role internal
// karena bersifat operasional, bukan finansial.
export async function GET(request:Request,{params}:{params:Promise<{kind:string;id:string}>}){
 const {kind,id}=await params;
 if(!['invoice','sph','bast'].includes(kind)||! /^[0-9a-f-]{36}$/i.test(id))return Response.json({message:'Dokumen tidak ditemukan.'},{status:404});
 if(kind==='invoice'){
  try{await requireUser(['admin','finance','operations']);}
  catch(error){if(((error as Error).message||'').includes('NEXT_REDIRECT'))throw error;return Response.json({message:'Anda tidak memiliki izin mengunduh dokumen tagihan.'},{status:403});}
 }
 const workspace=await getWorkspaceData();
 const invoice=kind==='invoice'?workspace.invoices.find(i=>i.id===id):undefined;
 const handover=kind==='bast'?workspace.handovers.find(h=>h.id===id):undefined;
 const contract=workspace.contracts.find(c=>c.id===(invoice?.contractId||handover?.contractId||(kind==='sph'?id:'')));
 if(!contract)return Response.json({message:'Dokumen tidak ditemukan.'},{status:404});
 const client=workspace.clients.find(c=>c.id===contract.clientId);const unit=workspace.fleet.find(f=>f.id===contract.unitId);
 if(!client||!unit)return Response.json({message:'Data dokumen tidak lengkap.'},{status:422});
 const origin=process.env.NEXT_PUBLIC_APP_URL||new URL(request.url).origin;
 // QR dibangun sebagai path SVG (kotak terisi) sehingga proses render tidak bergantung
 // pada decoder PNG runtime — penyebab QR kosong pada sebagian lingkungan dev.
 const matrix=QRCode.create(`${origin}/verify/doc?id=${id}`,{errorCorrectionLevel:'M'}).modules;const margin=2;const size=matrix.size;let qrPath='';for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(matrix.data[y*size+x])qrPath+=`M${x+margin} ${y+margin}h1v1h-1z`;
 const ppnRate=Number(workspace.settings.ppnRate??11);
 const data:PdfData={title:invoice?'FAKTUR TAGIHAN':handover?'BERITA ACARA SERAH TERIMA':'SURAT PENAWARAN HARGA',number:invoice?.invoiceNumber||handover?.documentNumber||contract.contractNumber.replace('KTR','SPH'),company:workspace.settings,clientName:client.companyName,clientAddress:client.address||'',clientPic:client.picName,date:dateLabel(invoice?.issueDate||handover?.date||contract.createdAt),reference:contract.contractNumber,qrPath,qrSize:size+margin*2,verifyUrl:`${origin}/verify/doc?id=${id}`,rows:[{label:'Kode unit alat berat',value:unit.unitCode},{label:'Merek / model',value:unit.brandModel},{label:'Kategori',value:unit.category}],notes:''};
 if(invoice){
  const hours=workspace.timesheets.filter(t=>t.invoiceId===invoice.id).reduce((sum,t)=>sum+Number(t.effectiveHours),0);
  const history=workspace.payments.filter(p=>p.invoiceId===invoice.id);
  const paidTotal=history.reduce((a,p)=>a+Number(p.amount),0);
  data.rows.push({label:'Tarif sewa per jam',value:money(contract.ratePerHour)});
  if(hours)data.rows.push({label:'Jumlah jam kerja efektif yang disetujui',value:`${hours.toLocaleString('id-ID')} jam`});
  else data.rows.push({label:'Dasar penagihan',value:'Sewa alat berat sesuai kontrak'});
  data.rows.push({label:'Status pembayaran',value:labels[invoice.status]});
  const rate=Number(invoice.taxRate??ppnRate);data.subtotal=money(invoice.subtotalAmount??(Number(invoice.totalAmount)-Number(invoice.taxAmount)));data.tax=money(invoice.taxAmount);data.taxLabel=`PPN ${rate}%`;data.total=money(invoice.totalAmount);data.dueDate=dateLabel(invoice.dueDate);
  if(history.length){
   data.paidTotal=money(paidTotal);data.remaining=money(Math.max(0,Number(invoice.totalAmount)-paidTotal));
   data.payments=history.slice(0,10).map(p=>({label:`${dateLabel(p.paidAt)} · ${labels[p.method]}${p.reference?` · ${p.reference}`:''}`,value:money(p.amount)}));
  }
  data.notes=`Pembayaran dilakukan sesuai kesepakatan dalam kontrak sewa. Cantumkan nomor tagihan pada bukti pembayaran dan sampaikan konfirmasi kepada bagian keuangan. PPN dihitung sebesar ${rate}% dari subtotal.`;
 }
 else if(handover){
  data.handover=true;const raw=handover as unknown as Record<string,boolean>;data.rows.push({label:'Jenis serah terima',value:labels[handover.type]});
  const items:[string,string][]=[['engine','Mesin'],['hydraulics','Sistem hidraulik'],['tracks','Rantai / roda'],['oil','Oli & cairan'],['fuel','Bahan bakar'],['battery','Aki & starter'],['lights','Lampu & klakson'],['brakes','Rem & kemudi'],['bucket','Bucket / attachment'],['cabin','Kabin & ROPS'],['safety','APAR & P3K'],['documents','SIKO & dokumen']];data.checklist=items.map(([key,item])=>({item,ok:!!raw[key]}));
  data.notes=handover.notes||'Para pihak telah memeriksa unit bersama-sama. Kondisi unit sesuai hasil pemeriksaan yang tercantum dalam berita acara ini.';
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
 else{data.rows.push({label:'Periode sewa',value:`${dateLabel(contract.startDate)} s.d. ${dateLabel(contract.endDate)}`},{label:'Tarif sewa per jam',value:money(contract.ratePerHour)},{label:'Pajak pertambahan nilai',value:`PPN ${ppnRate}% (di luar tarif sewa)`});data.notes=`Tarif belum termasuk PPN ${ppnRate}%. Penagihan berdasarkan jam kerja efektif yang telah disetujui. Mobilisasi, bahan bakar, operator, dan ketentuan pembayaran mengikuti kesepakatan dalam kontrak sewa.`;}
 const buffer=await renderToBuffer(BusinessDocument({data}));
 return new Response(new Uint8Array(buffer),{headers:{'Content-Type':'application/pdf','Content-Disposition':`inline; filename="${data.number.replaceAll('/','-')}.pdf"`,'Cache-Control':'private, no-store'}});
}
