import { getWorkspaceData } from '@/lib/data';
import { Shell } from '@/components/shell';
export const dynamic='force-dynamic';
export default async function DashboardLayout({children}:{children:React.ReactNode}){const data=await getWorkspaceData();return <Shell data={data}>{children}</Shell>;}
