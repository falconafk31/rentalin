import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import QRCode from 'qrcode';
import { getWorkspaceData } from '@/lib/data';
import { BusinessDocument, type PdfData } from '@/components/pdf-document';
import { dateLabel, money, labels } from '@/lib/format';
import { requireUser } from '@/lib/auth';
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
 const qr=await QRCode.toDataURL(`${origin}/verify/doc?id=${id}`,{width:160,margin:1,errorCorrectionLevel:'M'});
 const data:PdfData={title:invoice?'FAKTUR TAGIHAN':handover?'BERITA ACARA SERAH TERIMA':'SURAT PENAWARAN HARGA',number:invoice?.invoiceNumber||handover?.documentNumber||contract.contractNumber.replace('KTR','SPH'),company:workspace.settings,clientName:client.companyName,clientAddress:client.address||'',date:dateLabel(invoice?.issueDate||handover?.date||contract.createdAt),reference:contract.contractNumber,qr,rows:[{label:'Kode unit alat berat',value:unit.unitCode},{label:'Merek / model',value:unit.brandModel},{label:'Kategori',value:unit.category}],notes:''};
 if(invoice){const hours=workspace.timesheets.filter(t=>t.invoiceId===invoice.id).reduce((sum,t)=>sum+Number(t.effectiveHours),0);data.rows.push({label:'Tarif sewa per jam',value:money(contract.ratePerHour)});if(hours)data.rows.push({label:'Jumlah jam kerja efektif yang disetujui',value:`${hours.toLocaleString('id-ID')} jam`});else data.rows.push({label:'Dasar penagihan',value:'Sewa alat berat sesuai kontrak'});data.rows.push({label:'Status pembayaran',value:labels[invoice.status]});data.subtotal=money(Number(invoice.totalAmount)-Number(invoice.taxAmount));data.tax=money(invoice.taxAmount);data.total=money(invoice.totalAmount);data.dueDate=dateLabel(invoice.dueDate);data.notes='Pembayaran dilakukan sesuai kesepakatan dalam kontrak sewa. Cantumkan nomor tagihan pada bukti pembayaran dan sampaikan konfirmasi kepada bagian keuangan. PPN dihitung sebesar 11% dari subtotal.';}
 else if(handover){data.handover=true;data.rows.push({label:'Jenis serah terima',value:labels[handover.type]},{label:'Kondisi mesin',value:handover.engine?'Baik':'Perlu perhatian'},{label:'Kondisi sistem hidraulik',value:handover.hydraulics?'Baik':'Perlu perhatian'},{label:'Kondisi rantai / roda',value:handover.tracks?'Baik':'Perlu perhatian'});data.notes=handover.notes||'Para pihak telah memeriksa unit bersama-sama. Kondisi unit sesuai hasil pemeriksaan yang tercantum dalam berita acara ini.';}
 else{data.rows.push({label:'Periode sewa',value:`${dateLabel(contract.startDate)} s.d. ${dateLabel(contract.endDate)}`},{label:'Tarif sewa per jam',value:money(contract.ratePerHour)},{label:'Pajak pertambahan nilai',value:'PPN 11% (di luar tarif sewa)'});data.notes='Tarif belum termasuk PPN 11%. Penagihan berdasarkan jam kerja efektif yang telah disetujui. Mobilisasi, bahan bakar, operator, dan ketentuan pembayaran mengikuti kesepakatan dalam kontrak sewa.';}
 const buffer=await renderToBuffer(BusinessDocument({data}));
 return new Response(new Uint8Array(buffer),{headers:{'Content-Type':'application/pdf','Content-Disposition':`inline; filename="${data.number.replaceAll('/','-')}.pdf"`,'Cache-Control':'private, no-store'}});
}
