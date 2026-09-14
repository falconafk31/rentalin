'use server';
import { db } from '@/db';
import * as s from '@/db/schema';
import { and, eq, inArray, isNull, or, sql, desc, ne } from 'drizzle-orm';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireUser, createAuthClient, isConfigured, isPreview } from '@/lib/auth';
import { logAudit, getProfileNameBestEffort } from '@/lib/audit';
import { isMediaConfigured, MediaApiError, requestMediaUploadUrl, completeMediaUpload, deleteMediaObject, getMediaSignedUrl, type MediaUploadTicket } from '@/lib/media';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { todayISO, money, resolveTz, type AppTimezone } from '@/lib/format';
import { calcInvoiceTotals, calcOperatorCost, calcInvoiceTotalsWithOperator, remainingBalance, resolveInvoiceStatus, normalizePaymentAmount } from '@/lib/finance';
import { nextDocNumber } from '@/lib/docnum';

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
  ppnRate:'Tarif PPN', expiryWarningDays:'Ambang peringatan', city:'Kota penandatanganan', timezone:'Zona waktu', reason:'Alasan revisi', amount:'Nominal pembayaran',
  method:'Metode pembayaran', reference:'Referensi', paidAt:'Tanggal bayar', prefix:'Prefix kode', startNumber:'Nomor awal',
  count:'Jumlah unit', fullName:'Nama lengkap', role:'Peran', invoiceId:'Tagihan', id:'Data',
  employeeNo:'No. pegawai', ktpNo:'No. KTP', sioClass:'Kelas SIO', sioNumber:'Nomor SIO', sioExpiry:'Masa berlaku SIO',
  licenseClass:'Kelas SIM', licenseExpiry:'Masa berlaku SIM', ratePerDay:'Tarif per hari',
  defaultRateType:'Mode tarif default', includeOperator:'Sertakan operator', operatorDriverId:'Operator pengemudi',
};
const label = (k:string) => fieldLabel[k] || k;
const required = (f:FormData,k:string) => {const v=text(f,k);if(!v)throw new FieldError({[k]:`${label(k)} wajib diisi.`});return v;};
const number = (f:FormData,k:string,min=0) => {const n=Number(required(f,k));if(!Number.isFinite(n)||n<min)throw new FieldError({[k]:`${label(k)} tidak valid.`});return n;};
const validDate = (f:FormData,k:string) => {const v=required(f,k);if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||isNaN(Date.parse(v)))throw new FieldError({[k]:`${label(k)} tidak valid.`});return v;};
const appUrl = () => process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

async function currentPpnRate(): Promise<number> {
  const [row] = await db.select({ ppnRate: s.companySettings.ppnRate }).from(s.companySettings).limit(1);
  const rate = Number(row?.ppnRate ?? 11);
  return Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : 11;
}

