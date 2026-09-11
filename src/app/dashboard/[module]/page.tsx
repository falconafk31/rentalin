import { notFound } from 'next/navigation';
import { getWorkspaceData } from '@/lib/data';
import { ModuleWorkspace } from '@/components/module-workspace';
export default async function ModulePage({params,searchParams}:{params:Promise<{module:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){const {module}=await params;if(!['fleet','clients','contracts','timesheets','bast','invoices','settings'].includes(module))notFound();const search=await searchParams;return <ModuleWorkspace module={module} data={await getWorkspaceData()} initialQuery={typeof search.q==='string'?search.q:''} initialStatus={typeof search.status==='string'?search.status:'all'} initialOpen={search.new==='1'} expiringOnly={search.filter==='expiring'}/>;}
