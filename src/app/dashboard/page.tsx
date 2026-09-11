import { getWorkspaceData } from '@/lib/data';
import { Overview } from '@/components/overview';
export default async function DashboardPage(){return <Overview data={await getWorkspaceData()}/>;}
