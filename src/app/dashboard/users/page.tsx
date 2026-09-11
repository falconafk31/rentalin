import { getUsersData, getBannedMap } from '@/lib/data';
import { UsersWorkspace, AccessDenied } from '@/components/admin-workspace';

export default async function UsersPage() {
  // O-A: data ramping (user + profiles saja) — bukan seluruh workspace.
  const data = await getUsersData();
  if (data.user.role !== 'admin') return <AccessDenied />;
  const banned = await getBannedMap();
  return <UsersWorkspace data={data} banned={banned} />;
}
