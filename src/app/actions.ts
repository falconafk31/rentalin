'use server';
import { db } from '@/db';
import * as s from '@/db/schema';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireUser, createAuthClient, isConfigured, isPreview } from '@/lib/auth';
import { logAudit, getProfileNameBestEffort } from '@/lib/audit';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { todayISO, money } from '@/lib/format';
import { calcInvoiceTotals, remainingBalance, resolveInvoiceStatus, normalizePaymentAmount } from '@/lib/finance';

export type ActionResult = { success: boolean; message: string; fieldErrors?: Record<string, string> };
const operationRoles = ['admin','operations'];
const text = (f:FormData,k:string) => String(f.get(k)||'').trim();

// Validasi per-field (O-C): error membawa nama kolom sehingga UI bisa
// menampilkan pesan tepat di bawah isian yang salah, bukan toast generik.
class FieldError extends Error {
  fieldErrors: Record<string,string>;
  constructor(fieldErrors: Record<string,string>, message = 'Periksa kembali isian yang ditandai.') {
    super(message);
    this.fieldErrors = fieldErrors;
  }
}
const fieldLabel: Record<string,string> = {
  unitCode:'Kode unit', brandModel:'Merek / model', category:'Kategori', categoryNew:'Kategori baru', year:'Tahun pembuatan',
  status:'Status', hourlyRate:'Tarif per jam', currentLocation:'Lokasi', companyName:'Nama perusahaan', picName:'Nama penanggung jawab',
  picEmail:'Surel penanggung jawab', contractNumber:'Nomor kontrak', clientId:'Klien', unitId:'Unit', startDate:'Tanggal mulai',
  endDate:'Tanggal selesai', ratePerHour:'Tarif sewa per jam', contractId:'Kontrak', date:'Tanggal', startHm:'HM awal',
  endHm:'HM akhir', breakdownHours:'Durasi kerusakan', type:'Jenis serah terima', dueDate:'Tanggal jatuh tempo',
  address:'Alamat', email:'Surel', phone:'Telepon', signerName:'Nama penandatangan', signerTitle:'Jabatan penandatangan',
  ppnRate:'Tarif PPN', expiryWarningDays:'Ambang peringatan', reason:'Alasan revisi', amount:'Nominal pembayaran',
  method:'Metode pembayaran', reference:'Referensi', paidAt:'Tanggal bayar', prefix:'Prefix kode', startNumber:'Nomor awal',
  count:'Jumlah unit', fullName:'Nama lengkap', role:'Peran', invoiceId:'Tagihan', id:'Data',
};
const label = (k:string) => fieldLabel[k] || k;
const required = (f:FormData,k:string) => {const v=text(f,k);if(!v)throw new FieldError({[k]:`${label(k)} wajib diisi.`});return v;};
const number = (f:FormData,k:string,min=0) => {const n=Number(required(f,k));if(!Number.isFinite(n)||n<min)throw new FieldError({[k]:`${label(k)} tidak valid.`});return n;};
const validDate = (f:FormData,k:string) => {const v=required(f,k);if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||isNaN(Date.parse(v)))throw new FieldError({[k]:`${label(k)} tidak valid.`});return v;};
const documentNumber = (prefix:string) => `${prefix}/${new Date().getFullYear()}/${Date.now().toString().slice(-8)}-${crypto.randomUUID().slice(0,4).toUpperCase()}`;
const appUrl = () => process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

async function currentPpnRate(): Promise<number> {
  const [row] = await db.select({ ppnRate: s.companySettings.ppnRate }).from(s.companySettings).limit(1);
  const rate = Number(row?.ppnRate ?? 11);
  return Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : 11;
}

function fail(error: unknown, uniqueField?: Record<string,string>, module?: string): ActionResult {
  const e = error as Error & { code?: string; cause?: { code?: string } };
  if (e instanceof FieldError) return { success: false, message: e.message, fieldErrors: e.fieldErrors };
  if ((e.message || '').includes('NEXT_REDIRECT')) throw error;
  const code = e.code || e.cause?.code;
  if (code === '23505' && module && uniqueField?.[module]) {
    const k = uniqueField[module];
    return { success: false, message: 'Data sudah terdaftar. Periksa isian yang ditandai.', fieldErrors: { [k]: `${label(k)} sudah terdaftar.` } };
  }
  return { success: false, message: code==='23505'?'Data sudah terdaftar. Periksa nomor unit atau tanggal catatan.':code==='23503'?'Data terkait tidak ditemukan atau masih digunakan.':code?'Data tidak dapat disimpan. Periksa kembali isian Anda.':e.message||'Terjadi kesalahan. Silakan coba kembali.' };
}
const uniqueField: Record<string,string> = { fleet:'unitCode', contracts:'contractNumber', timesheets:'date' };