// Zona waktu kalender perusahaan (WIB/WITA/WIT, default WIB) — dipakai untuk
// seluruh tanggal bisnis: "hari ini" validasi form, tanggal terbit, pelunasan.
async function companyTz(): Promise<AppTimezone> {
  const [row] = await db.select({ timezone: s.companySettings.timezone }).from(s.companySettings).limit(1);
  return resolveTz(row?.timezone);
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
  const tz = await companyTz();
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
   } else if(module==='operators') {
    const fullName=required(form,'fullName');
    const rateHour=number(form,'ratePerHour');
    const rateDay=number(form,'ratePerDay');
    if(rateHour<=0&&rateDay<=0)throw new FieldError({ratePerHour:'Isi minimal salah satu tarif (per jam atau per hari).'});
    const rateType=text(form,'defaultRateType')||'hourly';
    if(!['hourly','daily'].includes(rateType))throw new FieldError({defaultRateType:'Mode tarif tidak valid.'});
    if(rateType==='hourly'&&rateHour<=0)throw new FieldError({ratePerHour:'Tarif per jam wajib > 0 bila mode tarif per jam.'});
    if(rateType==='daily'&&rateDay<=0)throw new FieldError({ratePerDay:'Tarif per hari wajib > 0 bila mode tarif per hari.'});
    const ktp=text(form,'ktpNo');
    if(ktp&&!/^[0-9]{16}$/.test(ktp.replace(/[\s-]/g,'')))throw new FieldError({ktpNo:'No. KTP harus 16 digit angka.'});
    const values={fullName,employeeNo:text(form,'employeeNo')||null,ktpNo:ktp||null,phone:text(form,'phone')||null,
      sioClass:text(form,'sioClass')||null,sioNumber:text(form,'sioNumber')||null,sioExpiry:text(form,'sioExpiry')||null,
      licenseClass:text(form,'licenseClass')||null,licenseExpiry:text(form,'licenseExpiry')||null,
      ratePerHour:String(rateHour),ratePerDay:String(rateDay),defaultRateType:rateType,
      status:text(form,'status')||'active',notes:text(form,'notes')||null};
    if(!['active','inactive'].includes(values.status))throw new FieldError({status:'Status operator tidak valid.'});
    if(id){
      await db.update(s.operators).set(values).where(eq(s.operators.id,id));
    } else {
      await db.insert(s.operators).values(values);
    }
    await logAudit({ ...actor, action: id ? 'update' : 'create', entity: 'operators', entityId: id || null, summary: `${id ? 'Mengubah' : 'Menambah'} operator ${values.fullName}` });
  } else if(module==='clients') {
   const email=text(form,'picEmail');if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new FieldError({picEmail:'Alamat surel tidak valid.'});
   const values={companyName:required(form,'companyName'),picName:required(form,'picName'),npwp:text(form,'npwp'),picKtp:text(form,'picKtp'),address:text(form,'address'),picPhone:text(form,'picPhone'),picEmail:email};
   if(id)await db.update(s.clients).set(values).where(eq(s.clients.id,id));else await db.insert(s.clients).values(values);
   await logAudit({ ...actor, action: id ? 'update' : 'create', entity: 'clients', entityId: id || null, summary: `${id ? 'Mengubah' : 'Menambah'} klien ${values.companyName}` });
  } else if(module==='contracts') {
   const unitId=required(form,'unitId'),startDate=validDate(form,'startDate'),endDate=validDate(form,'endDate');
   if(endDate<startDate)throw new FieldError({endDate:'Tanggal selesai harus setelah tanggal mulai.'});
   const includeOperator=form.get('includeOperator')==='on'||form.get('includeOperator')==='true';
   const operatorIdsRaw=form.getAll('operatorIds').flatMap(v=>String(v).split(',')).map(v=>v.trim()).filter(v=>UUID_RE.test(v));
   let operatorRate: string|null=null, operatorRateType: string|null=null;
   if(includeOperator){
    if(!operatorIdsRaw.length)throw new FieldError({operatorId:'Pilih minimal satu operator untuk kontrak include operator.'});
    operatorRateType=text(form,'operatorRateType')||'hourly';
    if(!['hourly','daily'].includes(operatorRateType))throw new FieldError({operatorRateType:'Mode tarif operator tidak valid.'});
    operatorRate=String(number(form,'operatorRate',1));
   }
   let contractNumber=text(form,'contractNumber');
   const docYear=todayISO(tz).slice(0,4);
   await db.transaction(async tx=>{
    const [unit]=await tx.select().from(s.fleet).where(eq(s.fleet.id,unitId)).for('update');
    if(!unit||unit.status!=='available')throw new FieldError({unitId:'Unit tidak tersedia. Pilih unit lain.'});
    if(!contractNumber)contractNumber=await nextDocNumber(tx,'KTR',s.contracts.contractNumber,s.contracts,docYear);
    const [contract]=await tx.insert(s.contracts).values({contractNumber,clientId:required(form,'clientId'),unitId,startDate,endDate,ratePerHour:String(number(form,'ratePerHour',1)),status:'active',includeOperator,operatorRate,operatorRateType}).returning({id:s.contracts.id});
    await tx.update(s.fleet).set({status:'renting'}).where(eq(s.fleet.id,unitId));
     if(includeOperator&&contract){
      const [dupOp]=await tx.select({id:s.operators.id}).from(s.operators).where(and(inArray(s.operators.id,operatorIdsRaw),ne(s.operators.status,'active')));
      if(dupOp)throw new FieldError({operatorId:'Ada operator yang tidak aktif. Pilih operator aktif.'});
      await tx.insert(s.contractOperators).values(operatorIdsRaw.map(oid=>({contractId:contract.id,operatorId:oid})));
     }
   });
   await logAudit({ ...actor, action: 'create', entity: 'contracts', summary: `Membuat kontrak ${contractNumber}` });
  } else if(module==='timesheets') {
   const contractId=required(form,'contractId');
   const [contract]=await db.select().from(s.contracts).where(eq(s.contracts.id,contractId));
   if(!contract||contract.status!=='active')throw new FieldError({contractId:'Kontrak tidak aktif.'});
   const date=validDate(form,'date'),startHm=number(form,'startHm'),endHm=number(form,'endHm'),breakdownHours=number(form,'breakdownHours');
   if(date>todayISO(tz)||date<contract.startDate||date>contract.endDate)throw new FieldError({date:'Tanggal harus dalam periode kontrak dan tidak boleh di masa depan.'});
   if(endHm<startHm||endHm-startHm>24||breakdownHours>endHm-startHm)throw new FieldError({endHm:'Periksa HM akhir dan durasi kerusakan. Maksimal 24 jam.'});
   const driverId=text(form,'operatorDriverId');if(driverId&&!UUID_RE.test(driverId))throw new FieldError({operatorDriverId:'Operator tidak valid.'});if(driverId){const [drv]=await db.select({id:s.operators.id,status:s.operators.status}).from(s.operators).where(eq(s.operators.id,driverId));if(!drv)throw new FieldError({operatorDriverId:'Operator tidak ditemukan.'});if(drv.status!=='active')throw new FieldError({operatorDriverId:'Operator tidak aktif.'});}await db.insert(s.timesheets).values({contractId,unitId:contract.unitId,operatorId:user.id,operatorDriverId:driverId||null,date,startHm:String(startHm),endHm:String(endHm),breakdownHours:String(breakdownHours),notes:text(form,'notes'),status:'pending'});
   await logAudit({ ...actor, action: 'create', entity: 'timesheets', summary: `Mencatat jam kerja ${date} untuk ${contract.contractNumber}` });
  } else if(module==='bast') {
   const type=required(form,'type');if(!['mobilization','demobilization'].includes(type))throw new FieldError({type:'Jenis serah terima tidak valid.'});
   const contractId=text(form,'contractId');if(!contractId)throw new FieldError({contractId:'Kontrak wajib dipilih.'});
   const [contract]=await db.select().from(s.contracts).where(eq(s.contracts.id,contractId));
   if(!contract||contract.status!=='active')throw new FieldError({contractId:'Kontrak tidak aktif.'});
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
   const values={date:validDate(form,'date'),engine:check('engine'),hydraulics:check('hydraulics'),tracks:check('tracks'),oil:check('oil'),fuel:check('fuel'),battery:check('battery'),lights:check('lights'),brakes:check('brakes'),bucket:check('bucket'),cabin:check('cabin'),safety:check('safety'),documents:check('documents'),notes:text(form,'notes'),photoUrls};
   if(id){
    const [existing]=await db.select({documentNumber:s.handovers.documentNumber}).from(s.handovers).where(eq(s.handovers.id,id));
    if(!existing)throw new Error('BAST tidak ditemukan.');
    await db.update(s.handovers).set(values).where(eq(s.handovers.id,id));
    await logAudit({ ...actor, action: 'update', entity: 'bast', entityId: id, summary: `Mengubah BAST ${existing.documentNumber}${photoUrls.length ? ` (${photoUrls.length} foto)` : ''}` });
   }else{
    // Satu jenis satu BAST per kontrak: tolak mobilisasi/demobilisasi ganda.
    const existing=await db.select({type:s.handovers.type}).from(s.handovers).where(eq(s.handovers.contractId,contractId));
    if(existing.some(h=>h.type===type))throw new FieldError({type:type==='mobilization'?'BAST mobilisasi kontrak ini sudah ada.':'BAST demobilisasi kontrak ini sudah ada.'});
    if(type==='demobilization'&&!existing.some(h=>h.type==='mobilization'))throw new FieldError({type:'Buat BAST mobilisasi terlebih dahulu sebelum demobilisasi.'});
    const docNo=await db.transaction(async tx=>{
     const no=await nextDocNumber(tx,'BAST',s.handovers.documentNumber,s.handovers,todayISO(tz).slice(0,4));
     await tx.insert(s.handovers).values({documentNumber:no,contractId,type,...values});
     return no;
    });
    await logAudit({ ...actor, action: 'create', entity: 'bast', summary: `Membuat BAST ${docNo}${photoUrls.length ? ` (${photoUrls.length} foto)` : ''}` });
   }
  } else if(module==='invoices') {
   const contractId=required(form,'contractId');
   const dueDate=validDate(form,'dueDate');if(dueDate<todayISO(tz))throw new FieldError({dueDate:'Jatuh tempo tidak boleh sebelum tanggal penerbitan.'});
   const ppnRate = await currentPpnRate();
   let invoiceNo = '';
   await db.transaction(async tx=>{
    const [contract]=await tx.select().from(s.contracts).where(eq(s.contracts.id,contractId)).for('update');
    if(!contract)throw new Error('Kontrak tidak ditemukan.');
    const logs=await tx.select().from(s.timesheets).where(and(eq(s.timesheets.contractId,contractId),eq(s.timesheets.status,'approved'),isNull(s.timesheets.invoiceId))).for('update');
    if(!logs.length)throw new FieldError({contractId:'Tidak ada jam kerja disetujui yang belum ditagihkan.'});
    const hours=logs.reduce((a,l)=>a+Number(l.effectiveHours),0);
    const operatorAmount=calcOperatorCost({includeOperator:!!contract.includeOperator,rateType:(contract.operatorRateType as 'hourly'|'daily'|null),rate:contract.operatorRate},logs.map(l=>({effectiveHours:l.effectiveHours??0,date:l.date})));
    const totals=calcInvoiceTotalsWithOperator(hours,Number(contract.ratePerHour),ppnRate,operatorAmount);
    if(totals.subtotal<=0)throw new Error('Total jam efektif harus lebih dari nol.');
    invoiceNo = await nextDocNumber(tx,'INV',s.invoices.invoiceNumber,s.invoices,todayISO(tz).slice(0,4));
    const [invoice]=await tx.insert(s.invoices).values({invoiceNumber:invoiceNo,contractId,subtotalAmount:totals.subtotal.toFixed(2),totalAmount:totals.total.toFixed(2),taxAmount:totals.tax.toFixed(2),taxRate:String(ppnRate),status:'unpaid',issueDate:todayISO(tz),dueDate,operatorAmount:operatorAmount.toFixed(2)}).returning();
    for(const log of logs)await tx.update(s.timesheets).set({invoiceId:invoice.id}).where(eq(s.timesheets.id,log.id));
   });
   await logAudit({ ...actor, action: 'create', entity: 'invoices', summary: `Menerbitkan ${invoiceNo} (PPN ${ppnRate}%)` });
  } else if(module==='settings') {
   const ppnRate = number(form,'ppnRate',0);
   if (ppnRate > 100) throw new FieldError({ ppnRate: 'Tarif PPN maksimal 100%.' });
   const expiryWarningDays = number(form,'expiryWarningDays',1);
   if (!Number.isInteger(expiryWarningDays) || expiryWarningDays > 180) throw new FieldError({ expiryWarningDays: 'Ambang 1–180 hari.' });
   const timezone = resolveTz(text(form,'timezone'));
   const city = (text(form,'city') || 'Jakarta').slice(0, 100);
   const values={companyName:required(form,'companyName'),address:required(form,'address'),email:required(form,'email'),phone:required(form,'phone'),signerName:text(form,'signerName'),signerTitle:text(form,'signerTitle'),npwp:text(form,'npwp'),signerKtp:text(form,'signerKtp'),bankName:text(form,'bankName'),bankAccountName:text(form,'bankAccountName'),bankAccountNumber:text(form,'bankAccountNumber'),ppnRate:String(ppnRate),expiryWarningDays,city,timezone};
   await db.insert(s.companySettings).values({id:'main',...values}).onConflictDoUpdate({target:s.companySettings.id,set:values});
   await logAudit({ ...actor, action: 'update', entity: 'settings', entityId: 'main', summary: `Memperbarui profil perusahaan (PPN ${ppnRate}%, ${timezone})` });
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
  const tz = await companyTz();
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
    if(remaining>0)await tx.insert(s.payments).values({invoiceId:id,amount:remaining.toFixed(2),method:'other',reference:'Pelunasan manual',paidAt:todayISO(tz),notedBy:user.id});
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
  const tz = await companyTz();
  const invoiceId=required(form,'invoiceId');
  const amount=number(form,'amount',0.01);
  const method=required(form,'method');
  if(!['transfer','cash','giro','other'].includes(method))throw new FieldError({method:'Metode pembayaran tidak valid.'});
  const paidAt=validDate(form,'paidAt');
  if(paidAt>todayISO(tz))throw new FieldError({paidAt:'Tanggal bayar tidak boleh di masa depan.'});
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
   await tx.update(s.invoices).set({status:resolveInvoiceStatus(invoice.totalAmount,paidSoFar+recorded,invoice.dueDate,todayISO(tz))}).where(eq(s.invoices.id,invoiceId));
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

export type FleetUnitHistory = {
  unit: { id: string; unitCode: string; brandModel: string; category: string; year: number | null; status: string; hourlyRate: string; currentLocation: string | null; sikoExpiry: string | null; insuranceExpiry: string | null };
  summary: { contractCount: number; completedCount: number; logCount: number; workDays: number; effectiveHours: number; breakdownHours: number; hmUsed: number | null; revenue: number | null; operatorCost: number | null };
  operators: { name: string; logs: number; hours: number; first: string | null; last: string | null }[];
  contracts: { id: string; contractNumber: string; clientName: string | null; startDate: string; endDate: string; status: string; includeOperator: boolean }[];
  recentLogs: { id: string; date: string; driver: string | null; startHm: string; endHm: string; effectiveHours: string; breakdownHours: string; status: string }[];
};

export async function getFleetUnitHistory(unitId: string): Promise<FleetUnitHistory | { error: 'unauthorized' | 'not_found' }> {
  const user = await requireUser();
  if (!UUID_RE.test(unitId)) return { error: 'not_found' };
  const [unit] = await db.select().from(s.fleet).where(eq(s.fleet.id, unitId));
  if (!unit) return { error: 'not_found' };
  const contractRows = await db.select({
    id: s.contracts.id, contractNumber: s.contracts.contractNumber, clientName: s.clients.companyName,
    startDate: s.contracts.startDate, endDate: s.contracts.endDate, status: s.contracts.status, includeOperator: s.contracts.includeOperator,
  }).from(s.contracts).leftJoin(s.clients, eq(s.clients.id, s.contracts.clientId))
    .where(eq(s.contracts.unitId, unitId)).orderBy(desc(s.contracts.startDate));
  const logRows = await db.select({
    date: s.timesheets.date, startHm: s.timesheets.startHm, endHm: s.timesheets.endHm,
    effectiveHours: s.timesheets.effectiveHours, breakdownHours: s.timesheets.breakdownHours,
    status: s.timesheets.status, driver: s.operators.fullName, driverProfile: s.profiles.fullName,
    contractId: s.timesheets.contractId,
  }).from(s.timesheets)
    .leftJoin(s.operators, eq(s.operators.id, s.timesheets.operatorDriverId))
    .leftJoin(s.profiles, eq(s.profiles.id, s.timesheets.operatorId))
    .where(eq(s.timesheets.unitId, unitId))
    .orderBy(desc(s.timesheets.date));
  const revenueRows = await db.select({ total: s.invoices.totalAmount, contractId: s.invoices.contractId })
    .from(s.invoices).innerJoin(s.contracts, eq(s.contracts.id, s.invoices.contractId))
    .where(eq(s.contracts.unitId, unitId));
  const isFinance = ['admin','finance','operations'].includes(user.role);
  const contractIds = new Set(contractRows.map(x => x.id));
  const effectiveHours = logRows.filter(l => l.status === 'approved').reduce((a, l) => a + Number(l.effectiveHours), 0);
  const breakdownHours = logRows.reduce((a, l) => a + Number(l.breakdownHours), 0);
  const hmVals = logRows.flatMap(l => [Number(l.startHm), Number(l.endHm)]).filter(v => Number.isFinite(v));
  const hmUsed = hmVals.length ? Math.max(...hmVals) - Math.min(...hmVals) : null;
  // Biaya operator tercatat (wet hire): tarif kontrak x jam efektif/hari kerja per kontrak.
  let operatorCost: number | null = null;
  const costByContract = await Promise.all(contractRows.filter(x => x.includeOperator).map(async x => {
    const [c] = await db.select({ rate: s.contracts.operatorRate, type: s.contracts.operatorRateType }).from(s.contracts).where(eq(s.contracts.id, x.id));
    if (!c || !c.rate) return 0;
    const logs = logRows.filter(l => l.contractId === x.id && l.status === 'approved');
    return c.type === 'daily'
      ? new Set(logs.map(l => l.date)).size * Number(c.rate)
      : logs.reduce((a, l) => a + Number(l.effectiveHours), 0) * Number(c.rate);
  }));
  if (isFinance) operatorCost = costByContract.reduce((a, b) => a + b, 0);
  const opMap = new Map<string, { logs: number; hours: number; dates: string[] }>();
  for (const l of logRows) {
    const name = l.driver || l.driverProfile;
    if (!name) continue;
    const cur = opMap.get(name) ?? { logs: 0, hours: 0, dates: [] };
    cur.logs++; cur.hours += Number(l.effectiveHours); cur.dates.push(l.date);
    opMap.set(name, cur);
  }
  return {
    unit: { id: unit.id, unitCode: unit.unitCode, brandModel: unit.brandModel, category: unit.category, year: unit.year, status: unit.status, hourlyRate: unit.hourlyRate, currentLocation: unit.currentLocation, sikoExpiry: unit.sikoExpiry, insuranceExpiry: unit.insuranceExpiry },
    summary: {
      contractCount: contractRows.length, completedCount: contractRows.filter(x => x.status === 'completed').length,
      logCount: logRows.length, workDays: new Set(logRows.map(l => l.date)).size,
      effectiveHours: Math.round(effectiveHours * 100) / 100, breakdownHours: Math.round(breakdownHours * 100) / 100,
      hmUsed, revenue: isFinance ? Math.round(revenueRows.reduce((a, r) => a + Number(r.total), 0) * 100) / 100 : null,
      operatorCost: operatorCost === null ? null : Math.round(operatorCost * 100) / 100,
    },
    operators: Array.from(opMap.entries()).map(([name, v]) => ({ name, logs: v.logs, hours: Math.round(v.hours * 100) / 100, first: v.dates.length ? v.dates[v.dates.length - 1] : null, last: v.dates[0] ?? null }))
      .sort((a, b) => b.hours - a.hours),
    contracts: contractRows.map(x => ({ id: x.id, contractNumber: x.contractNumber, clientName: x.clientName, startDate: x.startDate, endDate: x.endDate, status: x.status, includeOperator: x.includeOperator })),
    recentLogs: logRows.slice(0, 8).map(l => ({ id: `${l.contractId}-${l.date}`, date: l.date, driver: l.driver || l.driverProfile, startHm: String(l.startHm), endHm: String(l.endHm), effectiveHours: String(l.effectiveHours), breakdownHours: String(l.breakdownHours), status: l.status })),
  };
}
export async function deleteOperator(id:string): Promise<ActionResult> {
 try{
  const user=await requireUser(operationRoles);
  if(!UUID_RE.test(id))return {success:false,message:'Operator tidak valid.'};
  const [op]=await db.select({fullName:s.operators.fullName}).from(s.operators).where(eq(s.operators.id,id));
  const [used]=await db.select({n:sql<number>`count(*)`.mapWith(Number)}).from(s.contractOperators).where(eq(s.contractOperators.operatorId,id));
  if(used&&Number(used.n)>0)return {success:false,message:'Operator masih ditugaskan pada kontrak. Nonaktifkan sebagai gantinya.'};
  await db.delete(s.operators).where(eq(s.operators.id,id));
  await logAudit({ actorId: user.id, actorName: user.fullName, action: 'delete', entity: 'operators', entityId: id, summary: `Menghapus operator ${op?.fullName || id}` });
  revalidatePath('/dashboard','layout');return {success:true,message:'Operator berhasil dihapus.'};
 }
 catch{return {success:false,message:'Operator tidak dapat dihapus atau akses tidak diizinkan.'};}
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

// ---------------------------------------------------------------------------
// Template PDF (Pengaturan > Template PDF) — admin-only.
// Blok konten disimpan sebagai JSON agar aman dirender react-pdf
// (paragraf/heading/list/bold, bukan HTML mentah). BAST boleh 2+ halaman
// bila teks kustom panjang: render multi-page otomatis, footer fixed ulang
// tiap halaman. Publish = arsipkan versi published lama + terbitkan baru
// dalam satu transaksi.
// ---------------------------------------------------------------------------
const TEMPLATE_KINDS = ['sph', 'bast', 'invoice', 'perjanjian'] as const;
type TemplateKind = (typeof TEMPLATE_KINDS)[number];
const TEMPLATE_VARS = ['nomor_dokumen','nama_klien','tanggal_dokumen','periode_sewa','tarif_per_jam','jatuh_tempo','total_tagihan','kota','nama_signer','jabatan_signer','nama_pic_klien','daftar_checklist'] as const;

function parseTemplateContent(raw: string): Record<string, unknown> {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { throw new FieldError({ content: 'Isi template harus JSON valid.' }); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new FieldError({ content: 'Isi template harus objek JSON.' });
  const content = parsed as Record<string, unknown>;
  for (const [k, v] of Object.entries(content)) {
    if (typeof v !== 'string') throw new FieldError({ content: `Blok "${k}" harus teks.` });
    if (v.length > 4000) throw new FieldError({ content: `Blok "${k}" melebihi 4000 karakter.` });
    const vars = [...v.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map(m => m[1]);
    for (const name of vars) {
      if (!(TEMPLATE_VARS as readonly string[]).includes(name)) throw new FieldError({ content: `Variabel {{${name}}} tidak dikenal.` });
    }
  }
  if (Object.keys(content).length > 12) throw new FieldError({ content: 'Maksimal 12 blok teks per template.' });
  return content;
}

export async function saveTemplateDraft(kind: string, title: string, contentJson: string): Promise<ActionResult> {
  try {
    const user = await requireUser(['admin']);
    if (!(TEMPLATE_KINDS as readonly string[]).includes(kind)) throw new FieldError({ kind: 'Jenis dokumen tidak valid.' });
    const cleanTitle = title.trim().slice(0, 120);
    if (!cleanTitle) throw new FieldError({ title: 'Judul template wajib diisi.' });
    const content = parseTemplateContent(contentJson);
    const vars = [...new Set(Object.values(content).flatMap(v => [...String(v).matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map(m => m[1])))];
    const [latest] = await db.select({ version: s.documentTemplates.version }).from(s.documentTemplates)
      .where(eq(s.documentTemplates.kind, kind)).orderBy(desc(s.documentTemplates.version)).limit(1);
    const version = (latest?.version ?? 0) + 1;
    await db.insert(s.documentTemplates).values({ kind, version, status: 'draft', title: cleanTitle, content, variables: vars, updatedBy: user.id });
    await logAudit({ actorId: user.id, actorName: user.fullName, action: 'create', entity: 'document_templates', summary: `Draf template ${kind} v${version}` });
    revalidatePath('/dashboard', 'layout');
    return { success: true, message: `Draf template ${kind} v${version} tersimpan.` };
  } catch (e) { return fail(e); }
}

export async function publishTemplate(templateId: string): Promise<ActionResult> {
  try {
    const user = await requireUser(['admin']);
    if (!/^[0-9a-f-]{36}$/i.test(templateId)) throw new FieldError({ id: 'Template tidak ditemukan.' });
    await db.transaction(async tx => {
      const [row] = await tx.select().from(s.documentTemplates).where(eq(s.documentTemplates.id, templateId));
      if (!row) throw new FieldError({ id: 'Template tidak ditemukan.' });
      await tx.update(s.documentTemplates).set({ status: 'archived' })
        .where(and(eq(s.documentTemplates.kind, row.kind), eq(s.documentTemplates.status, 'published')));
      await tx.update(s.documentTemplates).set({ status: 'published', publishedAt: new Date() })
        .where(eq(s.documentTemplates.id, templateId));
    });
    await logAudit({ actorId: user.id, actorName: user.fullName, action: 'publish', entity: 'document_templates', entityId: templateId, summary: 'Menerbitkan template PDF' });
    revalidatePath('/dashboard', 'layout');
    return { success: true, message: 'Template diterbitkan.' };
  } catch (e) { return fail(e); }
}

export async function rollbackTemplate(kind: string, version: number): Promise<ActionResult> {
  try {
    const user = await requireUser(['admin']);
    if (!(TEMPLATE_KINDS as readonly string[]).includes(kind)) throw new FieldError({ kind: 'Jenis dokumen tidak valid.' });
    if (!Number.isInteger(version) || version < 1) throw new FieldError({ version: 'Versi tidak valid.' });
    await db.transaction(async tx => {
      const [row] = await tx.select().from(s.documentTemplates)
        .where(and(eq(s.documentTemplates.kind, kind), eq(s.documentTemplates.version, version)));
      if (!row) throw new FieldError({ version: 'Versi template tidak ditemukan.' });
      await tx.update(s.documentTemplates).set({ status: 'archived' })
        .where(and(eq(s.documentTemplates.kind, kind), eq(s.documentTemplates.status, 'published')));
      await tx.update(s.documentTemplates).set({ status: 'published', publishedAt: new Date() })
        .where(eq(s.documentTemplates.id, row.id));
    });
    await logAudit({ actorId: user.id, actorName: user.fullName, action: 'rollback', entity: 'document_templates', summary: `Rollback template ${kind} ke v${version}` });
    revalidatePath('/dashboard', 'layout');
    return { success: true, message: `Template ${kind} dikembalikan ke v${version}.` };
  } catch (e) { return fail(e); }
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

// ---------------------------------------------------------------------------
// O-A — select async untuk modal (pengganti pengiriman seluruh tabel ke client).
// Opsi referensi (kontrak/unit/klien), riwayat revisi, jam dapat ditagih, dan
// riwayat pembayaran diambil TEPAT saat dibutuhkan — saat modal dibuka atau
// pilihan berubah — bukan dikirim utuh di payload halaman setiap navigasi.
// Semua read-only; otorisasi cukup requireUser() tanpa role khusus karena
// tidak membocorkan data selain yang memang akan ditampilkan di form.
// ---------------------------------------------------------------------------
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type FormOptionsData = {
  contracts: { id: string; contractNumber: string; ratePerHour: string; status: string; clientName: string | null; unitCode: string | null }[];
  clients: { id: string; companyName: string }[];
  fleet: { id: string; unitCode: string; brandModel: string; hourlyRate: string; status: string }[];
  operators?: { id: string; fullName: string; sioClass: string | null; ratePerHour: string; ratePerDay: string; defaultRateType: string }[];
};

export async function getFormOptions(module: string, editingUnitId?: string): Promise<FormOptionsData> {
  await requireUser();
  const empty: FormOptionsData = { contracts: [], clients: [], fleet: [] };
  if (module === 'contracts') {
    const [clients, fleet, operatorRows] = await Promise.all([
      db.select({ id: s.clients.id, companyName: s.clients.companyName }).from(s.clients).orderBy(s.clients.companyName),
      db.select({ id: s.fleet.id, unitCode: s.fleet.unitCode, brandModel: s.fleet.brandModel, hourlyRate: s.fleet.hourlyRate, status: s.fleet.status })
        .from(s.fleet)
        .where(editingUnitId && UUID_RE.test(editingUnitId) ? or(eq(s.fleet.status, 'available'), eq(s.fleet.id, editingUnitId)) : eq(s.fleet.status, 'available'))
        .orderBy(s.fleet.unitCode),
      // FIX: opsi operator wet-hire sebelumnya ada di blok contracts kedua yang
      // unreachable - picker "Pilih operator" selalu kosong.
      db.select({ id: s.operators.id, fullName: s.operators.fullName, sioClass: s.operators.sioClass, ratePerHour: s.operators.ratePerHour, ratePerDay: s.operators.ratePerDay, defaultRateType: s.operators.defaultRateType })
        .from(s.operators).where(eq(s.operators.status, "active")).orderBy(s.operators.fullName),
    ]);
    return { ...empty, clients, fleet, operators: operatorRows };
  }
   
  if (module === 'timesheets' || module === 'bast' || module === 'invoices') {
    const operatorRows2 = await db.select({ id: s.operators.id, fullName: s.operators.fullName, sioClass: s.operators.sioClass, ratePerHour: s.operators.ratePerHour, ratePerDay: s.operators.ratePerDay, defaultRateType: s.operators.defaultRateType }).from(s.operators).where(eq(s.operators.status, 'active')).orderBy(s.operators.fullName);
    // Form kontrak: timesheet/BAST hanya kontrak aktif; invoice boleh semua.
    // LIMIT 100 kontrak terbaru untuk performa (cukup untuk kebanyakan kasus).
    const contracts = await db.select({
      id: s.contracts.id, contractNumber: s.contracts.contractNumber, ratePerHour: s.contracts.ratePerHour, status: s.contracts.status,
      clientName: s.clients.companyName, unitCode: s.fleet.unitCode,
    }).from(s.contracts)
      .leftJoin(s.clients, eq(s.clients.id, s.contracts.clientId))
      .leftJoin(s.fleet, eq(s.fleet.id, s.contracts.unitId))
      .where(module === 'invoices' ? undefined : eq(s.contracts.status, 'active'))
      .orderBy(desc(s.contracts.createdAt))
      .limit(100);
    return { ...empty, contracts, operators: operatorRows2 };
  }
  return empty;
}

export async function getBillableHours(contractId: string): Promise<{ hours: number; operatorAmount: number }> {
  await requireUser();
  if (!UUID_RE.test(contractId)) return { hours: 0, operatorAmount: 0 };
  const rows = await db.select({ h: s.timesheets.effectiveHours, d: s.timesheets.date, op: s.contracts.includeOperator, rateType: s.contracts.operatorRateType, rate: s.contracts.operatorRate }).from(s.timesheets)
    .innerJoin(s.contracts, eq(s.contracts.id, s.timesheets.contractId))
    .where(and(eq(s.timesheets.contractId, contractId), eq(s.timesheets.status, 'approved'), isNull(s.timesheets.invoiceId)));
  const operatorAmount = calcOperatorCost({ includeOperator: !!rows[0]?.op, rateType: (rows[0]?.rateType as 'hourly'|'daily'|null) ?? null, rate: rows[0]?.rate ?? null }, rows.map(r => ({ effectiveHours: r.h ?? 0, date: r.d })));
  return { hours: rows.reduce((a, r) => a + Number(r.h ?? 0), 0), operatorAmount };
}

export async function getRevisionHistory(contractId: string): Promise<{ id: string; revisionNumber: number; createdAt: Date; prevRate: string; newRate: string; reason: string }[]> {
  await requireUser();
  if (!UUID_RE.test(contractId)) return [];
  return db.select({ id: s.contractRevisions.id, revisionNumber: s.contractRevisions.revisionNumber, createdAt: s.contractRevisions.createdAt, prevRate: s.contractRevisions.prevRate, newRate: s.contractRevisions.newRate, reason: s.contractRevisions.reason })
    .from(s.contractRevisions).where(eq(s.contractRevisions.contractId, contractId)).orderBy(desc(s.contractRevisions.revisionNumber));
}

export async function getInvoicePayments(invoiceId: string) {
  await requireUser();
  if (!UUID_RE.test(invoiceId)) return [];
  return db.select().from(s.payments).where(eq(s.payments.invoiceId, invoiceId)).orderBy(desc(s.payments.paidAt), desc(s.payments.createdAt));
}

// ---------------------------------------------------------------------------
// Media layer — foto FLEET (docs/media-architecture.md).
// Binary: browser → (presigned PUT) → Cloudflare R2 langsung. Server Action
// hanya orkestrasi metadata `media_files` + koordinasi Media API Worker.
// Foto BAST sengaja TIDAK disentuh: masih dilayani Supabase Storage
// `bast-photos` (migration 0012) — tanpa regresi fitur BAST (audit §52).
// ---------------------------------------------------------------------------
const MEDIA_UPLOAD_ROLES = ['admin', 'operations', 'operator'];
const MEDIA_DELETE_ROLES = ['admin', 'operations'];
const MEDIA_CATEGORIES = ['cover', 'gallery'] as const;
const MEDIA_MIME_EXT: Record<string, string> = { 'image/webp': '.webp', 'image/png': '.png', 'image/jpeg': '.jpg' };

export type FleetMediaItem = { id: string; url: string | null; originalName: string | null };
export type FleetMediaData = { cover: FleetMediaItem | null; gallery: FleetMediaItem[] };
export type MediaUploadResult = { success: boolean; message: string; data?: MediaUploadTicket };

export async function getFleetMedia(fleetId: string): Promise<FleetMediaData> {
  await requireUser();
  if (!UUID_RE.test(fleetId)) return { cover: null, gallery: [] };
  const rows = await db.select().from(s.mediaFiles)
    .where(and(eq(s.mediaFiles.entityType, 'fleet'), eq(s.mediaFiles.entityId, fleetId), eq(s.mediaFiles.status, 'active')))
    .orderBy(desc(s.mediaFiles.createdAt));
  if (!rows.length) return { cover: null, gallery: [] };
  const cover = rows.find(r => r.category === 'cover') ?? null;
  const galleryRows = rows.filter(r => r.category === 'gallery').reverse(); // termuda di depan
  // Signed URL ber-TTL pendek per item (private read, doc §21/§36). Kegagalan
  // satu item TIDAK menggagalkan seluruh form — item itu tampil tanpa pratinjau.
  const signed = await Promise.all([...(cover ? [cover] : []), ...galleryRows].map(async row => {
    if (!isMediaConfigured()) return null;
    try { return (await getMediaSignedUrl(row.id)).url; } catch { return null; }
  }));
  let i = 0;
  const urlOf = () => signed[i++];
  return {
    cover: cover ? { id: cover.id, url: urlOf(), originalName: cover.originalName } : null,
    gallery: galleryRows.map(r => ({ id: r.id, url: urlOf(), originalName: r.originalName })),
  };
}

export async function requestFleetPhotoUpload(
  entityId: string,
  category: string,
  mimeType: string,
  size: number,
  width: number,
  height: number,
  originalName: string,
): Promise<MediaUploadResult> {
  let mediaId: string | null = null;
  try {
    const user = await requireUser(MEDIA_UPLOAD_ROLES);
    if (!isMediaConfigured()) return { success: false, message: 'Fitur foto belum tersedia (layanan media belum dikonfigurasi).' };
    if (!UUID_RE.test(entityId)) return { success: false, message: 'Unit tidak ditemukan.' };
    if (!MEDIA_CATEGORIES.includes(category as (typeof MEDIA_CATEGORIES)[number])) return { success: false, message: 'Kategori foto tidak valid.' };
    const ext = MEDIA_MIME_EXT[mimeType];
    if (!ext) return { success: false, message: 'Jenis berkas tidak didukung (hanya JPEG, PNG, atau WebP).' };
    if (!Number.isInteger(size) || size < 1 || size > 2 * 1024 * 1024) return { success: false, message: 'Ukuran foto melebihi batas (maks 2 MB hasil kompresi).' };
    const [unit] = await db.select({ id: s.fleet.id, unitCode: s.fleet.unitCode }).from(s.fleet).where(eq(s.fleet.id, entityId));
    if (!unit) return { success: false, message: 'Unit tidak ditemukan.' };
    // Baris metadata dibuat duluan (status pending) — doc §18; object key
    // memakai media ID acak, filename asli hanya metadata (doc §28).
    mediaId = crypto.randomUUID();
    await db.insert(s.mediaFiles).values({
      id: mediaId,
      entityType: 'fleet',
      entityId,
      category,
      objectKey: `fleet/${entityId}/${category}/${mediaId}${ext}`,
      mimeType,
      sizeBytes: size,
      width: Number.isFinite(width) && width > 0 ? Math.floor(width) : null,
      height: Number.isFinite(height) && height > 0 ? Math.floor(height) : null,
      originalName: originalName.slice(0, 255) || null,
      status: 'pending',
      createdBy: user.id,
    });
    const ticket = await requestMediaUploadUrl({
      mediaId,
      entityType: 'fleet',
      entityId,
      category,
      mimeType,
      size,
      objectKey: `fleet/${entityId}/${category}/${mediaId}${ext}`,
    });
    return { success: true, message: '', data: ticket };
  } catch (e) {
    // Orphan (doc §18): Worker menolak → baris pending ditandai failed.
    if (mediaId) {
      try {
        await db.update(s.mediaFiles).set({ status: 'failed', updatedAt: new Date() })
          .where(and(eq(s.mediaFiles.id, mediaId), eq(s.mediaFiles.status, 'pending')));
      } catch { console.error('[media] gagal menandai baris pending sebagai failed', e); }
    }
    if (e instanceof MediaApiError) return { success: false, message: e.message };
    return { success: false, message: e instanceof Error ? e.message : 'Tidak dapat memulai unggahan. Coba lagi.' };
  }
}

export async function completeFleetPhotoUpload(mediaId: string): Promise<ActionResult> {
  try {
    const user = await requireUser(MEDIA_UPLOAD_ROLES);
    if (!isMediaConfigured()) return { success: false, message: 'Fitur foto belum tersedia (layanan media belum dikonfigurasi).' };
    if (!UUID_RE.test(mediaId)) return { success: false, message: 'Media tidak ditemukan.' };
    // Worker memverifikasi: object exists, size cocok, content-type, magic bytes
    // (doc §17) — metadata baru diaktifkan setelah verifikasi lulus.
    await completeMediaUpload(mediaId);
    let retiredId: string | null = null;
    let unitCode = '';
    let category = '';
    await db.transaction(async tx => {
      const [row] = await tx.select().from(s.mediaFiles).where(eq(s.mediaFiles.id, mediaId)).for('update');
      if (!row) throw new MediaApiError('MEDIA_NOT_FOUND', 'Media tidak ditemukan.');
      if (row.status !== 'pending') throw new MediaApiError('MEDIA_NOT_PENDING', 'Media ini sudah diproses. Muat ulang halaman.');
      await tx.update(s.mediaFiles).set({ status: 'active', updatedAt: new Date() }).where(eq(s.mediaFiles.id, mediaId));
      category = row.category;
      const [unit] = await tx.select({ unitCode: s.fleet.unitCode }).from(s.fleet).where(eq(s.fleet.id, row.entityId));
      unitCode = unit?.unitCode ?? row.entityId;
      // Ganti cover (doc §20): baru active DULU; cover lama di-retire kemudian.
      if (row.category === 'cover') {
        const [old] = await tx.select().from(s.mediaFiles)
          .where(and(
            eq(s.mediaFiles.entityType, 'fleet'),
            eq(s.mediaFiles.entityId, row.entityId),
            eq(s.mediaFiles.category, 'cover'),
            eq(s.mediaFiles.status, 'active'),
            ne(s.mediaFiles.id, mediaId),
          ))
          .orderBy(desc(s.mediaFiles.createdAt)).limit(1);
        if (old) {
          retiredId = old.id;
          await tx.update(s.mediaFiles).set({ status: 'deleted', updatedAt: new Date() }).where(eq(s.mediaFiles.id, old.id));
        }
      }
    });
    // Cleanup object cover lama (best-effort; bila gagal, barisnya sudah
    // 'deleted' dan menjadi input reconciler — doc §18/§19).
    if (retiredId) {
      try { await deleteMediaObject(retiredId); }
      catch (e) { console.error('[media] cleanup object cover lama gagal (menunggu reconciler)', e); }
    }
    await logAudit({ actorId: user.id, actorName: user.fullName, action: 'upload', entity: 'media', entityId: mediaId, summary: `Mengunggah foto ${category} unit ${unitCode}` });
    revalidatePath('/dashboard', 'layout');
    return { success: true, message: 'Foto berhasil disimpan.' };
  } catch (e) {
    if (e instanceof MediaApiError) {
      if (e.code !== 'MEDIA_NOT_PENDING') {
        try {
          await db.update(s.mediaFiles).set({ status: 'failed', updatedAt: new Date() })
            .where(and(eq(s.mediaFiles.id, mediaId), eq(s.mediaFiles.status, 'pending')));
        } catch { /* status dipertahankan; reconciler yang membersihkan */ }
      }
      return { success: false, message: e.message };
    }
    return fail(e);
  }
}

export async function deleteFleetPhoto(mediaId: string): Promise<ActionResult> {
  try {
    const user = await requireUser(MEDIA_DELETE_ROLES);
    if (!isMediaConfigured()) return { success: false, message: 'Fitur foto belum tersedia (layanan media belum dikonfigurasi).' };
    if (!UUID_RE.test(mediaId)) return { success: false, message: 'Foto tidak ditemukan.' };
    const [row] = await db.select().from(s.mediaFiles).where(eq(s.mediaFiles.id, mediaId));
    if (!row || row.entityType !== 'fleet' || row.status === 'deleted') return { success: false, message: 'Foto tidak ditemukan.' };
    // Worker memverifikasi otorisasi + kepemilikan lalu menghapus object (doc §19).
    await deleteMediaObject(mediaId);
    await db.update(s.mediaFiles).set({ status: 'deleted', updatedAt: new Date() }).where(and(eq(s.mediaFiles.id, mediaId), ne(s.mediaFiles.status, 'deleted')));
    const [unit] = await db.select({ unitCode: s.fleet.unitCode }).from(s.fleet).where(eq(s.fleet.id, row.entityId));
    await logAudit({ actorId: user.id, actorName: user.fullName, action: 'delete', entity: 'media', entityId: mediaId, summary: `Menghapus foto ${row.category} unit ${unit?.unitCode ?? row.entityId}` });
    revalidatePath('/dashboard', 'layout');
    return { success: true, message: 'Foto berhasil dihapus.' };
  } catch (e) {
    if (e instanceof MediaApiError) return { success: false, message: e.message };
    return fail(e);
  }
}
