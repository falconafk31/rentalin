import { getReportData } from '@/lib/data';
import { labels, TIMEZONE_IANA, resolveTz } from '@/lib/format';
import { requireUser } from '@/lib/auth';
// Pembatasan akses (audit.md A1 / Quick Win #1): laporan CSV memuat data tagihan —
// hanya admin, finance, dan operations. Operator tidak lagi dapat mengunduh.
export async function GET(){
 try{await requireUser(['admin','finance','operations']);}
 catch(error){if(((error as Error).message||'').includes('NEXT_REDIRECT'))throw error;return Response.json({message:'Anda tidak memiliki izin mengunduh laporan ini.'},{status:403});}
 // O-A: ekspor terarah — hanya settings + armada + invoice + pembayaran.
 const data=await getReportData();
 const paidBy=new Map<string,number>();
 for(const p of data.payments)paidBy.set(p.invoiceId,(paidBy.get(p.invoiceId)||0)+Number(p.amount));
 const escape=(v:unknown)=>`"${String(v??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')}"`;
 const rows=[['LAPORAN OPERASIONAL',data.settings.companyName],['Tanggal',new Date().toLocaleDateString('id-ID',{timeZone:TIMEZONE_IANA[resolveTz(data.settings.timezone)]})],[],['ARMADA'],['Kode Unit','Kategori','Merek / Model','Status','Lokasi','Tarif per Jam (Rp)'],...data.fleet.map(f=>[f.unitCode,f.category,f.brandModel,labels[f.status],f.currentLocation,f.hourlyRate]),[],['PENAGIHAN'],['Nomor Tagihan','Tanggal Terbit','Jatuh Tempo','Total (Rp)','PPN (Rp)','Dibayar (Rp)','Sisa (Rp)','Status'],...data.invoices.map(i=>{const paid=paidBy.get(i.id)||0;return [i.invoiceNumber,i.issueDate,i.dueDate,i.totalAmount,i.taxAmount,paid.toFixed(2),(Number(i.totalAmount)-paid).toFixed(2),labels[i.status]];})];
 return new Response('\uFEFF'+rows.map(r=>r.map(escape).join(';')).join('\r\n'),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="laporan-operasional-${new Date().toISOString().slice(0,10)}.csv"`,'Cache-Control':'no-store'}});
}