export async function saveRecord(module:string,form:FormData): Promise<ActionResult> {
 try {
  const roles = module==='invoices'?['admin','finance']:module==='timesheets'?['admin','operations','operator']:module==='settings'?['admin']:operationRoles;
  const user = await requireUser(roles);
  const id = text(form,'id');
  const actor = { actorId: user.id, actorName: user.fullName };
  if(module==='fleet') {
   const status=required(form,'status');
   if(!['available','renting','maintenance','in_transit'].includes(status))throw new FieldError({status:'Status unit tidak valid.'});
   const catRaw=required(form,'category');const category=(catRaw==='__new'?text(form,'categoryNew'):catRaw).trim().slice(0,50);if(!category)throw new FieldError({categoryNew:'Kategori baru wajib diisi.'});
   const values={unitCode:required(form,'unitCode'),category,brandModel:required(form,'brandModel'),year:number(form,'year',1900),status,currentLocation:text(form,'currentLocation'),hourlyRate:String(number(form,'hourlyRate',1)),sikoExpiry:text(form,'sikoExpiry')||null,insuranceExpiry:text(form,'insuranceExpiry')||null};
   if(values.year>new Date().getFullYear()+1)throw new FieldError({year:'Tahun unit tidak valid.'});
   await db.transaction(async tx=>{
    if(id){await tx.select().from(s.fleet).where(eq(s.fleet.id,id)).for('update');const active=await tx.select().from(s.contracts).where(and(eq(s.contracts.unitId,id),eq(s.contracts.status,'active')));if(active.length&&status!=='renting')throw new Error('Unit masih terikat kontrak aktif. Selesaikan kontrak terlebih dahulu.');await tx.update(s.fleet).set(values).where(eq(s.fleet.id,id));}
    else {if(status==='renting')throw new FieldError({status:'Buat kontrak untuk menetapkan unit sebagai disewa.'});await tx.insert(s.fleet).values(values);}
   });
   await logAudit({ ...actor, action: id ? 'update' : 'create', entity: 'fleet', entityId: id || null, summary: `${id ? 'Mengubah' : 'Menambah'} unit ${values.unitCode} (${values.brandModel})` });
  } else if(module==='clients') {
   const email=text(form,'picEmail');if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new FieldError({picEmail:'Alamat surel tidak valid.'});
   const values={companyName:required(form,'companyName'),picName:required(form,'picName'),npwp:text(form,'npwp'),address:text(form,'address'),picPhone:text(form,'picPhone'),picEmail:email};
   if(id)await db.update(s.clients).set(values).where(eq(s.clients.id,id));else await db.insert(s.clients).values(values);
   await logAudit({ ...actor, action: id ? 'update' : 'create', entity: 'clients', entityId: id || null, summary: `${id ? 'Mengubah' : 'Menambah'} klien ${values.companyName}` });
  } else if(module==='contracts') {
   const unitId=required(form,'unitId'),startDate=validDate(form,'startDate'),endDate=validDate(form,'endDate');
   if(endDate<startDate)throw new FieldError({endDate:'Tanggal selesai harus setelah tanggal mulai.'});
   const contractNumber=text(form,'contractNumber')||documentNumber('KTR');
   await db.transaction(async tx=>{
    const [unit]=await tx.select().from(s.fleet).where(eq(s.fleet.id,unitId)).for('update');
    if(!unit||unit.status!=='available')throw new FieldError({unitId:'Unit tidak tersedia. Pilih unit lain.'});
    await tx.insert(s.contracts).values({contractNumber,clientId:required(form,'clientId'),unitId,startDate,endDate,ratePerHour:String(number(form,'ratePerHour',1)),status:'active'});
    await tx.update(s.fleet).set({status:'renting'}).where(eq(s.fleet.id,unitId));
   });
   await logAudit({ ...actor, action: 'create', entity: 'contracts', summary: `Membuat kontrak ${contractNumber}` });
  } else if(module==='timesheets') {
   const contractId=required(form,'contractId');
   const [contract]=await db.select().from(s.contracts).where(eq(s.contracts.id,contractId));
   if(!contract||contract.status!=='active')throw new FieldError({contractId:'Kontrak tidak aktif.'});
   const date=validDate(form,'date'),startHm=number(form,'startHm'),endHm=number(form,'endHm'),breakdownHours=number(form,'breakdownHours');
   if(date>todayISO()||date<contract.startDate||date>contract.endDate)throw new FieldError({date:'Tanggal harus dalam periode kontrak dan tidak boleh di masa depan.'});
   if(endHm<startHm||endHm-startHm>24||breakdownHours>endHm-startHm)throw new FieldError({endHm:'Periksa HM akhir dan durasi kerusakan. Maksimal 24 jam.'});
   await db.insert(s.timesheets).values({contractId,unitId:contract.unitId,operatorId:user.id,date,startHm:String(startHm),endHm:String(endHm),breakdownHours:String(breakdownHours),notes:text(form,'notes'),status:'pending'});
   await logAudit({ ...actor, action: 'create', entity: 'timesheets', summary: `Mencatat jam kerja ${date} untuk ${contract.contractNumber}` });
  } else if(module==='bast') {
   const type=required(form,'type');if(!['mobilization','demobilization'].includes(type))throw new FieldError({type:'Jenis serah terima tidak valid.'});
   const check=(k:string)=>form.get(k)==='on';
   let photoUrls: string[] = [];
   const rawPhotos = text(form,'photoUrls');
   if (rawPhotos) {
    try {
      const parsed: unknown = JSON.parse(rawPhotos);
      if (!Array.isArray(parsed) || parsed.length > 6 || !parsed.every(p => typeof p === 'string' && p.length <= 300)) throw new Error();
      photoUrls = parsed as string[];
    } catch { throw new FieldError({ photos: 'Lampiran foto tidak valid. Unggah ulang foto.' }); }
   }
   const docNo = documentNumber('BAST');
   await db.insert(s.handovers).values({documentNumber:docNo,contractId:required(form,'contractId'),type,date:validDate(form,'date'),engine:check('engine'),hydraulics:check('hydraulics'),tracks:check('tracks'),oil:check('oil'),fuel:check('fuel'),battery:check('battery'),lights:check('lights'),brakes:check('brakes'),bucket:check('bucket'),cabin:check('cabin'),safety:check('safety'),documents:check('documents'),notes:text(form,'notes'),photoUrls});
   await logAudit({ ...actor, action: 'create', entity: 'bast', summary: `Membuat BAST ${docNo}${photoUrls.length ? ` (${photoUrls.length} foto)` : ''}` });
  } else if(module==='invoices') {
   const contractId=required(form,'contractId');
   const dueDate=validDate(form,'dueDate');if(dueDate<todayISO())throw new FieldError({dueDate:'Jatuh tempo tidak boleh sebelum tanggal penerbitan.'});
   const ppnRate = await currentPpnRate();
   let invoiceNo = '';
   await db.transaction(async tx=>{
    const [contract]=await tx.select().from(s.contracts).where(eq(s.contracts.id,contractId)).for('update');
    if(!contract)throw new Error('Kontrak tidak ditemukan.');
    const logs=await tx.select().from(s.timesheets).where(and(eq(s.timesheets.contractId,contractId),eq(s.timesheets.status,'approved'),isNull(s.timesheets.invoiceId))).for('update');
    if(!logs.length)throw new FieldError({contractId:'Tidak ada jam kerja disetujui yang belum ditagihkan.'});
    const hours=logs.reduce((a,l)=>a+Number(l.effectiveHours),0);
    const totals=calcInvoiceTotals(hours,Number(contract.ratePerHour),ppnRate);
    if(totals.subtotal<=0)throw new Error('Total jam efektif harus lebih dari nol.');
    invoiceNo = documentNumber('INV');
    const [invoice]=await tx.insert(s.invoices).values({invoiceNumber:invoiceNo,contractId,subtotalAmount:totals.subtotal.toFixed(2),totalAmount:totals.total.toFixed(2),taxAmount:totals.tax.toFixed(2),taxRate:String(ppnRate),status:'unpaid',issueDate:todayISO(),dueDate}).returning();
    for(const log of logs)await tx.update(s.timesheets).set({invoiceId:invoice.id}).where(eq(s.timesheets.id,log.id));
   });
   await logAudit({ ...actor, action: 'create', entity: 'invoices', summary: `Menerbitkan ${invoiceNo} (PPN ${ppnRate}%)` });
  } else if(module==='settings') {
   const ppnRate = number(form,'ppnRate',0);
   if (ppnRate > 100) throw new FieldError({ ppnRate: 'Tarif PPN maksimal 100%.' });
   const expiryWarningDays = number(form,'expiryWarningDays',1);
   if (!Number.isInteger(expiryWarningDays) || expiryWarningDays > 180) throw new FieldError({ expiryWarningDays: 'Ambang 1–180 hari.' });
   const values={companyName:required(form,'companyName'),address:required(form,'address'),email:required(form,'email'),phone:required(form,'phone'),signerName:text(form,'signerName'),signerTitle:text(form,'signerTitle'),ppnRate:String(ppnRate),expiryWarningDays};
   await db.insert(s.companySettings).values({id:'main',...values}).onConflictDoUpdate({target:s.companySettings.id,set:values});
   await logAudit({ ...actor, action: 'update', entity: 'settings', entityId: 'main', summary: `Memperbarui profil perusahaan (PPN ${ppnRate}%)` });
  } else throw new Error('Modul tidak ditemukan.');
  revalidatePath('/dashboard','layout');return {success:true,message:module==='invoices'?'Tagihan berhasil dibuat dari jam kerja yang disetujui.':'Data berhasil disimpan.'};
 }catch(error){return fail(error, uniqueField, module);}
}

