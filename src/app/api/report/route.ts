import { getWorkspaceData } from '@/lib/data';
import { labels } from '@/lib/format';
import { requireUser } from '@/lib/auth';
// Pembatasan akses (audit.md A1 / Quick Win #1): laporan CSV memuat data tagihan —
// hanya admin, finance, dan operations. Operator tidak lagi dapat mengunduh.
export async function GET(){
 try{await requireUser(['admin','finance','operations']);}
 catch(error){if(((error as Error).message||'').includes('NEXT_REDIRECT'))throw error;return Response.json({message:'Anda tidak memiliki izin mengunduh laporan ini.'},{status:403});}
 const data=await getWorkspaceData();const escape=(v:unknown)=>`"${String(v??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')}"`;const rows=[['LAPORAN OPERASIONAL',data.settings.companyName],['Tanggal',new Date().toLocaleDateString('id-ID')],[],['ARMADA'],['Kode Unit','Kategori','Merek / Model','Status','Lokasi','Tarif per Jam (Rp)'],...data.fleet.map(f=>[f.unitCode,f.category,f.brandModel,labels[f.status],f.currentLocation,f.hourlyRate]),[],['PENAGIHAN'],['Nomor Tagihan','Tanggal Terbit','Jatuh Tempo','Total (Rp)','PPN (Rp)','Status'],...data.invoices.map(i=>[i.invoiceNumber,i.issueDate,i.dueDate,i.totalAmount,i.taxAmount,labels[i.status]])];return new Response('\uFEFF'+rows.map(r=>r.map(escape).join(';')).join('\r\n'),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="laporan-operasional-${new Date().toISOString().slice(0,10)}.csv"`,'Cache-Control':'no-store'}});}
