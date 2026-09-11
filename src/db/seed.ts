import { db } from '@/db';
import * as s from '@/db/schema';
import { sql } from 'drizzle-orm';
import { demoId, isPreview } from '@/lib/auth';
export async function seedPreview() {
 if (!isPreview()) return;
 await db.transaction(async tx => {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(3847301)`);
  if ((await tx.select().from(s.clients).limit(1)).length) return;
  const now = new Date();
  const date = (delta:number) => {const d = new Date(now);d.setDate(d.getDate()+delta);return d.toISOString().slice(0,10);};
  await tx.insert(s.profiles).values({id:demoId,fullName:'Aditya Pratama',role:'admin'}).onConflictDoNothing();
  await tx.insert(s.companySettings).values({id:'main',companyName:'PT Penyewaan Alat Berat',address:'Jl. Jenderal Sudirman No. 28, Jakarta Selatan 12190',email:'operasional@heavyops.id',phone:'+62 21 555 0128'}).onConflictDoNothing();
  const companies = ['PT Wijaya Karya','PT Adhi Karya','PT Pembangunan Perumahan','PT Hutama Karya','PT Waskita Karya','PT Bumi Karsa','PT Total Bangun Persada','PT Nindya Karya'];
  const names = ['Budi Santoso','Rina Wulandari','Agus Setiawan','Dewi Lestari','Hendra Wijaya','Siti Rahmawati','Dimas Saputra','Fajar Nugroho'];
  const customers = await tx.insert(s.clients).values(companies.map((companyName,i)=>({companyName,picName:names[i],picPhone:`0812-3456-${7800+i}`,picEmail:`pengadaan@${['wika','adhi','ptpp','hutamakarya','waskita','bumikarsa','totalbp','nindyakarya'][i]}.co.id`,address:'Jl. Jenderal Sudirman, Jakarta',npwp:`01.234.567.${800+i}-000`}))).returning();
  const models = ['Komatsu PC200-8','Caterpillar D6R','Sakai SV512D','Kobelco SK200','Tadano GR-500EX','Hitachi ZX210','Komatsu WA380','Caterpillar 320D'];
  const categories = ['Ekskavator','Buldozer','Vibro Roller','Ekskavator','Crane','Ekskavator','Wheel Loader','Ekskavator'];
  const codes = ['EXC','BDZ','VBR','EXC','CRN','EXC','WLD','EXC'];
  const status = ['renting','renting','available','maintenance','in_transit',...Array(16).fill('renting'),'available','available','maintenance'];
  const locations = ['Proyek Tol Cisumdawu','Proyek IKN, Kalimantan','Pool Cakung, Jakarta','Bengkel Utama','Dalam perjalanan','Proyek LRT Jakarta','Proyek Bendungan Bener','Proyek Tol Trans Sumatra'];
  const units = await tx.insert(s.fleet).values(status.map((st,i)=>({unitCode:`${codes[i%8]}-${String(i+1).padStart(3,'0')}`,category:categories[i%8],brandModel:models[i%8],year:2020+i%5,status:st,currentLocation:locations[i%8],hourlyRate:String(350000+(i%5)*50000),sikoExpiry:date(i<3?12+i*5:90+i),insuranceExpiry:date(i===3?25:180+i)}))).returning();
  const rented = units.filter(u=>u.status==='renting');
  const agreements = await tx.insert(s.contracts).values(rented.map((u,i)=>({contractNumber:`KTR/${now.getFullYear()}/${String(i+1).padStart(3,'0')}`,clientId:customers[i%8].id,unitId:u.id,startDate:date(-45),endDate:date(45+i*3),ratePerHour:u.hourlyRate,status:'active'}))).returning();
  await tx.insert(s.timesheets).values(agreements.slice(0,8).flatMap((c,i)=>[0,1,2].map(j=>({contractId:c.id,unitId:c.unitId,operatorId:demoId,date:date(-j-1),startHm:String(1200+i*100+j*8),endHm:String(1208+i*100+j*8),breakdownHours:i===2?'1':'0',status:j===0?'pending':'approved',notes:'Pekerjaan operasional sesuai jadwal.'}))));
  const totals = [128000000,156000000,142500000,195000000,211500000,248500000];
  await tx.insert(s.invoices).values(totals.flatMap((total,i)=>Array.from({length:i===5?8:2},(_,j)=>{const d = new Date(now.getFullYear(),now.getMonth()-5+i,5+j*2); const due = new Date(d);due.setDate(due.getDate()+30);const amount=total/(i===5?8:2);const tax=amount*11/111;return {invoiceNumber:`INV/${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(j+1).padStart(3,'0')}`,contractId:agreements[j%agreements.length].id,subtotalAmount:(amount-tax).toFixed(2),totalAmount:amount.toFixed(2),taxAmount:tax.toFixed(2),taxRate:'11',status:i===5?(j===0?'overdue':'unpaid'):'paid',issueDate:d.toISOString().slice(0,10),dueDate:due.toISOString().slice(0,10)};})));
  await tx.insert(s.handovers).values({documentNumber:`BAST/${now.getFullYear()}/001`,contractId:agreements[0].id,type:'mobilization',date:date(-5),engine:true,hydraulics:true,tracks:true,notes:'Unit diterima dalam kondisi baik dan siap beroperasi.'});
 });
}