export async function bulkCreateFleet(form:FormData): Promise<ActionResult> {
 try{
  const user = await requireUser(operationRoles);
  const prefix=text(form,'prefix').toUpperCase();
  if(!/^[A-Z0-9-]{2,10}$/.test(prefix))throw new FieldError({prefix:'Prefix 2-10 karakter (A-Z/0-9/-).'});
  const start=Number(text(form,'startNumber'));const count=Number(text(form,'count'));
  if(!Number.isInteger(start)||start<1||start>9999)throw new FieldError({startNumber:'Nomor awal harus 1-9999.'});
  if(!Number.isInteger(count)||count<1||count>50)throw new FieldError({count:'Jumlah unit harus 1-50.'});
  const brandModel=required(form,'brandModel');
  const catRaw=required(form,'category');
  const category=(catRaw==='__new'?text(form,'categoryNew'):catRaw).trim().slice(0,50);
  if(!category)throw new FieldError({categoryNew:'Kategori baru wajib diisi.'});
  const year=number(form,'year',1900);
  if(year>new Date().getFullYear()+1)throw new FieldError({year:'Tahun unit tidak valid.'});
  const hourlyRate=number(form,'hourlyRate',1);
  const status=text(form,'status')||'available';
  if(!['available','maintenance','in_transit'].includes(status))throw new FieldError({status:'Status awal tidak valid.'});
  const currentLocation=text(form,'currentLocation');
  const siko=text(form,'sikoExpiry');const ins=text(form,'insuranceExpiry');
  if(siko&&!/^\d{4}-\d{2}-\d{2}$/.test(siko))throw new FieldError({sikoExpiry:'Tanggal SIKO tidak valid.'});
  if(ins&&!/^\d{4}-\d{2}-\d{2}$/.test(ins))throw new FieldError({insuranceExpiry:'Tanggal asuransi tidak valid.'});
  const codes=Array.from({length:count},(_,i)=>`${prefix}-${String(start+i).padStart(3,'0')}`);
  const existing=await db.select({unitCode:s.fleet.unitCode}).from(s.fleet).where(inArray(s.fleet.unitCode,codes));
  const taken=new Set(existing.map(e=>e.unitCode));
  const fresh=codes.filter(c=>!taken.has(c));
  if(!fresh.length)throw new FieldError({startNumber:'Seluruh kode sudah terdaftar. Ubah prefix atau nomor awal.'});
  await db.transaction(async tx=>{
   await tx.insert(s.fleet).values(fresh.map(unitCode=>({unitCode,category,brandModel,year,status,currentLocation:currentLocation||null,hourlyRate:String(hourlyRate),sikoExpiry:siko||null,insuranceExpiry:ins||null})));
  });
  await logAudit({ actorId: user.id, actorName: user.fullName, action: 'create', entity: 'fleet', summary: `Menambah ${fresh.length} unit (${fresh[0]} s.d. ${fresh[fresh.length-1]})` });
  revalidatePath('/dashboard','layout');
  return {success:true,message:`${fresh.length} unit dibuat (${fresh[0]} s.d. ${fresh[fresh.length-1]}).${taken.size?` ${taken.size} dilewati (sudah ada).`:''}`};
 }catch(e){return fail(e);}
}

