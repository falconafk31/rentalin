'use server';
import { db } from '@/db';
import * as s from '@/db/schema';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { requireUser, createAuthClient, isConfigured } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { todayISO } from '@/lib/format';
const operationRoles = ['admin','operations'];
const text = (f:FormData,k:string) => String(f.get(k)||'').trim();
const required = (f:FormData,k:string) => {const v=text(f,k);if(!v)throw new Error('Lengkapi seluruh kolom wajib.');return v;};
const number = (f:FormData,k:string,min=0) => {const n=Number(required(f,k));if(!Number.isFinite(n)||n<min)throw new Error('Nilai angka tidak valid.');return n;};
const validDate = (f:FormData,k:string) => {const v=required(f,k);if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||isNaN(Date.parse(v)))throw new Error('Tanggal tidak valid.');return v;};
const documentNumber = (prefix:string) => `${prefix}/${new Date().getFullYear()}/${Date.now().toString().slice(-8)}-${crypto.randomUUID().slice(0,4).toUpperCase()}`;
export async function saveRecord(module:string,form:FormData):Promise<{success:boolean;message:string}> {
 try {
  const roles = module==='invoices'?['admin','finance']:module==='timesheets'?['admin','operations','operator']:module==='settings'?['admin']:operationRoles;
  const user = await requireUser(roles);
  const id = text(form,'id');
  if(module==='fleet') {
   const status=required(form,'status');
   if(!['available','renting','maintenance','in_transit'].includes(status))throw new Error('Status unit tidak valid.');
   const values={unitCode:required(form,'unitCode'),category:required(form,'category'),brandModel:required(form,'brandModel'),year:number(form,'year',1900),status,currentLocation:text(form,'currentLocation'),hourlyRate:String(number(form,'hourlyRate',1)),sikoExpiry:text(form,'sikoExpiry')||null,insuranceExpiry:text(form,'insuranceExpiry')||null};
   if(values.year>new Date().getFullYear()+1)throw new Error('Tahun unit tidak valid.');
   await db.transaction(async tx=>{
    if(id){await tx.select().from(s.fleet).where(eq(s.fleet.id,id)).for('update');const active=await tx.select().from(s.contracts).where(and(eq(s.contracts.unitId,id),eq(s.contracts.status,'active')));if(active.length&&status!=='renting')throw new Error('Unit masih terikat kontrak aktif. Selesaikan kontrak terlebih dahulu.');await tx.update(s.fleet).set(values).where(eq(s.fleet.id,id));}
    else {if(status==='renting')throw new Error('Buat kontrak untuk menetapkan unit sebagai disewa.');await tx.insert(s.fleet).values(values);}
   });
  } else if(module==='clients') {
   const email=text(form,'picEmail');if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('Alamat surel tidak valid.');
   const values={companyName:required(form,'companyName'),picName:required(form,'picName'),npwp:text(form,'npwp'),address:text(form,'address'),picPhone:text(form,'picPhone'),picEmail:email};
   if(id)await db.update(s.clients).set(values).where(eq(s.clients.id,id));else await db.insert(s.clients).values(values);
  } else if(module==='contracts') {
   const unitId=required(form,'unitId'),startDate=validDate(form,'startDate'),endDate=validDate(form,'endDate');
   if(endDate<startDate)throw new Error('Tanggal selesai harus setelah tanggal mulai.');
   await db.transaction(async tx=>{
    const [unit]=await tx.select().from(s.fleet).where(eq(s.fleet.id,unitId)).for('update');
    if(!unit||unit.status!=='available')throw new Error('Unit tidak tersedia. Pilih unit lain.');
    await tx.insert(s.contracts).values({contractNumber:text(form,'contractNumber')||documentNumber('KTR'),clientId:required(form,'clientId'),unitId,startDate,endDate,ratePerHour:String(number(form,'ratePerHour',1)),status:'active'});
    await tx.update(s.fleet).set({status:'renting'}).where(eq(s.fleet.id,unitId));
   });
  } else if(module==='timesheets') {
   const contractId=required(form,'contractId');
   const [contract]=await db.select().from(s.contracts).where(eq(s.contracts.id,contractId));
   if(!contract||contract.status!=='active')throw new Error('Kontrak tidak aktif.');
   const date=validDate(form,'date'),startHm=number(form,'startHm'),endHm=number(form,'endHm'),breakdownHours=number(form,'breakdownHours');
   if(date>todayISO()||date<contract.startDate||date>contract.endDate)throw new Error('Tanggal harus berada dalam periode kontrak dan tidak boleh di masa depan.');
   if(endHm<startHm||endHm-startHm>24||breakdownHours>endHm-startHm)throw new Error('Periksa HM akhir dan durasi kerusakan. Jam kerja maksimal 24 jam.');
   await db.insert(s.timesheets).values({contractId,unitId:contract.unitId,operatorId:user.id,date,startHm:String(startHm),endHm:String(endHm),breakdownHours:String(breakdownHours),notes:text(form,'notes'),status:'pending'});
  } else if(module==='bast') {
   const type=required(form,'type');if(!['mobilization','demobilization'].includes(type))throw new Error('Jenis serah terima tidak valid.');
   await db.insert(s.handovers).values({documentNumber:documentNumber('BAST'),contractId:required(form,'contractId'),type,date:validDate(form,'date'),engine:form.get('engine')==='on',hydraulics:form.get('hydraulics')==='on',tracks:form.get('tracks')==='on',notes:text(form,'notes')});
  } else if(module==='invoices') {
   const contractId=required(form,'contractId');
   const dueDate=validDate(form,'dueDate');if(dueDate<todayISO())throw new Error('Jatuh tempo tidak boleh sebelum tanggal penerbitan.');
   await db.transaction(async tx=>{
    const [contract]=await tx.select().from(s.contracts).where(eq(s.contracts.id,contractId)).for('update');
    if(!contract)throw new Error('Kontrak tidak ditemukan.');
    const logs=await tx.select().from(s.timesheets).where(and(eq(s.timesheets.contractId,contractId),eq(s.timesheets.status,'approved'),isNull(s.timesheets.invoiceId))).for('update');
    if(!logs.length)throw new Error('Tidak ada jam kerja disetujui yang belum ditagihkan.');
    const hours=logs.reduce((a,l)=>a+Number(l.effectiveHours),0);
    const subtotal=Math.round(hours*Number(contract.ratePerHour)*100)/100;
    if(subtotal<=0)throw new Error('Total jam efektif harus lebih dari nol.');
    const tax=Math.round(subtotal*0.11*100)/100;
    const [invoice]=await tx.insert(s.invoices).values({invoiceNumber:documentNumber('INV'),contractId,totalAmount:(subtotal+tax).toFixed(2),taxAmount:tax.toFixed(2),status:'unpaid',issueDate:todayISO(),dueDate}).returning();
    for(const log of logs)await tx.update(s.timesheets).set({invoiceId:invoice.id}).where(eq(s.timesheets.id,log.id));
   });
  } else if(module==='settings') {
   await db.insert(s.companySettings).values({id:'main',companyName:required(form,'companyName'),address:required(form,'address'),email:required(form,'email'),phone:required(form,'phone')}).onConflictDoUpdate({target:s.companySettings.id,set:{companyName:required(form,'companyName'),address:required(form,'address'),email:required(form,'email'),phone:required(form,'phone')}});
  } else throw new Error('Modul tidak ditemukan.');
  revalidatePath('/dashboard','layout');return {success:true,message:module==='invoices'?'Tagihan berhasil dibuat dari jam kerja yang disetujui.':'Data berhasil disimpan.'};
 }catch(error){const e=error as Error & {code?:string;cause?:{code?:string}};if(e.message?.includes('NEXT_REDIRECT'))throw error;const code=e.code||e.cause?.code;return {success:false,message:code==='23505'?'Data sudah terdaftar. Periksa nomor unit atau tanggal catatan.':code==='23503'?'Data terkait tidak ditemukan atau masih digunakan.':code?'Data tidak dapat disimpan. Periksa kembali isian Anda.':e.message||'Terjadi kesalahan. Silakan coba kembali.'};}
}
export async function changeStatus(module:string,id:string,status:string) {
 try {
  await requireUser(module==='invoices'?['admin','finance']:operationRoles);
  if(module==='timesheets'&&['approved','rejected'].includes(status)){
   const updated=await db.update(s.timesheets).set({status}).where(and(eq(s.timesheets.id,id),eq(s.timesheets.status,'pending'),isNull(s.timesheets.invoiceId))).returning();if(!updated.length)throw new Error('Catatan ini sudah diproses.');
  }else if(module==='invoices'&&status==='paid')await db.update(s.invoices).set({status}).where(eq(s.invoices.id,id));
  else if(module==='contracts'&&status==='completed')await db.transaction(async tx=>{const [c]=await tx.select().from(s.contracts).where(eq(s.contracts.id,id)).for('update');if(!c||c.status!=='active')throw new Error('Kontrak tidak aktif.');await tx.update(s.contracts).set({status}).where(eq(s.contracts.id,id));await tx.update(s.fleet).set({status:'available'}).where(eq(s.fleet.id,c.unitId));});
  else throw new Error('Tindakan tidak diizinkan.');
  revalidatePath('/dashboard','layout');return {success:true,message:'Status berhasil diperbarui.'};
 }catch(e){return {success:false,message:(e as Error).message};}
}
export async function deleteClient(id:string) {
 try{await requireUser(operationRoles);await db.delete(s.clients).where(eq(s.clients.id,id));revalidatePath('/dashboard','layout');return {success:true,message:'Data klien berhasil dihapus.'};}
 catch{return {success:false,message:'Klien tidak dapat dihapus karena masih memiliki kontrak atau akses tidak diizinkan.'};}
}
export async function signIn(form:FormData) {
 if(!isConfigured())return {success:false,message:'Autentikasi Supabase belum dikonfigurasi. Hubungi administrator.'};
 const auth=await createAuthClient();const {error}=await auth.auth.signInWithPassword({email:text(form,'email'),password:text(form,'password')});
 if(error)return {success:false,message:'Surel atau kata sandi tidak sesuai.'};
 redirect('/dashboard');
}
export async function signOut(){if(isConfigured()){const auth=await createAuthClient();await auth.auth.signOut();}redirect('/login');}
