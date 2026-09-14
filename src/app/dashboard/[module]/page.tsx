import { notFound } from 'next/navigation';
import { getModulePage } from '@/lib/data';
import { getFormOptions } from '@/app/actions';
import { ModuleWorkspace } from '@/components/module-workspace';
// O-A: halaman modul mengeksekusi query per modul (WHERE/LIMIT/OFFSET) dengan
// filter dari URL — pencarian (?q), status (?status), kategori (?category),
// sort (?sort), halaman (?page), banner dokumen (?filter=expiring), modal (?new=1).
export default async function ModulePage({params,searchParams}:{params:Promise<{module:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const {module}=await params;
  const search=await searchParams;
  const val=(k:string)=>typeof search[k]==='string'?(search[k] as string):undefined;
  const filters={
    q:(val('q')||'').slice(0,100),
    status:val('status')||'all',
    category:val('category')||'all',
    expiringOnly:val('filter')==='expiring',
    page:Number(val('page'))||1,
    sort:val('sort')==='1'?1:val('sort')==='-1'?-1:0,
  };
  const data=await getModulePage(module,filters);
  if(!data)notFound();
  // ?new=1 membuka modal langsung — opsi referensi form (select async) disiapkan
  // server saat ini agar modal tidak menggantung tanpa data.
  const initialOpen=search.new==='1';
  const initialOptions=initialOpen&&['contracts','timesheets','bast','invoices'].includes(module)?await getFormOptions(module):null;
  return <ModuleWorkspace module={module} data={data} filters={data.filters} initialOpen={initialOpen} initialOptions={initialOptions}/>;
}