export async function changeStatus(module:string,id:string,status:string): Promise<ActionResult> {
 try {
  const user = await requireUser(module==='invoices'?['admin','finance']:operationRoles);
  const actor = { actorId: user.id, actorName: user.fullName };
  if(module==='timesheets'&&['approved','rejected'].includes(status)){
   const updated=await db.update(s.timesheets).set({status}).where(and(eq(s.timesheets.id,id),eq(s.timesheets.status,'pending'),isNull(s.timesheets.invoiceId))).returning();
   if(!updated.length)throw new Error('Catatan ini sudah diproses.');
   await logAudit({ ...actor, action: status==='approved'?'approve':'reject', entity: 'timesheets', entityId: id, summary: `${status==='approved'?'Menyetujui':'Menolak'} catatan kerja ${updated[0].date}` });
  }else if(module==='invoices'&&status==='paid'){
   // Ledger tetap konsisten: pelunasan manual ikut tercatat sebagai baris pembayaran.
   await db.transaction(async tx=>{
    const [invoice]=await tx.select().from(s.invoices).where(eq(s.invoices.id,id)).for('update');
    if(!invoice)throw new Error('Tagihan tidak ditemukan.');
    if(invoice.status==='paid')throw new Error('Tagihan sudah lunas.');
    const paid=await tx.select({amount:s.payments.amount}).from(s.payments).where(eq(s.payments.invoiceId,id));
    const remaining=remainingBalance(invoice.totalAmount,paid.reduce((a,p)=>a+Number(p.amount),0));
    if(remaining>0)await tx.insert(s.payments).values({invoiceId:id,amount:remaining.toFixed(2),method:'other',reference:'Pelunasan manual',paidAt:todayISO(),notedBy:user.id});
    await tx.update(s.invoices).set({status}).where(eq(s.invoices.id,id));
   });
   await logAudit({ ...actor, action: 'pay', entity: 'invoices', entityId: id, summary: 'Menandai tagihan sebagai lunas' });
  }
  else if(module==='contracts'&&status==='completed')await db.transaction(async tx=>{const [c]=await tx.select().from(s.contracts).where(eq(s.contracts.id,id)).for('update');if(!c||c.status!=='active')throw new Error('Kontrak tidak aktif.');await tx.update(s.contracts).set({status}).where(eq(s.contracts.id,id));await tx.update(s.fleet).set({status:'available'}).where(eq(s.fleet.id,c.unitId));}).then(async ()=>{
   await logAudit({ ...actor, action: 'complete', entity: 'contracts', entityId: id, summary: 'Menyelesaikan kontrak; unit kembali tersedia' });
  });
  else throw new Error('Tindakan tidak diizinkan.');
  revalidatePath('/dashboard','layout');return {success:true,message:'Status berhasil diperbarui.'};
 }catch(e){const r=fail(e);return {success:r.success,message:r.message};}
}

export async function recordPayment(form:FormData): Promise<ActionResult> {
 try {
  const user = await requireUser(['admin','finance']);
  const invoiceId=required(form,'invoiceId');
  const amount=number(form,'amount',0.01);
  const method=required(form,'method');
  if(!['transfer','cash','giro','other'].includes(method))throw new FieldError({method:'Metode pembayaran tidak valid.'});
  const paidAt=validDate(form,'paidAt');
  if(paidAt>todayISO())throw new FieldError({paidAt:'Tanggal bayar tidak boleh di masa depan.'});
  const reference=text(form,'reference').slice(0,100);
  const notes=text(form,'notes').slice(0,500);
  let invoiceNo = '';let recorded = 0;let wasNormalized = false;
  await db.transaction(async tx=>{
   const [invoice]=await tx.select().from(s.invoices).where(eq(s.invoices.id,invoiceId)).for('update');
   if(!invoice)throw new Error('Tagihan tidak ditemukan.');
   if(invoice.status==='paid')throw new Error('Tagihan sudah lunas.');
   invoiceNo = invoice.invoiceNumber;
   const paid=await tx.select({amount:s.payments.amount}).from(s.payments).where(eq(s.payments.invoiceId,invoiceId));
   const paidSoFar=paid.reduce((a,p)=>a+Number(p.amount),0);
   const remaining=remainingBalance(invoice.totalAmount,paidSoFar);
   const norm=normalizePaymentAmount(amount,remaining);
   if(norm.rejected)throw new FieldError({amount:`Melebihi sisa tagihan (${money(remaining)}).`});
   recorded=norm.recorded;wasNormalized=norm.normalized;
   await tx.insert(s.payments).values({invoiceId,amount:recorded.toFixed(2),method,reference:reference||null,notes:notes||null,paidAt,notedBy:user.id});
   await tx.update(s.invoices).set({status:resolveInvoiceStatus(invoice.totalAmount,paidSoFar+recorded,invoice.dueDate,todayISO())}).where(eq(s.invoices.id,invoiceId));
  });
  const suffix=wasNormalized?' (disesuaikan ke sisa tagihan)':'';
  await logAudit({ actorId: user.id, actorName: user.fullName, action: 'pay', entity: 'invoices', entityId: invoiceId, summary: `Mencatat pembayaran ${money(recorded)} untuk ${invoiceNo}${suffix}` });
  revalidatePath('/dashboard','layout');return {success:true,message:`Pembayaran ${money(recorded)} tercatat${suffix}.`};
 }catch(e){return fail(e);}
}

export async function reviseContract(form:FormData): Promise<ActionResult> {
 try{
  const user=await requireUser(operationRoles);
  const id=text(form,'id');if(!id)throw new FieldError({id:'Kontrak tidak ditemukan.'});
  const startDate=validDate(form,'startDate'),endDate=validDate(form,'endDate');
  if(endDate<startDate)throw new FieldError({endDate:'Tanggal selesai harus setelah tanggal mulai.'});
  const ratePerHour=number(form,'ratePerHour',1);
  const unitId=text(form,'unitId');if(!unitId)throw new FieldError({unitId:'Unit wajib dipilih.'});
  const reason=text(form,'reason');if(reason.length<10)throw new FieldError({reason:'Alasan revisi minimal 10 karakter.'});
  let revNo = 0; let contractNo = '';
  await db.transaction(async tx=>{
   const [contract]=await tx.select().from(s.contracts).where(eq(s.contracts.id,id)).for('update');
   if(!contract||contract.status!=='active')throw new Error('Hanya kontrak aktif yang dapat direvisi.');
   contractNo = contract.contractNumber;
   const outOfRange=await tx.select({id:s.timesheets.id}).from(s.timesheets).where(and(eq(s.timesheets.contractId,id),sql`${s.timesheets.date} < ${startDate} OR ${s.timesheets.date} > ${endDate}`)).limit(1);
   if(outOfRange.length)throw new FieldError({startDate:'Periode baru memotong tanggal timesheet tercatat.'});
   if(unitId!==contract.unitId){
    const billed=await tx.select({id:s.timesheets.id}).from(s.timesheets).where(and(eq(s.timesheets.contractId,id),eq(s.timesheets.unitId,contract.unitId))).limit(1);
    if(billed.length)throw new FieldError({unitId:'Unit tidak dapat diganti karena timesheet sudah tercatat.'});
    const [next]=await tx.select().from(s.fleet).where(eq(s.fleet.id,unitId)).for('update');
    if(!next||next.status!=='available')throw new FieldError({unitId:'Unit pengganti tidak tersedia.'});
    await tx.update(s.fleet).set({status:'available'}).where(eq(s.fleet.id,contract.unitId));
    await tx.update(s.fleet).set({status:'renting'}).where(eq(s.fleet.id,unitId));
   }
   const prior=await tx.select({revisionNumber:s.contractRevisions.revisionNumber}).from(s.contractRevisions).where(eq(s.contractRevisions.contractId,id)).orderBy(sql`${s.contractRevisions.revisionNumber} desc`).limit(1);
   const revisionNumber=(prior[0]?.revisionNumber||0)+1;
   revNo = revisionNumber;
   await tx.insert(s.contractRevisions).values({contractId:id,revisionNumber,reason,changedBy:user.id,prevStartDate:contract.startDate,newStartDate:startDate,prevEndDate:contract.endDate,newEndDate:endDate,prevRate:contract.ratePerHour,newRate:String(ratePerHour),prevUnitId:contract.unitId,newUnitId:unitId});
   await tx.update(s.contracts).set({startDate,endDate,ratePerHour:String(ratePerHour),unitId}).where(eq(s.contracts.id,id));
   if(unitId!==contract.unitId)await tx.update(s.timesheets).set({unitId}).where(and(eq(s.timesheets.contractId,id),isNull(s.timesheets.invoiceId)));
  });
  await logAudit({ actorId: user.id, actorName: user.fullName, action: 'revise', entity: 'contracts', entityId: id, summary: `Revisi ${contractNo} (amandemen #${revNo}): ${reason.slice(0,120)}` });
  revalidatePath('/dashboard','layout');return {success:true,message:'Revisi kontrak tersimpan sebagai amandemen baru. Tarif baru hanya berlaku untuk jam yang belum ditagihkan.'};
 }catch(e){return fail(e);}
}

export async function deleteClient(id:string): Promise<ActionResult> {
 try{
  const user=await requireUser(operationRoles);
  const [client]=await db.select({companyName:s.clients.companyName}).from(s.clients).where(eq(s.clients.id,id));
  await db.delete(s.clients).where(eq(s.clients.id,id));
  await logAudit({ actorId: user.id, actorName: user.fullName, action: 'delete', entity: 'clients', entityId: id, summary: `Menghapus klien ${client?.companyName || id}` });
  revalidatePath('/dashboard','layout');return {success:true,message:'Data klien berhasil dihapus.'};
 }
 catch{return {success:false,message:'Klien tidak dapat dihapus karena masih memiliki kontrak atau akses tidak diizinkan.'};}
}

export async function updateUserRole(form:FormData): Promise<ActionResult> {
 try {
  const user = await requireUser(['admin']);
  const id = required(form,'id');
  const role = required(form,'role');
  if (!['admin','operations','operator','finance'].includes(role)) throw new FieldError({ role: 'Peran tidak valid.' });
  if (id === user.id && role !== 'admin') throw new FieldError({ role: 'Anda tidak dapat mencabut peran admin diri sendiri.' });
  const admins = await db.select({ id: s.profiles.id }).from(s.profiles).where(eq(s.profiles.role,'admin')).limit(2);
  const [current] = await db.select().from(s.profiles).where(eq(s.profiles.id,id));
  if (!current) throw new Error('Pengguna tidak ditemukan.');
  if (current.role === 'admin' && role !== 'admin' && admins.length < 2) throw new FieldError({ role: 'Minimal harus ada satu administrator.' });
  await db.update(s.profiles).set({ role }).where(eq(s.profiles.id,id));
  await logAudit({ actorId: user.id, actorName: user.fullName, action: 'role', entity: 'profiles', entityId: id, summary: `Mengubah peran ${current.fullName} menjadi ${role}`, before: { role: current.role }, after: { role } });
  revalidatePath('/dashboard','layout');return {success:true,message:`Peran ${current.fullName} diubah.`};
 }catch(e){return fail(e);}
}

export async function inviteUser(form:FormData): Promise<ActionResult> {
 try {
  const user = await requireUser(['admin']);
  const fullName = required(form,'fullName');
  const email = required(form,'email');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new FieldError({ email: 'Alamat surel tidak valid.' });
  const role = required(form,'role');
  if (!['admin','operations','operator','finance'].includes(role)) throw new FieldError({ role: 'Peran tidak valid.' });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('Undangan email membutuhkan SUPABASE_SERVICE_ROLE_KEY di server. Sementara gunakan template supabase/templates/provision_user.sql.');
  const admin = createServiceClient(url, serviceKey).auth.admin;
  const { error } = await admin.inviteUserByEmail(email, {
    data: { full_name: fullName, role },
    redirectTo: `${appUrl()}/auth/callback?next=/dashboard`,
  });
  if (error) throw new Error('Undangan gagal dikirim. Pastikan surel valid dan layanan email Supabase aktif.');
  await logAudit({ actorId: user.id, actorName: user.fullName, action: 'invite', entity: 'profiles', summary: `Mengundang ${fullName} (${email}) sebagai ${role}` });
  return { success: true, message: `Undangan terkirim ke ${email}. Profil dibuat otomatis saat undangan diterima.` };
 }catch(e){return fail(e);}
}

export async function updateUserProfile(form:FormData): Promise<ActionResult> {
 try {
  const user = await requireUser(['admin']);
  const id = required(form,'id');
  const fullName = required(form,'fullName');
  if (fullName.length < 2 || fullName.length > 100) throw new FieldError({ fullName: 'Nama lengkap 2–100 karakter.' });
  const [current] = await db.select().from(s.profiles).where(eq(s.profiles.id,id));
  if (!current) throw new Error('Pengguna tidak ditemukan.');
  await db.update(s.profiles).set({ fullName }).where(eq(s.profiles.id,id));
  await logAudit({ actorId: user.id, actorName: user.fullName, action: 'update', entity: 'profiles', entityId: id, summary: `Mengubah nama ${current.fullName} menjadi ${fullName}`, before: { fullName: current.fullName }, after: { fullName } });
  revalidatePath('/dashboard','layout');return {success:true,message:`Profil ${fullName} diperbarui.`};
 }catch(e){return fail(e);}
}

export async function setUserBanned(form:FormData): Promise<ActionResult> {
 try {
  const user = await requireUser(['admin']);
  const id = required(form,'id');
  const banned = required(form,'banned') === '1';
  if (id === user.id) throw new Error('Anda tidak dapat menonaktifkan akun sendiri.');
  const [current] = await db.select().from(s.profiles).where(eq(s.profiles.id,id));
  if (!current) throw new Error('Pengguna tidak ditemukan.');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('Kelola status akun membutuhkan SUPABASE_SERVICE_ROLE_KEY di server. Sementara gunakan SQL ban di supabase/templates/provision_user.sql.');
  const admin = createServiceClient(url, serviceKey).auth.admin;
  if (banned && current.role === 'admin') {
    const { data } = await admin.listUsers({ page: 1, perPage: 100 });
    const activeIds = new Set((data?.users || []).filter(u => !u.banned_until).map(u => u.id));
    const admins = await db.select({ id: s.profiles.id }).from(s.profiles).where(eq(s.profiles.role,'admin'));
    if (!admins.some(a => a.id !== id && activeIds.has(a.id))) throw new Error('Tidak dapat menonaktifkan satu-satunya administrator aktif.');
  }
  const { error } = await admin.updateUserById(id, { ban_duration: banned ? '876000h' : 'none' });
  if (error) throw new Error(banned ? 'Gagal menonaktifkan akun.' : 'Gagal mengaktifkan akun.');
  await logAudit({ actorId: user.id, actorName: user.fullName, action: 'ban', entity: 'profiles', entityId: id, summary: banned ? `Menonaktifkan akun ${current.fullName}` : `Mengaktifkan kembali akun ${current.fullName}`, before: { banned: !banned }, after: { banned } });
  revalidatePath('/dashboard','layout');return {success:true,message:banned?`Akun ${current.fullName} dinonaktifkan.`:`Akun ${current.fullName} diaktifkan kembali.`};
 }catch(e){return fail(e);}
}

export async function requestPasswordReset(form:FormData): Promise<ActionResult> {
 if (!isConfigured()) return { success: false, message: 'Reset sandi belum tersedia di mode pratinjau. Hubungkan Supabase Auth terlebih dahulu.' };
 const email = String(form.get('email') || '').trim();
 if (!email) return { success: false, message: 'Isi alamat surel Anda.', fieldErrors: { email: 'Surel wajib diisi.' } };
 const anon = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!).auth;
 const { error } = await anon.resetPasswordForEmail(email, { redirectTo: `${appUrl()}/auth/callback?next=/reset-password` });
 if (error) return { success: false, message: 'Tautan reset tidak dapat dikirim. Pastikan surel terdaftar.' };
 return { success: true, message: 'Tautan reset terkirim. Periksa kotak masuk surel Anda.' };
}

export async function resetDatabase(confirmation:string): Promise<ActionResult> {
 try{
  const user = await requireUser(['admin']);
  if(confirmation!=='HAPUS SEMUA DATA')throw new Error('Frasa konfirmasi tidak sesuai. Ketik HAPUS SEMUA DATA untuk melanjutkan.');
  if(isPreview())throw new Error('Reset nonaktif pada mode pratinjau. Hubungkan DATABASE_URL Supabase terlebih dahulu.');
  await db.transaction(async tx=>{
   await tx.delete(s.payments);
   await tx.delete(s.contractRevisions);
   await tx.delete(s.timesheets);
   await tx.delete(s.handovers);
   await tx.delete(s.invoices);
   await tx.delete(s.contracts);
   await tx.delete(s.clients);
   await tx.delete(s.fleet);
  });
  await logAudit({ actorId: user.id, actorName: user.fullName, action: 'reset', entity: 'database', summary: 'Mereset seluruh data operasional' });
  revalidatePath('/dashboard','layout');return {success:true,message:'Seluruh data operasional dihapus. Akun pengguna dan profil perusahaan dipertahankan.'};
 }catch(e){const r=fail(e);return {success:r.success,message:r.message};}
}

export async function signIn(form:FormData) {
 if(!isConfigured())return {success:false,message:'Autentikasi Supabase belum dikonfigurasi. Hubungi administrator.'};
 const email=text(form,'email');
 const auth=await createAuthClient();const {data,error}=await auth.auth.signInWithPassword({email,password:text(form,'password')});
 if(error)return {success:false,message:/banned/i.test(error.message||'')?'Akun Anda dinonaktifkan. Hubungi administrator.':'Surel atau kata sandi tidak sesuai.'};
 // Auth sukses bersifat final: audit best-effort, tak pernah throw (Finding 3).
 const actorName=await getProfileNameBestEffort(data.user.id,data.user.email||email||'Pengguna');
 await logAudit({actorId:data.user.id,actorName,action:'login',entity:'profiles',entityId:data.user.id,summary:`Masuk: ${data.user.email||email||'pengguna'}`});
 redirect('/dashboard');
}
export async function signOut(){if(isConfigured()){const auth=await createAuthClient();try{const {data:{user}}=await auth.auth.getUser();if(user){const [profile]=await db.select().from(s.profiles).where(eq(s.profiles.id,user.id));await logAudit({actorId:user.id,actorName:profile?.fullName||user.email||'Pengguna',action:'logout',entity:'profiles',entityId:user.id,summary:`Keluar: ${user.email||'pengguna'}`});}}catch{/* audit logout best-effort */}await auth.auth.signOut();}redirect('/login');}
